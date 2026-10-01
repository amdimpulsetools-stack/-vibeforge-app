import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOrgWhatsApp, isInboxError, loadConversation, requireInbox } from "@/lib/inbox/server";

export const runtime = "nodejs";

const schema = z.object({
  /** Marca como leída (no leídos → 0 y doble check azul a la paciente). */
  read: z.boolean().optional(),
  inbox_status: z.enum(["open", "closed"]).optional(),
  /** Vincula (uuid) o desvincula (null) la ficha del paciente. */
  patient_id: z.string().uuid().nullable().optional(),
  display_name: z.string().trim().min(1).max(80).optional(),
});

/** PATCH /api/inbox/conversations/:id — leer, cerrar/reabrir, vincular paciente. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInbox();
  if (isInboxError(ctx)) return ctx;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const conv = await loadConversation(ctx.admin, ctx.orgId, id);
  if (!conv) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

  const b = parsed.data;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (b.read) patch.unread_count = 0;
  if (b.inbox_status) patch.inbox_status = b.inbox_status;
  if (b.display_name) patch.display_name = b.display_name;
  if (b.patient_id !== undefined) {
    if (b.patient_id) {
      const { data: patient } = await ctx.admin
        .from("patients")
        .select("id")
        .eq("id", b.patient_id)
        .eq("organization_id", ctx.orgId)
        .maybeSingle();
      if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
    }
    patch.patient_id = b.patient_id;
  }

  const { error } = await ctx.admin.from("wa_conversations").update(patch).eq("id", conv.id);
  if (error) return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });

  // Doble check azul: solo el último entrante, best-effort.
  if (b.read) {
    const { data: lastIn } = await ctx.admin
      .from("wa_messages")
      .select("wamid")
      .eq("conversation_id", conv.id)
      .eq("direction", "in")
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastIn?.wamid) {
      const wa = await getOrgWhatsApp(ctx.admin, ctx.orgId);
      await wa?.markAsRead(lastIn.wamid as string).catch(() => undefined);
    }
  }
  return NextResponse.json({ ok: true });
}
