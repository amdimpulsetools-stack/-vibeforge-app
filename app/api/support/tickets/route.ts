import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api-utils";
import { generalLimiter } from "@/lib/rate-limit";
import { notifyFounder } from "@/lib/support-emails";

export const runtime = "nodejs";

const schema = z.object({
  organization_id: z.string().uuid(),
  subject: z.string().trim().min(1, "Asunto requerido").max(200),
  body: z.string().trim().min(1, "Mensaje requerido").max(5000),
});

/**
 * POST /api/support/tickets — abre un ticket con su primer mensaje.
 *
 * Antes la página de soporte insertaba directo desde el navegador: el ticket
 * quedaba guardado y NADIE se enteraba (auditoría 2026-08-08 — un ticket real
 * estuvo 67 días sin respuesta). Pasar por el servidor permite avisar al
 * founder por email en el mismo request.
 *
 * Escribe con el client de la SESIÓN (no admin): la RLS de mig 064 sigue
 * siendo la que decide si el usuario pertenece a esa org. El admin client se
 * usa solo para resolver los datos del correo.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  const parsed = await parseBody(request, schema);
  if (parsed.error) return parsed.error;
  const { organization_id, subject, body } = parsed.data;

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .insert({
      organization_id,
      created_by: user.id,
      subject,
      status: "open",
      priority: "normal",
    })
    .select()
    .single();

  if (ticketError || !ticket) {
    return NextResponse.json(
      { error: ticketError?.message ?? "No se pudo crear el ticket" },
      { status: 400 },
    );
  }

  const { error: msgError } = await supabase.from("support_messages").insert({
    ticket_id: ticket.id,
    sender_id: user.id,
    sender_type: "user",
    body,
  });

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 400 });
  }

  // Aviso al founder — best-effort, nunca bloquea la respuesta al usuario.
  const admin = createAdminClient();
  const [{ data: org }, { data: profile }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", organization_id).maybeSingle(),
    admin.from("user_profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
  ]);
  await notifyFounder({
    admin,
    orgName: org?.name ?? "Clínica sin nombre",
    authorName: profile?.full_name || profile?.email || "Usuario",
    subject,
    body,
    ticketId: ticket.id,
    isNew: true,
  });

  return NextResponse.json({ ticket });
}
