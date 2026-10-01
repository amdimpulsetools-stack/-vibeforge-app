import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isInboxError, loadConversation, requireInbox } from "@/lib/inbox/server";
import { buildKbSnapshot } from "@/lib/inbox/kb";
import { AiSuggestError, alarmDraft, detectAlarm, generateSuggestion, type TranscriptMessage } from "@/lib/inbox/ai";
import { messagePreview } from "@/lib/inbox/shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Tope diario por org (protege costo; ajustable cuando haya plan/cuota). */
const DAILY_LIMIT = 400;

const schema = z
  .object({
    conversation_id: z.string().uuid().optional(),
    /** Ajustes → "Probar Yendy" (solo admin): un mensaje inventado, sin conversación. */
    test_message: z.string().trim().min(2).max(1000).optional(),
    /** Opcional: indicación libre de la recepcionista ("más corto", "ofrece martes"). */
    instruction: z.string().max(300).nullable().optional(),
  })
  .refine((d) => !!d.conversation_id !== !!d.test_message, { message: "conversation_id o test_message" });

/**
 * POST /api/inbox/ai/suggest — Yendy IA "Generar respuesta".
 * Devuelve un BORRADOR; nunca envía. Ver lib/inbox/ai.ts (capas de seguridad).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireInbox(req);
  if (isInboxError(ctx)) return ctx;
  if (!ctx.settings.ai_enabled) {
    return NextResponse.json({ error: "Yendy IA está desactivada en Ajustes de Conversaciones" }, { status: 403 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Falta configurar ANTHROPIC_API_KEY" }, { status: 503 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const isTest = !!parsed.data.test_message;
  if (isTest && !ctx.isAdmin) {
    return NextResponse.json({ error: "Solo administración puede probar a Yendy" }, { status: 403 });
  }
  const conv = parsed.data.conversation_id
    ? await loadConversation(ctx.admin, ctx.orgId, parsed.data.conversation_id)
    : null;
  if (!isTest && !conv) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await ctx.admin
    .from("wa_ai_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.orgId)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json({ error: "Se alcanzó el límite diario de sugerencias de IA" }, { status: 429 });
  }

  // Últimos 20 mensajes (sin notas internas: son del equipo, no de la charla).
  // En prueba: un único mensaje inventado por la administración.
  let msgs: Array<{ direction: "in" | "out"; type: string; body: string | null; media_caption: string | null; ts: string }>;
  if (conv) {
    const { data: rows } = await ctx.admin
      .from("wa_messages")
      .select("direction, type, body, media_caption, ts")
      .eq("conversation_id", conv.id)
      .neq("direction", "internal")
      .order("ts", { ascending: false })
      .limit(20);
    msgs = ((rows ?? []) as typeof msgs).reverse();
  } else {
    msgs = [{ direction: "in", type: "text", body: parsed.data.test_message ?? "", media_caption: null, ts: new Date().toISOString() }];
  }
  const lastIn = [...msgs].reverse().find((m) => m.direction === "in");
  if (!lastIn) {
    return NextResponse.json({ error: "No hay mensajes de la paciente para responder" }, { status: 422 });
  }
  // Audio / foto sin texto: la IA no lo "escucha" — que lo revise una persona.
  if (!lastIn.body?.trim() && !lastIn.media_caption?.trim() && lastIn.type !== "text") {
    return NextResponse.json(
      { error: "El último mensaje es un audio o archivo. Revísalo antes de responder.", code: "media_only" },
      { status: 422 },
    );
  }

  const firstName = conv ? (conv.display_name ?? "").trim().split(/\s+/)[0] || null : null;
  const transcript: TranscriptMessage[] = msgs.map((m) => ({
    direction: m.direction,
    text: messagePreview(m).slice(0, 1500),
    at: new Date(m.ts).toISOString().slice(0, 16).replace("T", " "),
  }));

  // 1. Alarma ANTES del modelo: borrador fijo de derivación.
  const recentPatientText = msgs.filter((m) => m.direction === "in").slice(-3).map((m) => messagePreview(m)).join(" \n ");
  if (detectAlarm(recentPatientText)) {
    const draft = alarmDraft(firstName);
    const { data: logged } = await ctx.admin
      .from("wa_ai_suggestions")
      .insert({
        organization_id: ctx.orgId,
        conversation_id: conv?.id ?? null,
        model: "alarm-rule",
        draft,
        flags: { alarm: true, needs_human: true, test: isTest },
        requested_by: ctx.userId,
      })
      .select("id")
      .single();
    return NextResponse.json({
      suggestion_id: logged?.id ?? null,
      reply: draft,
      alarm: true,
      needs_human: true,
      sources: [],
      gap_question: null,
      price_issues: [],
    });
  }

  const { data: org } = await ctx.admin.from("organizations").select("name").eq("id", ctx.orgId).maybeSingle();
  const kb = await buildKbSnapshot(ctx.admin, ctx.orgId, { hiddenServiceIds: ctx.settings.ai_hidden_service_ids });

  try {
    const result = await generateSuggestion({
      settings: ctx.settings,
      clinicName: (org?.name as string | undefined) ?? "la clínica",
      kbText: kb.text,
      priceStrings: kb.priceStrings,
      transcript,
      patientFirstName: firstName,
      instruction: parsed.data.instruction ?? null,
    });
    const s = result.suggestion;

    const { data: logged } = await ctx.admin
      .from("wa_ai_suggestions")
      .insert({
        organization_id: ctx.orgId,
        conversation_id: conv?.id ?? null,
        model: ctx.settings.ai_model,
        draft: s.reply,
        flags: {
          test: isTest,
          needs_human: s.needs_human,
          intent: s.intent,
          sources: s.sources,
          gap: s.gap_question,
          price_issues: result.priceIssues,
        },
        input_tokens: result.usage.input,
        output_tokens: result.usage.output,
        cache_read_tokens: result.usage.cacheRead,
        latency_ms: result.latencyMs,
        requested_by: ctx.userId,
      })
      .select("id")
      .single();

    if (conv && s.gap_question?.trim()) {
      await ctx.admin.from("wa_kb_gaps").insert({
        organization_id: ctx.orgId,
        conversation_id: conv.id,
        question: s.gap_question.trim().slice(0, 500),
      });
    }

    return NextResponse.json({
      suggestion_id: logged?.id ?? null,
      reply: s.reply,
      alarm: false,
      needs_human: s.needs_human,
      intent: s.intent,
      sources: s.sources,
      gap_question: s.gap_question,
      price_issues: result.priceIssues,
    });
  } catch (err) {
    const message = err instanceof AiSuggestError ? err.message : "Yendy IA no respondió. Intenta de nuevo en un momento.";
    if (!(err instanceof AiSuggestError)) console.error("[Yendy IA] error:", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
