import { NextRequest, NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOrgMembers } from "@/lib/live-notifications/notify";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  slug: z.string().min(1),
  appointment_id: z.string().uuid(),
});

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

  const { slug, appointment_id } = parsed.data;

  const session = await getPortalSession(slug);
  if (!session || !session.patient_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: settings } = await supabase
    .from("booking_settings")
    .select("portal_allow_cancel, portal_min_cancel_hours")
    .eq("organization_id", session.organization_id)
    .single();

  if (!settings?.portal_allow_cancel) {
    return NextResponse.json(
      { error: "La cancelación no está habilitada" },
      { status: 403 }
    );
  }

  const { data: appointment } = await supabase
    .from("appointments")
    // doctors(user_id): destinatario de la notificación en vivo cuando el
    // evento "cita cancelada" está configurado con alcance "sólo sus citas".
    .select("id, appointment_date, start_time, status, doctors(user_id)")
    .eq("id", appointment_id)
    .eq("patient_id", session.patient_id)
    .eq("organization_id", session.organization_id)
    .in("status", ["scheduled", "confirmed"])
    .single();

  if (!appointment) {
    return NextResponse.json(
      { error: "Cita no encontrada" },
      { status: 404 }
    );
  }

  const apptDateTime = new Date(
    `${appointment.appointment_date}T${appointment.start_time}:00`
  );
  const hoursUntil =
    (apptDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
  const minHours = settings.portal_min_cancel_hours ?? 24;

  if (hoursUntil < minHours) {
    return NextResponse.json(
      {
        error: `Solo puedes cancelar con al menos ${minHours} horas de anticipación`,
      },
      { status: 400 }
    );
  }

  // SECURITY (F-02): even though we already verified above that this cita
  // belongs to the patient+org, a concurrent mutation could change that
  // between the SELECT and this UPDATE (TOCTOU). The admin client bypasses
  // RLS, so the UPDATE MUST re-assert ownership in its WHERE clause.
  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointment_id)
    .eq("patient_id", session.patient_id)
    .eq("organization_id", session.organization_id)
    .in("status", ["scheduled", "confirmed"]);

  if (error) {
    return NextResponse.json(
      { error: "Error al cancelar" },
      { status: 500 }
    );
  }

  // Fan-out por rol vía RPC (mig 192) en lugar del broadcast a toda la org.
  // El embed llega como objeto o array según la cardinalidad que infiera
  // PostgREST; se normaliza para no depender de eso.
  const apptDoctor = (
    Array.isArray(appointment.doctors) ? appointment.doctors[0] : appointment.doctors
  ) as { user_id?: string | null } | null;

  void notifyOrgMembers(supabase, {
    organizationId: session.organization_id,
    event: "appointment_cancelled",
    title: "Cita cancelada por paciente",
    body: `Un paciente canceló su cita del ${appointment.appointment_date} a las ${appointment.start_time} desde el portal`,
    actionUrl: `/scheduler?date=${appointment.appointment_date}`,
    doctorUserId: apptDoctor?.user_id ?? null,
  });

  return NextResponse.json({ success: true });
}
