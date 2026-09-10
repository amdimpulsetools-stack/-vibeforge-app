import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { assertActiveMembership } from "@/lib/followups/org-scope";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
  type BudgetRecord,
  type ContactEvent,
} from "@/types/fertility";

// ──────────────────────────────────────────────────────────────────
// POST /api/budgets/[id]/start
//
// Presupuesto (pendiente o aceptado) → TRATAMIENTO en curso (módulo
// Tratamientos, migs 242/245/259).
// Antes esta ruta solo hacía UPDATE de `acceptance_status`
// a `in_progress`; ahora delega en el RPC `treatment_start_from_budget`,
// que crea la fila en `treatments` y deja el budget `in_progress` en la
// MISMA transacción (si una falla, no queda un budget iniciado sin
// tratamiento ni al revés). El RPC valida rol, addon y estado por su
// cuenta; los pre-checks de aquí solo existen para devolver mensajes
// claros con el status HTTP correcto.
//
// Mig 259 — se puede iniciar DIRECTO desde `pending_acceptance`: el paso
// intermedio "Marcar como aceptado" desapareció de la UI (pedido del
// founder). El RPC estampa `accepted_at` si venía vacío, porque iniciar un
// tratamiento implica que el presupuesto fue aceptado.
//
// Cierra DOS seguimientos, ambos con atribución honesta
// (`agendado_via_contacto` si hubo contacto previo — Categoría A — o
// `agendado_organico_dentro_ventana` — Categoría B):
//   · `budget_records.followup_id` ("esperando respuesta"), que antes
//     cerraba PATCH /mark-accepted y que en el flujo directo ya no pasa
//     por ahí.
//   · el auto-followup `fertility.budget_accepted_pending_start` creado
//     por el cron diario.
//
// Roles: owner | admin | doctor | asesora de fertilidad.
// (Recepción bloqueada — decisión con impacto clínico.)
// ──────────────────────────────────────────────────────────────────

const bodySchema = z
  .object({
    doctor_id: z.string().uuid().nullable().optional(),
    assistant_member_id: z.string().uuid().nullable().optional(),
    started_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
      .optional(),
    notes: z.string().max(1000).optional(),
  })
  .optional();

interface MembershipRow {
  organization_id: string;
  role: "owner" | "admin" | "receptionist" | "doctor";
  is_fertility_advisor: boolean | null;
}

/**
 * Traduce los errores que levanta el RPC a HTTP. `forbidden` sin ERRCODE
 * sale como P0001; los RAISE con ERRCODE llegan con su SQLSTATE.
 */
function mapRpcError(err: { code?: string; message?: string }): NextResponse {
  const msg = err.message ?? "";
  if (msg.includes("forbidden") || err.code === "42501") {
    return NextResponse.json(
      {
        error: msg.includes("forbidden")
          ? "Sin permisos para iniciar el tratamiento"
          : msg,
      },
      { status: 403 },
    );
  }
  if (err.code === "23514" || err.code === "23505") {
    return NextResponse.json({ error: msg }, { status: 409 });
  }
  return NextResponse.json(
    { error: msg || "No se pudo iniciar el tratamiento" },
    { status: 500 },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { status: 429 },
    );
  }

  // Body opcional (TreatmentStartInput). Se valida igual para que un
  // payload malformado devuelva un 400 limpio.
  let input: z.infer<typeof bodySchema> = undefined;
  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      const parsed = bodySchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
      }
      input = parsed.data;
    }
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // El presupuesto se lee PRIMERO (RLS ya oculta los de orgs ajenas) y la
  // membresía se valida en SU org — no en una membresía arbitraria
  // (`limit(1)`), que para un usuario multi-org podía apuntar a la clínica
  // equivocada y devolver 404 espurios.
  const { data: existing, error: existErr } = await supabase
    .from("budget_records")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existErr || !existing) {
    return NextResponse.json(
      { error: "Presupuesto no encontrado" },
      { status: 404 },
    );
  }
  const budget = existing as BudgetRecord;

  const denied = await assertActiveMembership(
    supabase,
    user.id,
    budget.organization_id,
  );
  if (denied) return denied;

  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("organization_id, role, is_fertility_advisor")
    .eq("user_id", user.id)
    .eq("organization_id", budget.organization_id)
    .eq("is_active", true)
    .maybeSingle();
  const membership = (membershipRow as MembershipRow | null) ?? null;
  if (!membership) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  const role = membership.role;
  const isAdvisor = Boolean(membership.is_fertility_advisor);
  const allowed =
    role === "owner" || role === "admin" || role === "doctor" || isAdvisor;
  if (!allowed) {
    return NextResponse.json(
      { error: "Sin permisos para marcar inicio de tratamiento" },
      { status: 403 },
    );
  }

  // Addon gate.
  const { data: addonRows } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", membership.organization_id)
    .eq("enabled", true)
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .limit(1);
  if (!addonRows || addonRows.length === 0) {
    return NextResponse.json(
      { error: "Esta función requiere el addon Pack Fertilidad" },
      { status: 403 },
    );
  }

  // Mig 259 — iniciar es LA decisión: ya no hace falta pasar antes por
  // 'accepted'. Este pre-check solo existe para devolver un 409 con un
  // mensaje claro; la guarda real (y la que manda) vive en el RPC.
  // 'accepted' sigue admitido por las filas heredadas del flujo anterior.
  if (
    budget.acceptance_status !== "pending_acceptance" &&
    budget.acceptance_status !== "accepted"
  ) {
    return NextResponse.json(
      {
        error:
          "Solo presupuestos pendientes o aceptados pueden iniciar un tratamiento",
      },
      { status: 409 },
    );
  }
  // Se recuerda ANTES del RPC: el RPC deja la fila en 'in_progress' y
  // después ya no se puede distinguir si venía del flujo directo.
  const startedFromPending = budget.acceptance_status === "pending_acceptance";
  if (budget.started_at) {
    return NextResponse.json(
      { error: "Este presupuesto ya está marcado como iniciado" },
      { status: 409 },
    );
  }

  // Cliente del USUARIO (no service role): el RPC es SECURITY DEFINER pero
  // lee auth.uid() para el rol, el addon y `started_by`.
  const { data: treatmentId, error: rpcErr } = await supabase.rpc(
    "treatment_start_from_budget",
    {
      p_budget_id: id,
      p_doctor_id: input?.doctor_id ?? null,
      p_assistant_member_id: input?.assistant_member_id ?? null,
      p_started_at: input?.started_at ?? null,
      p_notes: input?.notes ?? null,
    },
  );
  if (rpcErr) return mapRpcError(rpcErr);
  if (typeof treatmentId !== "string") {
    return NextResponse.json(
      { error: "No se pudo iniciar el tratamiento" },
      { status: 500 },
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("budget_records")
    .select("*")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .single();

  if (updErr || !updated) {
    return NextResponse.json(
      { error: updErr?.message ?? "No se pudo actualizar" },
      { status: 500 },
    );
  }

  // Mig 259 — cuando el inicio se hace DIRECTO desde 'pending_acceptance',
  // nadie pasó ya por PATCH /mark-accepted, que era quien cerraba el
  // followup de "esperando respuesta" (`budget_records.followup_id`). Sin
  // esto, ese seguimiento quedaría abierto para siempre y el cron seguiría
  // recordando contactar a una paciente que ya empezó su tratamiento.
  // Misma atribución honesta que /mark-accepted (mig 128): con contacto
  // previo → Categoría A, sin contacto → Categoría B.
  if (startedFromPending && budget.followup_id) {
    const { data: fu } = await supabase
      .from("clinical_followups")
      .select("contact_events, first_contact_at, closed_at")
      .eq("id", budget.followup_id)
      .maybeSingle();

    if (fu && !fu.closed_at) {
      const events: ContactEvent[] = Array.isArray(fu.contact_events)
        ? (fu.contact_events as unknown as ContactEvent[])
        : [];
      const hadContact = Boolean(fu.first_contact_at);
      const closureStatus = hadContact
        ? "agendado_via_contacto"
        : "agendado_organico_dentro_ventana";
      const closeEvent: ContactEvent = {
        type: "treatment_started",
        at: now,
        by_user_id: user.id,
        delivery_status: "unknown",
        budget_record_id: budget.id,
        reason: hadContact
          ? "Tratamiento iniciado (con contacto previo)"
          : "Tratamiento iniciado (orgánico, sin contacto previo)",
      };

      await supabase
        .from("clinical_followups")
        .update({
          status: closureStatus,
          closure_reason: closureStatus,
          closed_at: now,
          is_resolved: true,
          resolved_at: now,
          resolved_by: user.id,
          contact_events: [...events, closeEvent],
        })
        .eq("id", budget.followup_id)
        .eq("organization_id", membership.organization_id);
    }
  }

  // Close any open followup with rule_key
  // 'fertility.budget_accepted_pending_start' linked to this budget.
  // The link is in `contact_events[].budget_record_id` (the cron
  // stores it there because there's no dedicated FK column for
  // budget→followup beyond the optional `followup_id` already used
  // for the budget_pending_acceptance phase).
  const { data: openFollowups } = await supabase
    .from("clinical_followups")
    .select("id, contact_events, first_contact_at")
    .eq("organization_id", membership.organization_id)
    .eq("patient_id", budget.patient_id)
    .eq("rule_key", "fertility.budget_accepted_pending_start")
    .is("closed_at", null);

  for (const fu of openFollowups ?? []) {
    const events: ContactEvent[] = Array.isArray(fu.contact_events)
      ? (fu.contact_events as unknown as ContactEvent[])
      : [];
    const linksThisBudget = events.some(
      (e) => e.budget_record_id === budget.id,
    );
    if (!linksThisBudget) continue;

    const hadContact = Boolean(fu.first_contact_at);
    const closureStatus = hadContact
      ? "agendado_via_contacto"
      : "agendado_organico_dentro_ventana";

    const startedEvent: ContactEvent = {
      type: "treatment_started",
      at: now,
      by_user_id: user.id,
      delivery_status: "unknown",
      budget_record_id: budget.id,
      reason: hadContact
        ? "Inicio de tratamiento (con contacto previo)"
        : "Inicio de tratamiento (orgánico, sin contacto previo)",
    };

    await supabase
      .from("clinical_followups")
      .update({
        status: closureStatus,
        closure_reason: closureStatus,
        closed_at: now,
        is_resolved: true,
        resolved_at: now,
        resolved_by: user.id,
        contact_events: [...events, startedEvent],
      })
      .eq("id", fu.id)
      .eq("organization_id", membership.organization_id);
  }

  return NextResponse.json({ data: updated, treatment_id: treatmentId });
}
