import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";
import { parseBody } from "@/lib/api-utils";
import { notifyOrgSupportReply } from "@/lib/support-emails";

export const runtime = "nodejs";

/**
 * Bandeja de soporte del founder.
 *
 * GET  → todos los tickets de todas las orgs CON su conversación completa.
 * POST → responde un ticket (sender_type='support') y cambia su estado.
 *
 * La RLS de mig 064 solo permite leer/escribir a miembros de la org, así que
 * el founder no podía responder desde ningún lado (no es miembro de las
 * clínicas). Por eso esto va con admin client tras requireFounder — el mismo
 * patrón del resto del founder panel, sin tocar las policies.
 */

interface MessageRow {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  sender_type: string;
  body: string;
  created_at: string;
}

export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();

  const { data: tickets, error } = await admin
    .from("support_tickets")
    .select("id, organization_id, created_by, subject, status, priority, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ticketIds = (tickets ?? []).map((t) => t.id);
  const orgIds = [...new Set((tickets ?? []).map((t) => t.organization_id))];
  const userIds = [...new Set((tickets ?? []).map((t) => t.created_by).filter(Boolean))];

  const [messagesRes, orgsRes, profilesRes] = await Promise.all([
    ticketIds.length
      ? admin
          .from("support_messages")
          .select("id, ticket_id, sender_id, sender_type, body, created_at")
          .in("ticket_id", ticketIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as MessageRow[] }),
    orgIds.length
      ? admin.from("organizations").select("id, name").in("id", orgIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    userIds.length
      ? admin.from("user_profiles").select("id, full_name, email").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
  ]);

  const msgsByTicket = new Map<string, MessageRow[]>();
  for (const m of (messagesRes.data ?? []) as MessageRow[]) {
    const arr = msgsByTicket.get(m.ticket_id) ?? [];
    arr.push(m);
    msgsByTicket.set(m.ticket_id, arr);
  }
  const orgById = new Map((orgsRes.data ?? []).map((o) => [o.id, o.name]));
  const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));

  const rows = (tickets ?? []).map((t) => {
    const msgs = msgsByTicket.get(t.id) ?? [];
    const last = msgs[msgs.length - 1];
    return {
      ...t,
      org_name: orgById.get(t.organization_id) ?? "—",
      author_name:
        profileById.get(t.created_by)?.full_name ||
        profileById.get(t.created_by)?.email ||
        "—",
      messages: msgs,
      // Pelota nuestra: nadie de soporte ha contestado el último mensaje.
      awaiting_us: !last || last.sender_type === "user",
      last_message_at: last?.created_at ?? t.created_at,
    };
  });

  return NextResponse.json({ tickets: rows, generated_at: new Date().toISOString() });
}

const replySchema = z.object({
  ticket_id: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
  // waiting = respondido, esperando al cliente; resolved = caso cerrado.
  status: z.enum(["waiting", "resolved"]).default("waiting"),
});

export async function POST(request: Request) {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const parsed = await parseBody(request, replySchema);
  if (parsed.error) return parsed.error;
  const { ticket_id, body, status } = parsed.data;

  const admin = createAdminClient();

  const { data: ticket } = await admin
    .from("support_tickets")
    .select("id, subject, organization_id, created_by")
    .eq("id", ticket_id)
    .maybeSingle();

  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  const { error: msgErr } = await admin.from("support_messages").insert({
    ticket_id,
    sender_id: ctx.userId,
    sender_type: "support",
    body,
  });
  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  await admin
    .from("support_tickets")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", ticket_id);

  // Aviso a la clínica: el realtime solo la alcanza si tiene la pestaña
  // abierta, así que el email es lo que garantiza que se entere.
  const [{ data: org }, { data: author }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", ticket.organization_id).maybeSingle(),
    admin.from("user_profiles").select("email").eq("id", ticket.created_by).maybeSingle(),
  ]);

  await notifyOrgSupportReply({
    admin,
    organizationId: ticket.organization_id,
    toEmail: (author?.email as string | undefined) ?? "",
    orgName: org?.name ?? "tu clínica",
    subject: ticket.subject,
    body,
  });

  return NextResponse.json({ ok: true });
}
