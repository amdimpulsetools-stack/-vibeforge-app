import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyOrgMembers } from "@/lib/live-notifications/notify";
import { z } from "zod";

export const runtime = "nodejs";

/**
 * POST /api/live-notifications/emit
 *
 * Puente para los call-sites que viven en componentes de cliente (agenda,
 * ficha de paciente). Desde la mig 192 el navegador ya no puede insertar en
 * `notifications`, así que emite por aquí.
 *
 * ── Por qué NO acepta título ni cuerpo ────────────────────────────────
 * Si el endpoint aceptara texto libre, habríamos movido el hueco de RLS de
 * sitio en vez de cerrarlo: cualquier miembro podría fabricar un "Pago
 * registrado — S/. 5000" y mandárselo a la dirección. Lo único que viaja es
 * la CLAVE del evento y el id de la entidad; el texto se construye aquí
 * leyendo la fila real. Un miembro sólo puede anunciar cosas que de verdad
 * pasaron, sobre entidades de su propia organización.
 *
 * Las lecturas van con el cliente autenticado del usuario, así que RLS sigue
 * aplicando, y además se filtran por `organization_id` de su membresía: un id
 * de otra clínica no resuelve y devuelve 404.
 */

const schema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("appointment_created"), appointment_id: z.string().uuid() }),
  z.object({ event: z.literal("appointment_cancelled"), appointment_id: z.string().uuid() }),
  z.object({ event: z.literal("appointment_no_show"), appointment_id: z.string().uuid() }),
  z.object({ event: z.literal("payment_registered"), payment_id: z.string().uuid() }),
  z.object({ event: z.literal("patient_created"), patient_id: z.string().uuid() }),
]);

/** "14:30:00" → "14:30". Tolera null y formatos ya cortos. */
function hhmm(time: string | null | undefined): string {
  return (time ?? "").slice(0, 5);
}

function patientLabel(
  patient: { first_name?: string | null; last_name?: string | null } | null | undefined,
  fallback: string | null | undefined
): string {
  const name = [patient?.first_name, patient?.last_name].filter(Boolean).join(" ").trim();
  return name || (fallback ?? "").trim() || "Paciente";
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const organizationId = (membership as { organization_id: string } | null)?.organization_id;
  if (!organizationId) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  let title: string;
  let text = "";
  let actionUrl: string | null = null;
  let doctorUserId: string | null = null;

  if (input.event === "patient_created") {
    const { data: patient } = await supabase
      .from("patients")
      .select("id, first_name, last_name")
      .eq("id", input.patient_id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!patient) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    title = "Nuevo paciente registrado";
    text = patientLabel(patient, null);
    actionUrl = "/patients";
  } else if (input.event === "payment_registered") {
    const { data: payment } = await supabase
      .from("patient_payments")
      .select(
        "id, amount, appointment_id, patients(first_name, last_name), appointments(appointment_date, patient_name)"
      )
      .eq("id", input.payment_id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!payment) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    // PostgREST devuelve el embed como objeto o array según la cardinalidad
    // que infiera; se normaliza para no depender de eso.
    const row = payment as Record<string, unknown>;
    const patient = (Array.isArray(row.patients) ? row.patients[0] : row.patients) as
      | { first_name?: string | null; last_name?: string | null }
      | null;
    const appointment = (Array.isArray(row.appointments) ? row.appointments[0] : row.appointments) as
      | { appointment_date?: string | null; patient_name?: string | null }
      | null;

    title = "Pago registrado";
    text = `S/. ${Number(row.amount ?? 0).toFixed(2)} — ${patientLabel(
      patient,
      appointment?.patient_name
    )}`;
    actionUrl = appointment?.appointment_date
      ? `/scheduler?date=${appointment.appointment_date}`
      : "/patients";
  } else {
    const { data: appointment } = await supabase
      .from("appointments")
      .select(
        "id, patient_name, appointment_date, start_time, doctor_id, patients(first_name, last_name), doctors(full_name, user_id)"
      )
      .eq("id", input.appointment_id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!appointment) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const row = appointment as Record<string, unknown>;
    const patient = (Array.isArray(row.patients) ? row.patients[0] : row.patients) as
      | { first_name?: string | null; last_name?: string | null }
      | null;
    const doctor = (Array.isArray(row.doctors) ? row.doctors[0] : row.doctors) as
      | { full_name?: string | null; user_id?: string | null }
      | null;

    const who = patientLabel(patient, row.patient_name as string | null);
    const when = `${row.appointment_date ?? ""} ${hhmm(row.start_time as string | null)}`.trim();

    doctorUserId = doctor?.user_id ?? null;
    actionUrl = `/scheduler?date=${row.appointment_date ?? ""}`;

    if (input.event === "appointment_created") {
      title = "Nueva cita agendada";
      text = `${who} — ${when}${doctor?.full_name ? ` · ${doctor.full_name}` : ""}`;
    } else if (input.event === "appointment_cancelled") {
      title = "Cita cancelada";
      text = `${who} — ${when}`;
    } else {
      title = "Paciente no asistió";
      text = `${who} — ${when}${doctor?.full_name ? ` · ${doctor.full_name}` : ""}`;
    }
  }

  const result = await notifyOrgMembers(supabase, {
    organizationId,
    event: input.event,
    title,
    body: text,
    actionUrl,
    doctorUserId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "No se pudo notificar" }, { status: 500 });
  }

  return NextResponse.json({ success: true, recipients: result.recipients });
}
