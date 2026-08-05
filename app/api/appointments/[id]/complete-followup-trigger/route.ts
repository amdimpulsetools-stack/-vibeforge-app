import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { maybeCreateAppointmentCompletedFollowup } from "@/lib/fertility/followup-triggers";
import { assertActiveMembership } from "@/lib/followups/org-scope";

/**
 * POST /api/appointments/[id]/complete-followup-trigger
 *
 * To be invoked AFTER an appointment is marked status='completed'. The
 * scheduler updates the appointment row directly via the Supabase client;
 * once the update succeeds it should fire-and-forget this endpoint to
 * spawn follow-ups (rule-based for orgs with the addon, core "control a
 * los N días" for everyone else).
 *
 * Body opcional — control del doctor al completar la cita:
 *   { followup_days?: number | null, followup_reason?: string }
 *   - ausente  → usar el default del servicio (`followup_after_days`).
 *   - número   → override explícito (1-365 días).
 *   - null     → el doctor desmarcó "Requiere control" → no crear el
 *                seguimiento core (la ruta del addon no se ve afectada).
 *
 * Returns { created, rule_keys }.
 */

const bodySchema = z.object({
  followup_days: z
    .number()
    .int()
    .min(1, "Mínimo 1 día")
    .max(365, "Máximo 365 días")
    .nullable()
    .optional(),
  followup_reason: z.string().trim().max(300).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // La org sale de la PROPIA cita, no de una membresía arbitraria: el
  // patrón `.limit(1).single()` sobre organization_members elegía una org
  // al azar para usuarios multi-org y hacía fallar el lookup de la cita.
  // RLS ya restringe la lectura a las orgs del usuario; la membresía
  // ACTIVA se exige después (get_user_org_ids no filtra is_active).
  const { data: appt } = await supabase
    .from("appointments")
    .select(
      "id, organization_id, patient_id, doctor_id, service_id, status, appointment_date, end_time"
    )
    .eq("id", id)
    .maybeSingle();

  if (!appt) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  const denied = await assertActiveMembership(
    supabase,
    user.id,
    appt.organization_id
  );
  if (denied) return denied;

  if (appt.status !== "completed") {
    return NextResponse.json(
      { error: "La cita aún no está marcada como completada" },
      { status: 400 }
    );
  }
  if (!appt.patient_id) {
    // Walk-in / unassigned patient → no journey to track.
    return NextResponse.json({ created: 0, rule_keys: [] });
  }

  const completedAt = new Date(
    `${appt.appointment_date}T${appt.end_time ?? "23:59"}`
  ).toISOString();

  const result = await maybeCreateAppointmentCompletedFollowup(supabase, {
    organization_id: appt.organization_id,
    patient_id: appt.patient_id,
    doctor_id: appt.doctor_id,
    service_id: appt.service_id,
    completed_at: completedAt,
    appointment_id: appt.id,
    // `undefined` (campo ausente) y `null` (desmarcado) significan cosas
    // distintas aguas abajo, así que se pasa tal cual.
    followup_days: parsed.data.followup_days,
    followup_reason: parsed.data.followup_reason,
  });

  return NextResponse.json(result);
}
