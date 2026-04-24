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
// Description fields are configurable per org (see
// lib/google-calendar-description.ts). Extra data (patient email/DNI/age,
// payments, etc.) is only fetched when at least one toggle enables it —
// we keep the hot path lean when the org uses defaults.
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
import {
  buildDescription,
  normalizeConfig,
  type DescriptionFieldsConfig,
  type DescriptionInput,
} from "@/lib/google-calendar-description";

export const runtime = "nodejs";

interface SyncBody {
  appointmentId: string;
  action: "upsert" | "cancel";
}

interface AppointmentRow {
  id: string;
  organization_id: string;
  patient_id: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  origin: string | null;
  payment_method: string | null;
  notes: string | null;
  price_snapshot: number | null;
  discount_amount: number | null;
  discount_reason: string | null;
  google_event_id: string | null;
  doctors: { full_name: string } | null;
  offices: { name: string } | null;
  services: { name: string } | null;
}

interface PatientRow {
  email: string | null;
  dni: string | null;
  birth_date: string | null;
}

function needsPatientExtras(config: DescriptionFieldsConfig): boolean {
  return config.patient_email || config.patient_dni || config.patient_age;
}

function needsPaymentsExtras(config: DescriptionFieldsConfig): boolean {
  return config.payment_status;
}

async function buildEventInput(
  appt: AppointmentRow,
  config: DescriptionFieldsConfig
): Promise<GCalEventInput> {
  const doctorName = appt.doctors?.full_name ?? "Doctor";
  const officeName = appt.offices?.name ?? "";
  const serviceName = appt.services?.name ?? "Cita";
  const patientName = appt.patient_name ?? "Paciente";

  const descInput: DescriptionInput = {
    doctorName,
    officeName,
    notes: appt.notes,
    patient_phone: appt.patient_phone,
    price: appt.price_snapshot,
    discount_amount: appt.discount_amount,
    discount_reason: appt.discount_reason,
    payment_method: appt.payment_method,
    appointment_status: appt.status,
    origin: appt.origin,
    appointment_id: appt.id,
    app_url: process.env.NEXT_PUBLIC_APP_URL,
  };

  // Patient extras — only if enabled AND the appointment is linked to a patient row.
  if (appt.patient_id && needsPatientExtras(config)) {
    const admin = createAdminClient();
    const { data: p } = await admin
      .from("patients")
      .select("email, dni, birth_date")
      .eq("id", appt.patient_id)
      .maybeSingle();
    if (p) {
      const patient = p as PatientRow;
      descInput.patient_email = patient.email;
      descInput.patient_dni = patient.dni;
      descInput.patient_birth_date = patient.birth_date;
    }
  }

  // Payment extras — only if enabled.
  if (needsPaymentsExtras(config)) {
    const admin = createAdminClient();
    const { data: pays } = await admin
      .from("patient_payments")
      .select("amount")
      .eq("appointment_id", appt.id);
    const totalPaid = (pays ?? []).reduce(
      (sum, row) => sum + Number((row as { amount: number | null }).amount ?? 0),
      0
    );
    descInput.amount_paid = totalPaid;
  }

  return {
    summary: `${patientName} — ${serviceName}`,
    description: buildDescription(config, descInput),
    location: officeName,
    startISO: toLimaISO(appt.appointment_date, appt.start_time),
    endISO: toLimaISO(appt.appointment_date, appt.end_time),
    status: appt.status === "cancelled" ? "cancelled" : "confirmed",
  };
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

  // RLS naturally limits the lookup to the user's orgs.
  const { data: appt } = await supabase
    .from("appointments")
    .select(
      `id, organization_id, patient_id, patient_name, patient_phone,
       appointment_date, start_time, end_time, status, origin, payment_method,
       notes, price_snapshot, discount_amount, discount_reason, google_event_id,
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
      return NextResponse.json({ ok: true, skipped: true });
    }
    const ok = await cancelEvent(typedAppt.organization_id, typedAppt.google_event_id);
    return NextResponse.json({ ok });
  }

  // upsert
  const config = normalizeConfig(
    (integration as unknown as { description_fields?: unknown }).description_fields
  );
  const event = await buildEventInput(typedAppt, config);

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
