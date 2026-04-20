import { NextRequest, NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .select("id, appointment_date, start_time, status")
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

  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointment_id);

  if (error) {
    return NextResponse.json(
      { error: "Error al cancelar" },
      { status: 500 }
    );
  }

  supabase
    .from("notifications")
    .insert({
      organization_id: session.organization_id,
      type: "appointment_cancelled",
      title: "Cita cancelada por paciente",
      body: `Un paciente canceló su cita del ${appointment.appointment_date} a las ${appointment.start_time} desde el portal`,
      action_url: `/scheduler?date=${appointment.appointment_date}`,
    })
    .then(() => {});

  return NextResponse.json({ success: true });
}
