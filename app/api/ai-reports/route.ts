import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { aiReportSchema } from "@/lib/validations/api";

// Monthly limits per plan slug
const MONTHLY_LIMITS: Record<string, number> = {
  starter: 5,
  professional: 10,
  enterprise: 30,
};

const REPORT_SYSTEM_PROMPT = `
Eres un analista de negocios experto en clínicas médicas y consultorios odontológicos en Latinoamérica.
Tu tarea es generar un RESUMEN EJECUTIVO INTELIGENTE basado en las métricas del periodo proporcionado.

ESTRUCTURA OBLIGATORIA de tu respuesta (usa Markdown):

## 📊 Resumen del periodo
Un párrafo conciso (2-3 oraciones) resumiendo el estado general del negocio.

## 📈 Métricas clave
- Lista con las 4-5 métricas más relevantes con sus números exactos.
- Incluye comparación vs periodo anterior cuando haya datos (usa ↑ o ↓ con porcentaje).

## ⚠️ Alertas
- Lista de 1-3 métricas que requieren atención inmediata (si las hay).
- Enfócate en: cancelaciones altas, caída de ingresos, baja retención, no-shows.
- Si no hay alertas, omite esta sección.

## 💡 Recomendaciones
- 3-5 recomendaciones CONCRETAS y ACCIONABLES.
- Cada una debe ser específica al dato ("enviar recordatorios 48h antes" NO "mejorar comunicación").
- Prioriza por impacto.

REGLAS:
1. Usa SOLO los datos proporcionados. NUNCA inventes números.
2. Moneda: S/. (Soles peruanos). Formato: S/. 1,234.56
3. Sé directo y profesional. El lector es un dueño de clínica, no un analista.
4. Si no hay datos suficientes para una sección, dilo explícitamente.
5. Máximo 400 palabras en total.
6. Responde siempre en español.
`;

const REPORT_TYPE_CONTEXT: Record<string, string> = {
  financial: "Enfócate en: ingresos, cobros, pendientes, ticket promedio, productividad por doctor, y rentabilidad.",
  marketing: "Enfócate en: nuevos pacientes, canales de origen, conversión, y estrategias de captación.",
  operational: "Enfócate en: eficiencia operativa, horas pico, ocupación, servicios más demandados, y distribución de carga.",
  retention: "Enfócate en: retención de pacientes, frecuencia de visitas, pacientes en riesgo de abandono, y lifetime value.",
  general: "Cubre todos los aspectos: financiero, operacional, marketing y retención de forma balanceada.",
};

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseBody(req, aiReportSchema);
    if (parsed.error) return parsed.error;
    const { reportType, dateFrom, dateTo } = parsed.data;

    // ── Auth ──
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // ── Per-minute rate limit (reuse AI limiter) ──
    const rl = aiLimiter(user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta en un momento." },
        { status: 429 }
      );
    }

    // ── Get org membership ──
    const { data: member } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Solo administradores pueden generar reportes IA." },
        { status: 403 }
      );
    }

    const orgId = member.organization_id;

    // ── Check plan feature flag ──
    const { data: planData } = await supabase.rpc("get_org_plan", { org_id: orgId });
    if (!planData?.feature_ai_assistant) {
      return NextResponse.json(
        { error: "Tu plan no incluye reportes con IA. Actualiza tu plan para acceder.", upgrade: true },
        { status: 403 }
      );
    }

    // ── Check monthly usage limit ──
    const planSlug = (planData.plan_slug as string) ?? "starter";
    const monthlyLimit = MONTHLY_LIMITS[planSlug] ?? 5;

    const { data: usageCount } = await supabase.rpc("get_ai_report_usage_this_month", { org_id: orgId });
    const currentUsage = (usageCount as number) ?? 0;

    if (currentUsage >= monthlyLimit) {
      return NextResponse.json(
        {
          error: `Has alcanzado el límite de ${monthlyLimit} resúmenes IA este mes. Se reinicia el próximo mes.`,
          usage: currentUsage,
          limit: monthlyLimit,
        },
        { status: 429 }
      );
    }

    // ── Fetch metrics via RPC ──
    const { data: metrics, error: metricsError } = await supabase.rpc("get_report_metrics_for_ai", {
      org_id: orgId,
      p_date_from: dateFrom,
      p_date_to: dateTo,
    });

    if (metricsError || !metrics) {
      console.error("Metrics RPC error:", metricsError);
      return NextResponse.json(
        { error: "Error al obtener métricas. Intenta de nuevo." },
        { status: 500 }
      );
    }

    // ── Check minimum data ──
    const totalAppts = (metrics as Record<string, unknown> & { appointments?: { total?: number } })?.appointments?.total ?? 0;
    if (totalAppts < 3) {
      return NextResponse.json({
        error: "No hay suficientes datos en este periodo para generar un resumen útil. Selecciona un rango con al menos 3 citas.",
        insufficient_data: true,
      }, { status: 422 });
    }

    // ── Call Anthropic API ──
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Servicio de IA no configurado." },
        { status: 503 }
      );
    }

    const typeContext = REPORT_TYPE_CONTEXT[reportType] ?? REPORT_TYPE_CONTEXT.general;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 1024,
        system: `${REPORT_SYSTEM_PROMPT}\n\nCONTEXTO ESPECÍFICO: ${typeContext}`,
        messages: [
          {
            role: "user",
            content: `Genera un resumen ejecutivo inteligente basado en estas métricas del periodo ${dateFrom} al ${dateTo}:\n\n${JSON.stringify(metrics, null, 2)}`,
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => "Unknown");
      console.error(`Anthropic error ${anthropicRes.status}:`, errText);

      // Surface specific errors to the user
      if (anthropicRes.status === 401) {
        return NextResponse.json(
          { error: "API key de IA inválida o expirada. Contacta al administrador." },
          { status: 502 }
        );
      }
      if (anthropicRes.status === 403) {
        return NextResponse.json(
          { error: "Sin acceso a la API de IA. Verifica la configuración de la API key." },
          { status: 502 }
        );
      }
      if (anthropicRes.status === 400) {
        console.error("Anthropic 400 body:", errText);
        return NextResponse.json(
          { error: "Error en la solicitud a la IA. Revisa los logs del servidor." },
          { status: 502 }
        );
      }

      // Retry once on 5xx/429 (overloaded / rate limit)
      if (anthropicRes.status >= 500 || anthropicRes.status === 429) {
        const isCredits = errText.includes("credit") || errText.includes("billing");
        if (isCredits) {
          return NextResponse.json(
            { error: "Créditos de IA agotados. El administrador debe recargar la cuenta de Anthropic." },
            { status: 402 }
          );
        }
        await new Promise((r) => setTimeout(r, 2000));
        const retryRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-5-20250514",
            max_tokens: 1024,
            system: `${REPORT_SYSTEM_PROMPT}\n\nCONTEXTO ESPECÍFICO: ${typeContext}`,
            messages: [
              {
                role: "user",
                content: `Genera un resumen ejecutivo inteligente basado en estas métricas del periodo ${dateFrom} al ${dateTo}:\n\n${JSON.stringify(metrics, null, 2)}`,
              },
            ],
          }),
        });
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          const retryText = retryData.content?.[0]?.text ?? null;
          if (retryText) {
            // Log usage on retry success
            await supabase.from("ai_report_usage").insert({
              organization_id: orgId,
              user_id: user.id,
              report_type: reportType,
              date_from: dateFrom,
              date_to: dateTo,
              tokens_used: (retryData.usage?.input_tokens ?? 0) + (retryData.usage?.output_tokens ?? 0),
            });
            return NextResponse.json({
              summary: retryText,
              usage: currentUsage + 1,
              limit: monthlyLimit,
            });
          }
        }
      }

      return NextResponse.json(
        { error: `Error de la IA (código ${anthropicRes.status}). Verifica tu API key y créditos de Anthropic.` },
        { status: 502 }
      );
    }

    const data = await anthropicRes.json();
    const summary = data.content?.[0]?.text ?? null;

    if (!summary) {
      return NextResponse.json(
        { error: "No se pudo generar el resumen." },
        { status: 502 }
      );
    }

    // ── Log usage ──
    await supabase.from("ai_report_usage").insert({
      organization_id: orgId,
      user_id: user.id,
      report_type: reportType,
      date_from: dateFrom,
      date_to: dateTo,
      tokens_used: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    });

    return NextResponse.json({
      summary,
      usage: currentUsage + 1,
      limit: monthlyLimit,
    });
  } catch (err) {
    console.error("AI reports error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
