// Pushes a single appointment's state to Google Calendar.
//
// Action semantics:
//   - "upsert"  → if appointments.google_event_id is null, CREATE; else PATCH.
//                 Used for both new appointments and edits/moves.
//   - "cancel"  → PATCH the existing event with status=cancelled.
//                 Used when an appointment is marked cancelled in Yenda.
//
// Always returns 200 — sync to Google is best-effort and must NEVER block
// the user's flow in Yenda. Failures are surfaced via the integration's
// last_sync_error column (which the Settings UI reads).
//
// Auth: caller must be a member of the org that owns the appointment.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cancelEvent,
  createEvent,
  getIntegration,
  toLimaISO,
  updateEvent,
  type GCalEventInput,
} from "@/lib/google-calendar";

export const runtime = "nodejs";

interface SyncBody {
  appointmentId: string;
  action: "upsert" | "cancel";
}

function buildEventInput(appt: AppointmentRow): GCalEventInput {
  const doctorName = appt.doctors?.full_name ?? "Doctor";
  const officeName = appt.offices?.name ?? "";
  const serviceName = appt.services?.name ?? "Cita";
  const patientName = appt.patient_name ?? "Paciente";

  const lines = [
    `Doctor: ${doctorName}`,
    officeName ? `Consultorio: ${officeName}` : null,
    appt.patient_phone ? `Teléfono: ${appt.patient_phone}` : null,
    appt.notes ? `\nNotas:\n${appt.notes}` : null,
  ].filter(Boolean);

  return {
    summary: `${patientName} — ${serviceName}`,
    description: lines.join("\n"),
    location: officeName,
    startISO: toLimaISO(appt.appointment_date, appt.start_time),
    endISO: toLimaISO(appt.appointment_date, appt.end_time),
    status: appt.status === "cancelled" ? "cancelled" : "confirmed",
  };
}

interface AppointmentRow {
  id: string;
  organization_id: string;
  patient_name: string | null;
  patient_phone: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  google_event_id: string | null;
  doctors: { full_name: string } | null;
  offices: { name: string } | null;
  services: { name: string } | null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 200 });
  }

  let body: SyncBody;
  try {
    body = (await req.json()) as SyncBody;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_json" }, { status: 200 });
  }

  if (!body.appointmentId || !["upsert", "cancel"].includes(body.action)) {
    return NextResponse.json({ ok: false, reason: "bad_input" }, { status: 200 });
  }

  // Verify the user belongs to the appointment's org. We use the user-scoped
  // client first so RLS naturally limits the lookup. Service role only kicks
  // in for the Google API calls + event_id writeback.
  const { data: appt } = await supabase
    .from("appointments")
    .select(
      `id, organization_id, patient_name, patient_phone,
       appointment_date, start_time, end_time, status, notes, google_event_id,
       doctors:doctor_id ( full_name ),
       offices:office_id ( name ),
       services:service_id ( name )`
    )
    .eq("id", body.appointmentId)
    .maybeSingle();

  if (!appt) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 200 });
  }

  const typedAppt = appt as unknown as AppointmentRow;

  const integration = await getIntegration(typedAppt.organization_id);
  if (!integration) {
    return NextResponse.json({ ok: false, reason: "no_integration" }, { status: 200 });
  }

  const admin = createAdminClient();

  if (body.action === "cancel") {
    if (!typedAppt.google_event_id) {
      // Nothing to cancel on Google's side.
      return NextResponse.json({ ok: true, skipped: true });
    }
    const ok = await cancelEvent(typedAppt.organization_id, typedAppt.google_event_id);
    return NextResponse.json({ ok });
  }

  // upsert
  const event = buildEventInput(typedAppt);

  if (typedAppt.google_event_id) {
    const ok = await updateEvent(
      typedAppt.organization_id,
      typedAppt.google_event_id,
      event
    );
    return NextResponse.json({ ok });
  }

  const newEventId = await createEvent(typedAppt.organization_id, event);
  if (newEventId) {
    await admin
      .from("appointments")
      .update({ google_event_id: newEventId })
      .eq("id", typedAppt.id);
  }

  return NextResponse.json({ ok: !!newEventId, event_id: newEventId });
}
