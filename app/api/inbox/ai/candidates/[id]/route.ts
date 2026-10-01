import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInboxError, requireInbox } from "@/lib/inbox/server";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  /** Al aprobar, administración puede corregir antes de que entre a la base. */
  intent: z.enum(["precio", "agendar", "reprogramar", "informacion", "resultado", "queja", "saludo", "objecion", "otro"]).optional(),
  service_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(120).optional(),
  patient_message: z.string().trim().min(1).max(1500).optional(),
  ideal_reply: z.string().trim().min(1).max(2000).optional(),
  guidance: z.string().trim().max(600).nullable().optional(),
});

/**
 * PATCH /api/inbox/ai/candidates/:id — aprobar (crea el caso en
 * wa_kb_cases y marca el candidato) o descartar. Solo admin.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  if (!ctx.isAdmin) return NextResponse.json({ error: "Solo administración" }, { status: 403 });
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const b = parsed.data;

  const { data: cand, error } = await ctx.admin
    .from("wa_kb_case_candidates")
    .select("id, status, conversation_id, intent, service_id, title, patient_message, ideal_reply, guidance, source_message_id")
    .eq("id", id)
    .eq("organization_id", ctx.orgId)
    .maybeSingle();
  if (error?.code === "42P01") return NextResponse.json({ error: "Falta aplicar la migración 279", code: "migration_279" }, { status: 409 });
  if (!cand) return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
  if (cand.status !== "pending") return NextResponse.json({ error: "Este candidato ya fue decidido" }, { status: 409 });

  const now = new Date().toISOString();
  if (b.action === "reject") {
    const { error: upErr } = await ctx.admin
      .from("wa_kb_case_candidates")
      .update({ status: "rejected", decided_by: ctx.userId, decided_at: now })
      .eq("id", cand.id);
    if (upErr) return NextResponse.json({ error: "No se pudo descartar" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const row = {
    organization_id: ctx.orgId,
    intent: b.intent ?? (cand.intent as string),
    service_id: b.service_id !== undefined ? b.service_id : (cand.service_id as string | null),
    title: (b.title ?? (cand.title as string)).slice(0, 120),
    patient_message: b.patient_message ?? (cand.patient_message as string),
    ideal_reply: b.ideal_reply ?? (cand.ideal_reply as string),
    guidance: b.guidance !== undefined ? b.guidance || null : ((cand.guidance as string | null) ?? null),
    source_conversation_id: cand.conversation_id as string,
    source_message_id: (cand.source_message_id as string | null) ?? null,
    created_by: ctx.userId,
    updated_by: ctx.userId,
    updated_at: now,
  };
  const { data: created, error: insErr } = await ctx.admin.from("wa_kb_cases").insert(row).select("id").single();
  if (insErr || !created) return NextResponse.json({ error: "No se pudo crear el caso" }, { status: 500 });
  const { error: upErr } = await ctx.admin
    .from("wa_kb_case_candidates")
    .update({ status: "approved", decided_by: ctx.userId, decided_at: now, approved_case_id: created.id })
    .eq("id", cand.id);
  if (upErr) return NextResponse.json({ error: "El caso se creó pero no se pudo marcar el candidato" }, { status: 500 });
  return NextResponse.json({ ok: true, case_id: created.id });
}
