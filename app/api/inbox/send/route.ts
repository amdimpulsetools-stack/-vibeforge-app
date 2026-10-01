import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrgWhatsApp, isInboxError, loadConversation, requireInbox } from "@/lib/inbox/server";
import { sendFromInbox } from "@/lib/inbox/send";

export const runtime = "nodejs";

const schema = z.object({
  conversation_id: z.string().uuid(),
  client_msg_id: z.string().uuid(),
  kind: z.enum(["text", "template"]),
  body: z.string().max(4096).optional(),
  template_id: z.string().uuid().optional(),
  template_vars: z.record(z.string(), z.string().max(500)).optional(),
  /** Último mensaje que veía quien escribe: si desde entonces entró uno
   *  de la paciente, se avisa antes de enviar (anti respuesta a ciegas). */
  expected_last_message_id: z.string().uuid().nullable().optional(),
  force: z.boolean().optional(),
  ai_suggestion_id: z.string().uuid().nullable().optional(),
});

/** POST /api/inbox/send — responde desde Conversaciones (texto o plantilla). */
export async function POST(req: NextRequest) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const b = parsed.data;

  const conv = await loadConversation(ctx.admin, ctx.orgId, b.conversation_id);
  if (!conv) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

  // Anti doble respuesta (servidor): llegó algo nuevo de la paciente o
  // de otra persona desde que se empezó a escribir.
  if (!b.force && b.expected_last_message_id !== undefined && conv.last_message_id !== (b.expected_last_message_id ?? null)) {
    const { data: newer } = await ctx.admin
      .from("wa_messages")
      .select("id, direction, sent_by")
      .eq("conversation_id", conv.id)
      .neq("direction", "internal")
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (newer && (newer.direction === "in" || (newer.sent_by && newer.sent_by !== ctx.userId))) {
      return NextResponse.json(
        { error: "Llegó un mensaje nuevo mientras escribías. Revísalo antes de enviar.", code: "stale_thread" },
        { status: 409 },
      );
    }
  }

  const wa = await getOrgWhatsApp(ctx.admin, ctx.orgId);
  if (!wa) return NextResponse.json({ error: "WhatsApp no está conectado en Ajustes → WhatsApp" }, { status: 400 });

  const res = await sendFromInbox({
    admin: ctx.admin,
    wa,
    orgId: ctx.orgId,
    conversation: conv,
    kind: b.kind,
    body: b.body,
    templateId: b.template_id,
    templateVars: b.template_vars,
    clientMsgId: b.client_msg_id,
    actorId: ctx.userId,
    source: "agent",
    aiSuggestionId: b.ai_suggestion_id ?? null,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error, code: res.code, message_id: res.messageId }, { status: res.status });
  }
  if (b.ai_suggestion_id) {
    // Mig 278: además del "se usó", el texto que de verdad salió (recepción
    // pudo editarlo). Si la 278 no está aplicada, se guarda solo el uso.
    const sugg = ctx.admin.from("wa_ai_suggestions");
    const finalText = b.kind === "text" ? (b.body ?? null) : null;
    const { error } = await sugg.update({ used: true, final_text: finalText }).eq("id", b.ai_suggestion_id).eq("organization_id", ctx.orgId);
    if (error) await sugg.update({ used: true }).eq("id", b.ai_suggestion_id).eq("organization_id", ctx.orgId);
  }
  return NextResponse.json({ ok: true, message_id: res.messageId, duplicate: res.duplicate ?? false });
}
