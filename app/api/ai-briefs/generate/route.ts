import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { aiBriefGenerateSchema } from "@/lib/validations/api";

/**
 * POST /api/ai-briefs/generate
 * Capa 1 of the "Reporte IA Avanzado" feature. Manual trigger from the
 * admin dashboard. Generates an executive narrative summary (3-5 short
 * paragraphs) for a given period using Haiku 4.5, persists the result in
 * `ai_executive_briefs`, and returns it.
 *
 * This endpoint reuses the existing `get_report_metrics_for_ai` RPC
 * (migration 056) which already returns previous-period comparison data
 * (`appointments_prev`, `revenue_prev`, `patients.new_prev_period`).
 *
 * Slice C scope: no cron, no email — only manual generation. Calls flow
 * is admin/owner only and feature-gated by the org's plan.
 */

// Body shape after Zod validation: { period, date_from?, date_to? }
function resolvePeriod(input: {
  period: "week" | "month" | "custom";
  date_from?: string;
  date_to?: string;
}): { from: string; to: string } {
  if (input.period === "custom") {
    return { from: input.date_from!, to: input.date_to! };
  }
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const days = input.period === "week" ? 7 : 30;
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - (days - 1));
  return { from: fromDate.toISOString().slice(0, 10), to };
}

const BRIEF_SYSTEM_PROMPT = `
Eres un analista clínico-operativo experto en consultorios y clínicas médicas en Latinoamérica (mercado Perú).
Tu tarea es generar un BRIEF EJECUTIVO en formato narrativo (no bullets, no markdown headers) basado en las métricas del periodo proporcionado y su comparación con el periodo anterior.

ESTRUCTURA OBLIGATORIA — Markdown con exactamente 4 secciones:

## Volumen y agenda
Un párrafo (2-3 oraciones) sobre cantidad de citas, completadas, cancelaciones y no-shows. Si hay variación significativa (>10%) vs periodo anterior, mencionarlo con ↑ o ↓.

## Finanzas
Un párrafo (2-3 oraciones) sobre ingresos cobrados, ticket promedio, y crecimiento vs periodo anterior. Usa S/ con formato peruano (S/14,200 no $14,200).

## Doctores y servicios
Un párrafo (2-3 oraciones) sobre el doctor con mejor desempeño y los servicios más demandados. Si hay un doctor o servicio con caída notable, mencionarlo.

## Alertas accionables
Lista de 1-3 bullets cortos con cosas que requieren atención del owner. Cada bullet debe ser específico y accionable. Si no hay alertas claras, escribe una sola línea: "Sin alertas críticas para este periodo."

REGLAS ESTRICTAS:
1. Usa SOLO los datos provistos. NUNCA inventes números, nombres ni porcentajes.
2. Si comparas con periodo anterior, calcula el % redondeado a entero. Por ejemplo: "187 citas (+12% vs semana pasada)".
3. NUNCA hagas recomendaciones médicas o clínicas. Solo operativas, financieras y de gestión.
4. NUNCA menciones nombres de pacientes individuales (no están en el payload).
5. Para nombres de doctores SÍ puedes usar el "name" provisto en top_doctors.
6. Tono profesional, directo, en español de Perú. Sin emojis salvo ↑ y ↓.
7. Total: máximo 350 palabras.
`;

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseBody(req, aiBriefGenerateSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    // ── Auth ──
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // ── Rate limit (reuse AI limiter) ──
    const rl = aiLimiter(user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta en un momento." },
        { status: 429 }
      );
    }

    // ── Org membership: owner/admin only ──
    const { data: member } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Solo administradores pueden generar briefs ejecutivos." },
        { status: 403 }
      );
    }

    const orgId = member.organization_id;

    // ── Plan feature gate: only Centro Medico + Clinica ──
    // Reuses the existing AI assistant feature flag — same as /api/ai-reports.
    const { data: planData } = await supabase.rpc("get_org_plan", { org_id: orgId });
    if (!planData?.feature_ai_assistant) {
      return NextResponse.json(
        {
          error: "Tu plan no incluye briefs ejecutivos IA. Actualiza a Centro Médico o Clínica.",
          upgrade: true,
        },
        { status: 403 }
      );
    }

    // ── Resolve date range from period ──
    const { from, to } = resolvePeriod(body);

    // ── Fetch metrics (RPC already returns previous-period comparison) ──
    const { data: metrics, error: metricsError } = await supabase.rpc(
      "get_report_metrics_for_ai",
      {
        org_id: orgId,
        p_date_from: from,
        p_date_to: to,
      }
    );

    if (metricsError || !metrics) {
      console.error("[ai-briefs] metrics RPC error:", metricsError);
      return NextResponse.json(
        { error: "Error al obtener métricas. Intenta de nuevo." },
        { status: 500 }
      );
    }

    const totalAppts =
      (metrics as Record<string, unknown> & { appointments?: { total?: number } })?.appointments
        ?.total ?? 0;
    if (totalAppts < 3) {
      return NextResponse.json(
        {
          error:
            "No hay suficientes datos en este periodo para un brief útil (mínimo 3 citas). Selecciona un rango más amplio.",
          insufficient_data: true,
        },
        { status: 422 }
      );
    }

    // ── Call Anthropic (Haiku 4.5 — same model as /api/ai-reports) ──
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Servicio de IA no configurado." }, { status: 503 });
    }

    const model = "claude-haiku-4-5-20251001";
    const userPrompt = `Genera un brief ejecutivo del periodo ${from} al ${to}. Las métricas siguen e incluyen comparación con el periodo previo del mismo largo:\n\n${JSON.stringify(metrics, null, 2)}`;

    const llmRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature: 0.3, // low variability between similar-period briefs
        system: BRIEF_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text().catch(() => "Unknown");
      console.error(`[ai-briefs] Anthropic ${llmRes.status}:`, errText);
      return NextResponse.json(
        { error: `Error de la IA (código ${llmRes.status}). Intenta de nuevo.` },
        { status: 502 }
      );
    }

    const llmData = await llmRes.json();
    const summary: string | null = llmData.content?.[0]?.text ?? null;
    if (!summary) {
      return NextResponse.json({ error: "No se pudo generar el brief." }, { status: 502 });
    }

    // ── Persist ──
    const { data: brief, error: insertError } = await supabase
      .from("ai_executive_briefs")
      .insert({
        organization_id: orgId,
        generated_by: user.id,
        period: body.period,
        period_start: from,
        period_end: to,
        content_markdown: summary,
        metrics_snapshot: metrics,
        llm_model: model,
        llm_tokens_input: llmData.usage?.input_tokens ?? null,
        llm_tokens_output: llmData.usage?.output_tokens ?? null,
      })
      .select()
      .single();

    if (insertError) {
      // Non-blocking: still return the brief to the user even if persistence
      // failed (e.g. RLS hiccup) — better UX than losing the LLM response.
      console.warn("[ai-briefs] insert failed (non-blocking):", insertError.message);
    }

    return NextResponse.json({
      brief: {
        id: brief?.id ?? null,
        period: body.period,
        period_start: from,
        period_end: to,
        content_markdown: summary,
        generated_at: brief?.generated_at ?? new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[ai-briefs] error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
