import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInboxError, loadConversation, requireInbox } from "@/lib/inbox/server";

export const runtime = "nodejs";

const schema = z.object({
  conversation_id: z.string().uuid(),
  client_msg_id: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

/** POST /api/inbox/notes — nota interna (amarilla). Nunca sale a WhatsApp. */
export async function POST(req: NextRequest) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Nota inválida" }, { status: 400 });
  const conv = await loadConversation(ctx.admin, ctx.orgId, parsed.data.conversation_id);
  if (!conv) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

  const { data, error } = await ctx.admin
    .from("wa_messages")
    .upsert(
      {
        organization_id: ctx.orgId,
        conversation_id: conv.id,
        direction: "internal",
        source: "agent",
        client_msg_id: parsed.data.client_msg_id,
        type: "note",
        body: parsed.data.body,
        status: "sent",
        sent_by: ctx.userId,
        ts: new Date().toISOString(),
      },
      { onConflict: "organization_id,client_msg_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return NextResponse.json({ error: "No se pudo guardar la nota" }, { status: 500 });
  return NextResponse.json({ ok: true, message_id: (data ?? [])[0]?.id ?? null });
}
