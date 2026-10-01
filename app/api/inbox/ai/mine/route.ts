import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInboxError, requireInbox } from "@/lib/inbox/server";
import { mineCandidate, type MiningMessage } from "@/lib/inbox/mining";
import { messagePreview } from "@/lib/inbox/shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Chats revisados por corrida (costo acotado: ~1-2 k tokens cada uno). */
const BATCH = 8;
/** Mensajes por chat que lee la IA (los últimos). */
const MESSAGES = 40;
/** El automático (al abrir Ajustes) corre como mucho una vez por semana. */
const AUTO_EVERY_MS = 7 * 24 * 3600 * 1000;

const schema = z.object({
  /** true = lo disparó la pantalla al abrir; respeta la semana. false = botón "Buscar ahora". */
  auto: z.boolean().optional(),
});

/**
 * POST /api/inbox/ai/mine — revisa los chats que terminaron en cita
 * (outcome, mig 278) y aún no fueron revisados (mined_at, mig 279), y
 * propone casos candidatos. Solo admin. Nada entra a la base de
 * conocimientos sin aprobación.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  if (!ctx.isAdmin) return NextResponse.json({ error: "Solo administración" }, { status: 403 });
  if (!ctx.settings.ai_enabled) return NextResponse.json({ error: "Yendy IA está desactivada" }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Falta configurar ANTHROPIC_API_KEY" }, { status: 503 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const minedAt = ctx.settings.ai_mined_at ? new Date(ctx.settings.ai_mined_at).getTime() : 0;
  if (parsed.data.auto && Date.now() - minedAt < AUTO_EVERY_MS) {
    return NextResponse.json({ ok: true, skipped: true, reviewed: 0, proposed: 0, remaining: null });
  }

  const { data: convs, error: convErr } = await ctx.admin
    .from("wa_conversations")
    .select("id, outcome, display_name")
    .eq("organization_id", ctx.orgId)
    .not("outcome", "is", null)
    .is("mined_at", null)
    .order("outcome_at", { ascending: false })
    .limit(BATCH + 1);
  if (convErr) {
    if (convErr.code === "42703") return NextResponse.json({ error: "Falta aplicar la migración 279", code: "migration_279" }, { status: 409 });
    return NextResponse.json({ error: "No se pudieron leer los chats cerrados" }, { status: 500 });
  }
  const batch = (convs ?? []).slice(0, BATCH) as Array<{ id: string; outcome: "scheduled" | "attended"; display_name: string | null }>;
  const hasMore = (convs ?? []).length > BATCH;

  const [{ data: org }, { data: services }] = await Promise.all([
    ctx.admin.from("organizations").select("name").eq("id", ctx.orgId).maybeSingle(),
    ctx.admin.from("services").select("id, name").eq("organization_id", ctx.orgId).eq("is_active", true).order("name").limit(200),
  ]);
  const clinicName = (org?.name as string | undefined) ?? "la clínica";
  const serviceList = (services ?? []) as Array<{ id: string; name: string }>;

  let proposed = 0;
  const errors: string[] = [];
  for (const conv of batch) {
    const { data: rows } = await ctx.admin
      .from("wa_messages")
      .select("id, direction, type, body, media_caption, ts")
      .eq("conversation_id", conv.id)
      .neq("direction", "internal")
      .order("ts", { ascending: false })
      .limit(MESSAGES);
    const msgs: MiningMessage[] = ((rows ?? []) as Array<{ id: string; direction: "in" | "out"; type: string; body: string | null; media_caption: string | null; ts: string }>)
      .reverse()
      .map((m) => ({
        id: m.id,
        direction: m.direction,
        text: messagePreview(m).slice(0, 1500),
        at: new Date(m.ts).toISOString().slice(0, 16).replace("T", " "),
      }));
    const ins = msgs.filter((m) => m.direction === "in").length;
    const outs = msgs.filter((m) => m.direction === "out").length;

    // Chat demasiado corto para tener un tramo útil: se marca revisado sin gastar IA.
    if (ins < 2 || outs < 1) {
      await ctx.admin.from("wa_conversations").update({ mined_at: new Date().toISOString() }).eq("id", conv.id);
      continue;
    }
    try {
      const { candidate } = await mineCandidate({ settings: ctx.settings, clinicName, outcome: conv.outcome, messages: msgs, services: serviceList });
      if (candidate.worth_it && candidate.patient_message.trim() && candidate.ideal_reply.trim()) {
        const source = msgs[candidate.patient_index - 1];
        const { error } = await ctx.admin.from("wa_kb_case_candidates").insert({
          organization_id: ctx.orgId,
          conversation_id: conv.id,
          outcome: conv.outcome,
          score: candidate.score,
          intent: candidate.intent,
          service_id: candidate.service_id,
          title: candidate.title.trim().slice(0, 120) || candidate.patient_message.trim().slice(0, 120),
          patient_message: candidate.patient_message.trim().slice(0, 1500),
          ideal_reply: candidate.ideal_reply.trim().slice(0, 2000),
          guidance: candidate.guidance?.trim().slice(0, 600) || null,
          rationale: candidate.rationale.trim().slice(0, 600) || null,
          source_message_id: source?.direction === "in" ? source.id : null,
          model: ctx.settings.ai_model,
        });
        if (error && error.code !== "23505") throw error;
        if (!error) proposed += 1;
      }
      await ctx.admin.from("wa_conversations").update({ mined_at: new Date().toISOString() }).eq("id", conv.id);
    } catch (err) {
      // No se marca: se reintenta en la próxima corrida.
      console.error("[Minería] chat", conv.id, err);
      errors.push(conv.id);
    }
  }
  await ctx.admin.from("wa_inbox_settings").upsert({ organization_id: ctx.orgId, ai_mined_at: new Date().toISOString() }, { onConflict: "organization_id" });

  return NextResponse.json({
    ok: true,
    skipped: false,
    reviewed: batch.length - errors.length,
    proposed,
    remaining: hasMore ? "more" : 0,
    failed: errors.length,
  });
}
