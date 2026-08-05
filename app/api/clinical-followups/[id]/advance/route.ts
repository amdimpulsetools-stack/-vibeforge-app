import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import type { ContactEvent } from "@/types/fertility";
import { assertActiveMembership } from "@/lib/followups/org-scope";

export const runtime = "nodejs";

/**
 * POST /api/clinical-followups/[id]/advance
 *
 * Avanza el estado de un seguimiento dentro del flujo de cascada de
 * 3 intentos del Pack Fertilidad. La obstetra ejecuta una de las 4
 * acciones desde el card en `/scheduler/follow-ups`:
 *
 *   - mark_contacted        → primer contacto (sin decisión todavía)
 *   - pospuesto              → paciente pidió más tiempo, reagendar
 *   - agendado               → paciente agendó cita (cierra atribuido)
 *   - cerrar_sin_respuesta   → cierre manual como desistido_silencioso
 *
 * Reglas:
 *   - Rechaza si el seguimiento ya está cerrado (closed_at IS NOT NULL).
 *   - `mark_contacted` solo desde status `pendiente` o `pospuesto`.
 *     Setea `first_contact_at = NOW()` solo si era NULL (preserva el
 *     primer contacto para la atribución honesta).
 *   - `pospuesto`: si `attempt_count + 1 > max_attempts`, fuerza
 *     `desistido_silencioso` y devuelve `auto_closed: true` para que
 *     la UI muestre el toast "Cerrado automáticamente — alcanzó intento
 *     máximo".
 *   - Append a `contact_events` (JSONB del propio row) con la acción
 *     ejecutada. NO existe tabla separada — `contact_events` es un
 *     campo del propio `clinical_followups` (mig 128).
 *
 * Defense-in-depth: la org se deriva del propio seguimiento y se exige
 * membresía activa en ELLA, replicando el patrón de los otros endpoints
 * en este folder (ver lib/followups/org-scope.ts).
 */
const advanceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("mark_contacted"),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal("pospuesto"),
    next_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "next_date debe ser YYYY-MM-DD"),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal("agendado"),
    appointment_id: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    kind: z.literal("cerrar_sin_respuesta"),
    notes: z.string().max(500).optional(),
  }),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = advanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: current, error: curErr } = await supabase
    .from("clinical_followups")
    .select(
      "id, organization_id, status, first_contact_at, attempt_count, max_attempts, contact_events, closed_at"
    )
    .eq("id", id)
    .single();
  if (curErr || !current) {
    return NextResponse.json(
      { error: "Seguimiento no encontrado" },
      { status: 404 }
    );
  }

  const denied = await assertActiveMembership(
    supabase,
    user.id,
    current.organization_id
  );
  if (denied) return denied;
  const organizationId = current.organization_id;

  if (current.closed_at) {
    return NextResponse.json(
      { error: "El seguimiento ya está cerrado" },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const events: ContactEvent[] = Array.isArray(current.contact_events)
    ? (current.contact_events as unknown as ContactEvent[])
    : [];

  const update: Record<string, unknown> = {};
  let autoClosed = false;
  const action = parsed.data;

  switch (action.kind) {
    case "mark_contacted": {
      if (current.status !== "pendiente" && current.status !== "pospuesto") {
        return NextResponse.json(
          {
            error:
              "Solo se puede marcar contactado desde un seguimiento pendiente o pospuesto",
          },
          { status: 409 }
        );
      }
      update.status = "contactado";
      update.last_contacted_at = now;
      update.contacted_by = user.id;
      // Mismo efecto que PATCH /contact: los dos botones de contacto de
      // la card ("Contactado" azul y "Contactada" de la cascada) tienen
      // que dejar el mismo rastro, o el chip "Intento N/M" se
      // desincroniza según por cuál pasó la asesora.
      update.attempt_count = (current.attempt_count ?? 0) + 1;
      if (!current.first_contact_at) {
        update.first_contact_at = now;
      }
      const event: ContactEvent = {
        type: "manual_contacted",
        at: now,
        by_user_id: user.id,
        delivery_status: "sent",
        reason: action.notes,
      };
      update.contact_events = [...events, event];
      break;
    }
    case "pospuesto": {
      const nextAttempt = (current.attempt_count ?? 0) + 1;
      const max = current.max_attempts ?? 3;
      if (nextAttempt > max) {
        // Overflow: forzamos desistido_silencioso para no quedar en
        // limbo. La UI muestra "Cerrado automáticamente — alcanzó
        // intento máximo".
        update.status = "desistido_silencioso";
        update.closure_reason = "desistido_silencioso";
        update.closed_at = now;
        update.is_resolved = true;
        update.resolved_at = now;
        update.resolved_by = user.id;
        autoClosed = true;
        const event: ContactEvent = {
          type: "manual_close",
          at: now,
          by_user_id: user.id,
          delivery_status: "unknown",
          reason:
            "Auto-cierre: se intentó posponer pero ya se alcanzó el máximo de intentos.",
        };
        update.contact_events = [...events, event];
      } else {
        update.status = "pospuesto";
        update.attempt_count = nextAttempt;
        // Reagendar es haber hablado con la paciente: también cede el
        // puesto en la cola de trabajo del bucket Pendientes, que ordena
        // por `last_contacted_at`.
        update.last_contacted_at = now;
        update.contacted_by = user.id;
        update.follow_up_date = action.next_date;
        update.expected_by = action.next_date;
        update.snooze_until = action.next_date;
        const event: ContactEvent = {
          type: "manual_contacted",
          at: now,
          by_user_id: user.id,
          delivery_status: "sent",
          reason: action.notes
            ? `Pospuesto a ${action.next_date}: ${action.notes}`
            : `Pospuesto a ${action.next_date}`,
        };
        update.contact_events = [...events, event];
      }
      break;
    }
    case "agendado": {
      update.status = "agendado_via_contacto";
      update.closure_reason = "agendado_via_contacto";
      update.closed_at = now;
      update.is_resolved = true;
      update.resolved_at = now;
      update.resolved_by = user.id;
      if (!current.first_contact_at) {
        update.first_contact_at = now;
      }
      const event: ContactEvent = {
        type: "manual_contacted",
        at: now,
        by_user_id: user.id,
        delivery_status: "sent",
        reason: action.appointment_id
          ? `Agendó cita ${action.appointment_id}`
          : action.notes ?? "Agendó cita",
      };
      update.contact_events = [...events, event];
      break;
    }
    case "cerrar_sin_respuesta": {
      update.status = "desistido_silencioso";
      update.closure_reason = "desistido_silencioso";
      update.closed_at = now;
      update.is_resolved = true;
      update.resolved_at = now;
      update.resolved_by = user.id;
      const event: ContactEvent = {
        type: "manual_close",
        at: now,
        by_user_id: user.id,
        delivery_status: "unknown",
        reason: action.notes ?? "Cerrado sin respuesta tras agotar intentos",
      };
      update.contact_events = [...events, event];
      break;
    }
  }

  const { data, error } = await supabase
    .from("clinical_followups")
    .update(update)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select("*, doctors(full_name), patients(first_name, last_name, phone)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json(
      { error: "Seguimiento no encontrado" },
      { status: 404 }
    );

  return NextResponse.json({ data, auto_closed: autoClosed });
}
