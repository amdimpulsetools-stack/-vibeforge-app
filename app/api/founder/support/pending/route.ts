import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

export const runtime = "nodejs";

/**
 * Contador para el badge de Soporte en la nav.
 *
 * Cuenta tickets PENDIENTES DE RESPUESTA (el último mensaje es del cliente),
 * no "abiertos": un ticket ya contestado no es trabajo pendiente, y un badge
 * que no baja al actuar se vuelve ruido que se aprende a ignorar.
 *
 * Endpoint aparte del GET de la bandeja porque el layout lo pide en CADA
 * página: trae solo ids y remitentes, no los cuerpos de los mensajes.
 */
export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();

  const { data: tickets } = await admin
    .from("support_tickets")
    .select("id")
    .in("status", ["open", "waiting"]);

  const ids = (tickets ?? []).map((t) => t.id);
  if (ids.length === 0) return NextResponse.json({ pending: 0 });

  const { data: messages } = await admin
    .from("support_messages")
    .select("ticket_id, sender_type, created_at")
    .in("ticket_id", ids)
    .order("created_at", { ascending: true });

  const lastSender = new Map<string, string>();
  for (const m of messages ?? []) {
    lastSender.set(m.ticket_id as string, m.sender_type as string);
  }

  // Sin mensajes (raro) también cuenta como pendiente: nadie ha contestado.
  const pending = ids.filter((id) => (lastSender.get(id) ?? "user") === "user").length;

  return NextResponse.json({ pending });
}
