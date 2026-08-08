import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api-utils";
import { generalLimiter } from "@/lib/rate-limit";
import { notifyFounder } from "@/lib/support-emails";

export const runtime = "nodejs";

const schema = z.object({
  ticket_id: z.string().uuid(),
  body: z.string().trim().min(1, "Mensaje requerido").max(5000),
});

/**
 * POST /api/support/messages — la clínica responde en un ticket.
 *
 * Igual que la creación: escribe con el client de la sesión (RLS de mig 064
 * decide) y avisa al founder por email. Además reabre el ticket si estaba
 * en `waiting` — si el cliente vuelve a escribir, la pelota es nuestra.
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
  const { ticket_id, body } = parsed.data;

  const { error } = await supabase.from("support_messages").insert({
    ticket_id,
    sender_id: user.id,
    sender_type: "user",
    body,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("support_tickets")
    .select("id, subject, status, organization_id")
    .eq("id", ticket_id)
    .maybeSingle();

  // Cliente escribe → la pelota vuelve a soporte.
  if (ticket && (ticket.status === "waiting" || ticket.status === "resolved")) {
    await admin
      .from("support_tickets")
      .update({ status: "open", updated_at: new Date().toISOString() })
      .eq("id", ticket_id);
  }

  const [{ data: org }, { data: profile }] = await Promise.all([
    admin
      .from("organizations")
      .select("name")
      .eq("id", ticket?.organization_id ?? "")
      .maybeSingle(),
    admin.from("user_profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
  ]);

  await notifyFounder({
    admin,
    orgName: org?.name ?? "Clínica sin nombre",
    authorName: profile?.full_name || profile?.email || "Usuario",
    subject: ticket?.subject ?? "(sin asunto)",
    body,
    ticketId: ticket_id,
    isNew: false,
  });

  return NextResponse.json({ ok: true });
}
