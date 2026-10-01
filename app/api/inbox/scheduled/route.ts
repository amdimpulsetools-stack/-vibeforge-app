import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInboxError, loadConversation, requireInbox } from "@/lib/inbox/server";

export const runtime = "nodejs";

const createSchema = z
  .object({
    conversation_id: z.string().uuid(),
    kind: z.enum(["text", "template"]),
    body: z.string().trim().min(1).max(4096).optional(),
    template_id: z.string().uuid().optional(),
    template_vars: z.record(z.string(), z.string().max(500)).optional(),
    /** Instante absoluto (ISO con zona). La UI lo arma en la hora de la org. */
    send_at: z.string().datetime({ offset: true }),
  })
  .refine((v) => (v.kind === "text" ? !!v.body : !!v.template_id), { message: "Falta el contenido" });

/** POST /api/inbox/scheduled — programa un mensaje o una plantilla. */
export async function POST(req: NextRequest) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const b = parsed.data;

  const sendAt = new Date(b.send_at);
  if (sendAt.getTime() < Date.now() + 60_000) {
    return NextResponse.json({ error: "Elige una hora al menos 1 minuto en el futuro" }, { status: 400 });
  }
  if (sendAt.getTime() > Date.now() + 365 * 24 * 3600 * 1000) {
    return NextResponse.json({ error: "Máximo un año hacia adelante" }, { status: 400 });
  }
  const conv = await loadConversation(ctx.admin, ctx.orgId, b.conversation_id);
  if (!conv) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  if (b.kind === "template") {
    const { data: tpl } = await ctx.admin
      .from("whatsapp_templates")
      .select("id")
      .eq("id", b.template_id!)
      .eq("organization_id", ctx.orgId)
      .eq("status", "APPROVED")
      .maybeSingle();
    if (!tpl) return NextResponse.json({ error: "Plantilla no aprobada" }, { status: 404 });
  }

  const { data, error } = await ctx.admin
    .from("wa_scheduled_messages")
    .insert({
      organization_id: ctx.orgId,
      conversation_id: conv.id,
      kind: b.kind,
      body: b.kind === "text" ? b.body : null,
      template_id: b.kind === "template" ? b.template_id : null,
      template_vars: b.kind === "template" ? (b.template_vars ?? {}) : null,
      send_at: sendAt.toISOString(),
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: "No se pudo programar" }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

/** DELETE /api/inbox/scheduled?id=... — cancela un pendiente. */
export async function DELETE(req: NextRequest) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const { data, error } = await ctx.admin
    .from("wa_scheduled_messages")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", ctx.orgId)
    .in("status", ["pending", "needs_template", "failed"])
    .select("id");
  if (error) return NextResponse.json({ error: "No se pudo cancelar" }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Ya se envió o no existe" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
