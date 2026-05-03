import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { maybeCreateAppointmentCompletedFollowup } from "@/lib/fertility/followup-triggers";

/**
 * POST /api/appointments/[id]/complete-followup-trigger
 *
 * To be invoked AFTER an appointment is marked status='completed'. The
 * scheduler updates the appointment row directly via the Supabase client;
 * once the update succeeds it should fire-and-forget this endpoint to
 * spawn rule-based follow-ups on the journey (sec. G of the spec).
 *
 * The endpoint is idempotent: if a followup with the same rule_key,
 * patient and target_category already exists in 'pendiente|contactado',
 * the helper still inserts a new one — but the trigger sec. 4 of the
 * spec only ever closes the OLDEST one, so duplicates remain safe.
 *
 * No body. Returns { created, rule_keys }.
 */
export async function POST(
  _req: NextRequest,
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

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "No perteneces a una organización" },
      { status: 403 }
    );
  }

  const { data: appt } = await supabase
    .from("appointments")
    .select(
      "id, organization_id, patient_id, doctor_id, service_id, status, appointment_date, end_time"
    )
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .single();

  if (!appt) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }
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
  });

  return NextResponse.json(result);
}
