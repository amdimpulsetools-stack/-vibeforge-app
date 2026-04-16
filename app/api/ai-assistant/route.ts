import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { aiAssistantSchema } from "@/lib/validations/api";

const SCHEMA_CONTEXT = `
Eres un generador de SQL para una clínica médica multi-tenant. Tu ÚNICA tarea es generar la consulta SQL que responde la pregunta del usuario.

ESQUEMA (cada tabla tiene organization_id — NO filtres por él, RLS lo hace):

- patients: id, first_name, last_name, dni, phone, email, status ('active'/'inactive'), notes, referral_source, custom_field_1, custom_field_2, created_at
- appointments: id, patient_name, patient_phone, patient_id, doctor_id, office_id, service_id, appointment_date (DATE, YYYY-MM-DD), start_time, end_time, status ('scheduled'/'confirmed'/'completed'/'cancelled'/'no_show'), origin, payment_method, responsible, notes, price_snapshot (NUMERIC — precio acordado al momento de crear la cita), meeting_url, responsible_user_id, created_at
- doctors: id, full_name, cmp, color, is_active, created_at
- offices: id, name, display_order, is_active
- services: id, name, base_price, duration_minutes, is_active, category_id
- patient_payments: id, patient_id, appointment_id, amount (NUMERIC), payment_method, payment_date (DATE), notes, created_at
- patient_tags: id, patient_id, tag
- schedule_blocks: id, block_date, start_time, end_time, office_id, all_day, reason
- service_categories: id, name, sort_order

MODELO DE PAGOS / DEUDA (IMPORTANTE):
- "Lo que el paciente debe pagar" de una cita = appointments.price_snapshot.
- "Lo que el paciente ya pagó" = SUM(patient_payments.amount) donde appointment_id coincide.
- Deuda pendiente por cita = price_snapshot - COALESCE(SUM(payments.amount), 0).
- Una cita está pendiente de pago cuando deuda > 0. Incluir citas status IN ('completed','confirmed','scheduled') según contexto.
- Cuando el usuario dice "este mes", usa DATE_TRUNC('month', CURRENT_DATE) sobre appointment_date.
- Cuando el usuario dice "clientes/pacientes que deben" agrupa por paciente y suma la deuda.

FOLLOW-UPS Y CONTEXTO PREVIO:
- Si en la conversación previa hay un mensaje del asistente que contiene "[SQL_PREVIO]: ...", esa fue la consulta usada para responder antes.
- Cuando la pregunta actual es un follow-up ("y sus nombres", "y el mes pasado", "ahora agrúpalo por doctor", "muéstrame más detalles"), REUTILIZA los filtros del SQL_PREVIO (mismas tablas, mismas fechas, mismas condiciones) y solo agrega/cambia las columnas o agrupaciones que pide la nueva pregunta.
- Solo descarta el contexto previo si la nueva pregunta cambia claramente de tema.

REGLAS ESTRICTAS:
1. Responde ÚNICAMENTE con el bloque SQL entre triple backticks. Sin explicaciones.
2. Solo SELECT o WITH ... SELECT. Nunca INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE.
3. Limita siempre a 100 filas con LIMIT 100.
4. Usa JOIN / LEFT JOIN según corresponda. Usa COALESCE cuando sumes pagos.
5. Si el paciente no tiene profile (patient_id IS NULL) usa appointments.patient_name para identificar.
6. Si la pregunta no requiere BD, responde exactamente: NO_SQL_NEEDED

EJEMPLO — "¿Qué pacientes deben dinero este mes?"
\`\`\`sql
SELECT
  COALESCE(p.first_name || ' ' || p.last_name, a.patient_name) AS paciente,
  a.patient_phone AS telefono,
  SUM(a.price_snapshot) AS total_facturado,
  COALESCE(SUM(pay_totals.pagado), 0) AS total_pagado,
  SUM(a.price_snapshot) - COALESCE(SUM(pay_totals.pagado), 0) AS deuda
FROM appointments a
LEFT JOIN patients p ON p.id = a.patient_id
LEFT JOIN (
  SELECT appointment_id, SUM(amount) AS pagado
  FROM patient_payments
  GROUP BY appointment_id
) pay_totals ON pay_totals.appointment_id = a.id
WHERE DATE_TRUNC('month', a.appointment_date) = DATE_TRUNC('month', CURRENT_DATE)
  AND a.status IN ('completed','confirmed','scheduled')
  AND a.price_snapshot IS NOT NULL
GROUP BY COALESCE(p.first_name || ' ' || p.last_name, a.patient_name), a.patient_phone
HAVING SUM(a.price_snapshot) - COALESCE(SUM(pay_totals.pagado), 0) > 0
ORDER BY deuda DESC
LIMIT 100
\`\`\`

EJEMPLO — "Doctor con más citas completadas este mes"
\`\`\`sql
SELECT d.full_name, COUNT(*) AS total_citas
FROM appointments a
JOIN doctors d ON a.doctor_id = d.id
WHERE a.status = 'completed'
  AND DATE_TRUNC('month', a.appointment_date) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY d.id, d.full_name
ORDER BY total_citas DESC
LIMIT 1
\`\`\`
`;

const ANSWER_CONTEXT = `
Eres un asistente amable de una clínica médica. Tu tarea es responder preguntas en lenguaje natural, claro y directo, en español.

REGLAS:
1. Sé conciso pero informativo.
2. Usa los datos proporcionados para dar una respuesta específica con números reales.
3. Si no hay resultados, dilo claramente.
4. No menciones SQL, bases de datos, ni aspectos técnicos.
5. Usa formato natural, como si fueras un colega respondiendo una pregunta.
6. SIEMPRE usa "S/" como símbolo de moneda (sol peruano). Nunca uses "$" ni "USD".

EJEMPLOS DE BUENAS RESPUESTAS:
- "El Dr. Carlos Martínez lidera con 24 citas completadas este mes de febrero."
- "Hoy se atendieron 15 citas en total."
- "Hay 3 pacientes con pagos pendientes: Juan Pérez (S/150), María García (S/80) y Pedro López (S/200)."
- "No se encontraron citas para ese período."

AL FINAL DE TU RESPUESTA, en una nueva línea, agrega EXACTAMENTE este formato JSON con 2-3 preguntas sugeridas que continúan naturalmente desde la pregunta del usuario:
SUGGESTIONS: ["pregunta 1", "pregunta 2", "pregunta 3"]

Las sugerencias deben ser preguntas concretas que el usuario podría hacer a continuación, basadas en el contexto. Ejemplos:
- Si respondiste sobre cantidad de pacientes con deuda → sugerir: ["Dame sus nombres y montos", "Compara con el mes pasado", "Agrupa la deuda por doctor"]
- Si respondiste sobre el doctor con más citas → sugerir: ["Cuáles fueron sus servicios más vendidos", "Cuántos pacientes nuevos atendió", "Y el mes pasado quién lideraba"]
- Si no hubo resultados → sugerir reformulaciones más amplias.
`;

const FORBIDDEN_PATTERNS: Array<[RegExp, string]> = [
  [/\binsert\s+into\b/i, "INSERT INTO"],
  [/\bupdate\s+\w+\s+set\b/i, "UPDATE SET"],
  [/\bdelete\s+from\b/i, "DELETE FROM"],
  [/\bdrop\s+(table|index|view|schema|function|trigger|database)\b/i, "DROP"],
  [/\btruncate\s+/i, "TRUNCATE"],
  [/\balter\s+(table|index|view|schema|function|role|database)\b/i, "ALTER"],
  [/\bcreate\s+(table|index|view|schema|function|trigger|role|database|temp|or)\b/i, "CREATE"],
  [/\bgrant\s+/i, "GRANT"],
  [/\brevoke\s+/i, "REVOKE"],
  [/\bexecute\s+/i, "EXECUTE"],
  [/\bcopy\s+(to|from)\b/i, "COPY"],
  [/\bperform\s+/i, "PERFORM"],
  [/\bcall\s+/i, "CALL"],
  [/\bdo\s+/i, "DO"],
  [/\bload\s+/i, "LOAD"],
  [/\bimport\s+/i, "IMPORT"],
  [/\bexport\s+/i, "EXPORT"],
  [/pg_read_file/i, "pg_read_file"],
  [/pg_ls_dir/i, "pg_ls_dir"],
  [/pg_sleep/i, "pg_sleep"],
  [/pg_catalog\./i, "pg_catalog"],
  [/pg_authid/i, "pg_authid"],
  [/pg_shadow/i, "pg_shadow"],
  [/pg_roles/i, "pg_roles"],
  [/information_schema\./i, "information_schema"],
  [/\bauth\./i, "auth.*"],
  [/\bset\s+(role|session|local)\b/i, "SET ROLE/SESSION"],
  [/\breset\s+(role|all|session)\b/i, "RESET"],
  [/\bdo\s*\$\$/i, "DO $$ block"],
  [/;\s*\b(select|insert|update|delete|drop|create|alter|with)\b/i, "stacked queries"],
];

const ALLOWED_TABLES = [
  "patients", "appointments", "doctors", "offices", "services",
  "patient_payments", "patient_tags", "schedule_blocks",
  "service_categories", "lookup_categories", "lookup_values",
];

const MAX_MESSAGE_LENGTH = 1000;

function validateSql(sql: string): { valid: boolean; error?: string } {
  // Strip SQL comments to prevent bypass via -- or /* */
  const stripped = sql
    .replace(/--[^\n]*/g, "")        // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .trim();

  const normalized = stripped.toLowerCase().replace(/\s+/g, " ");

  // Block stacked queries: no semicolons allowed (after comment stripping)
  if (stripped.includes(";")) {
    return { valid: false, error: "No se permiten múltiples sentencias" };
  }

  // Enforce allowlist: query MUST start with SELECT or WITH (for CTEs)
  if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
    return { valid: false, error: "Solo se permiten consultas SELECT" };
  }

  // If it starts with WITH (CTE), ensure the final statement is a SELECT
  // and does not contain INSERT/UPDATE/DELETE/CREATE/DROP anywhere
  if (normalized.startsWith("with")) {
    const dmlInCte = /\b(insert|update|delete|drop|alter|create|truncate)\b/i;
    if (dmlInCte.test(stripped)) {
      return { valid: false, error: "Las CTEs (WITH) solo pueden contener SELECT" };
    }
    const finalSelectMatch = normalized.match(/\)\s*select\b/);
    if (!finalSelectMatch) {
      return { valid: false, error: "Las CTEs (WITH) solo pueden terminar con SELECT" };
    }
  }

  // Run forbidden patterns against the comment-stripped SQL
  for (const [pattern, label] of FORBIDDEN_PATTERNS) {
    if (pattern.test(stripped)) {
      console.warn(`SQL blocked by pattern "${label}":`, stripped.slice(0, 200));
      return { valid: false, error: "La consulta contiene operaciones no permitidas" };
    }
  }

  return { valid: true };
}

function extractSqlFromResponse(text: string): string | null {
  const match = text.match(/```sql\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : null;
}

const FALLBACK_SUGGESTIONS = [
  "¿Cuántos pacientes nuevos este mes?",
  "¿Citas completadas hoy?",
  "Top 3 servicios más solicitados este mes",
];

function extractSuggestionsAndAnswer(text: string): {
  answer: string;
  suggestions: string[];
} {
  const match = text.match(/SUGGESTIONS:\s*(\[[\s\S]*?\])\s*$/);
  if (!match) return { answer: text.trim(), suggestions: [] };

  let suggestions: string[] = [];
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed)) {
      suggestions = parsed
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3);
    }
  } catch {
    // ignore — keep answer without suggestions
  }
  const answer = text.replace(match[0], "").trim();
  return { answer, suggestions };
}

async function callAnthropic(
  apiKey: string,
  system: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens = 512
): Promise<{ text: string | null; error?: string }> {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [1000, 2000, 4000];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: maxTokens,
          system,
          messages,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return { text: data.content?.[0]?.text ?? null };
      }

      // Retry on 500/529 (server error / overloaded)
      if ((res.status >= 500 || res.status === 429) && attempt < MAX_RETRIES) {
        console.warn(`Anthropic API error ${res.status}, retrying (${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }

      // Non-retryable or exhausted retries
      const errorBody = await res.text().catch(() => "Unknown error");
      console.error(`Anthropic API error ${res.status}:`, errorBody);
      return { text: null, error: `Error del servicio de IA (${res.status})` };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.warn(`Anthropic fetch error, retrying (${attempt + 1}/${MAX_RETRIES})...`, err);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      console.error("Anthropic fetch error after retries:", err);
      return { text: null, error: "No se pudo conectar con el servicio de IA" };
    }
  }

  return { text: null, error: "Error del servicio de IA tras múltiples intentos" };
}

// Per-plan AI query limits
const PLAN_AI_LIMITS: Record<string, number> = {
  starter: 50,
  independiente: 50,
  professional: 120,
  enterprise: 250,
};

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseBody(req, aiAssistantSchema);
    if (parsed.error) return parsed.error;
    const { message, history = [] } = parsed.data;

    // Build conversation context from recent history (last 5 exchanges)
    const recentHistory = history.slice(-10); // max 5 user+assistant pairs

    // Authentication is mandatory
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const rateLimitKey = user.id;
    const rl = aiLimiter(rateLimitKey);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta de nuevo en un momento." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
      );
    }

    // ── Quota check ─────────────────────────────────────────────────────────
    // Get user's organization and plan
    const { data: membership } = await supabaseAuth
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .limit(1)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Solo administradores pueden usar el asistente IA." },
        { status: 403 }
      );
    }

    const orgId = membership.organization_id;

    // Get plan info & current usage
    const [planRes, usageRes] = await Promise.all([
      supabaseAuth.rpc("get_org_plan", { org_id: orgId }),
      supabaseAuth.rpc("get_ai_query_usage_this_month", { org_id: orgId }),
    ]);

    const planData = planRes.data as Record<string, unknown> | null;
    const planSlug = (planData?.plan_slug as string) ?? "starter";
    const maxQueries = (planData?.max_ai_queries as number) ?? PLAN_AI_LIMITS[planSlug] ?? 50;
    const currentUsage = (usageRes.data as number) ?? 0;

    if (currentUsage >= maxQueries) {
      return NextResponse.json({
        error: "Has alcanzado el límite de consultas IA de tu plan este mes.",
        quota_exceeded: true,
        usage: currentUsage,
        limit: maxQueries,
      }, { status: 429 });
    }

    // Block write intents immediately
    const writeIntent = /\b(crea|crear|agrega|agregar|modifica|modificar|elimina|eliminar|borra|borrar|actualiza|actualizar|inserta|insertar)\b/i;
    if (writeIntent.test(message)) {
      return NextResponse.json({
        response: "Solo puedo consultar información, no modificar registros.",
        data: null,
        sql: null,
        suggestions: FALLBACK_SUGGESTIONS,
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY no configurada. Por favor, agrega la variable de entorno." },
        { status: 503 }
      );
    }

    // ── PASO 1: Generar SQL ──────────────────────────────────────────────────
    // Include conversation history for context (e.g. "y el mes pasado?")
    const sqlMessages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...recentHistory,
      { role: "user", content: message },
    ];
    const sqlGenResult = await callAnthropic(apiKey, SCHEMA_CONTEXT, sqlMessages, 512);

    if (!sqlGenResult.text) {
      return NextResponse.json(
        { error: sqlGenResult.error ?? "Error al contactar el servicio de IA" },
        { status: 502 }
      );
    }

    // If no SQL needed, answer directly
    if (sqlGenResult.text.includes("NO_SQL_NEEDED")) {
      const directResult = await callAnthropic(
        apiKey,
        ANSWER_CONTEXT,
        [
          ...recentHistory,
          { role: "user", content: `Pregunta: ${message}\n\nNo se requiere consultar la base de datos para responder esto.` },
        ],
        320
      );
      const direct = extractSuggestionsAndAnswer(
        directResult.text ?? "No tengo información para responder esa pregunta."
      );
      return NextResponse.json({
        response: direct.answer,
        data: null,
        sql: null,
        suggestions: direct.suggestions.length ? direct.suggestions : FALLBACK_SUGGESTIONS,
      });
    }

    const sql = extractSqlFromResponse(sqlGenResult.text);

    if (!sql) {
      return NextResponse.json({
        response: "No pude generar una consulta para esa pregunta. Intenta reformularla.",
        data: null,
        sql: null,
        suggestions: FALLBACK_SUGGESTIONS,
      });
    }

    // ── PASO 2: Validar y ejecutar SQL ───────────────────────────────────────
    const validation = validateSql(sql);
    if (!validation.valid) {
      return NextResponse.json({
        response: "No puedo ejecutar esa consulta por razones de seguridad.",
        data: null,
        sql: null,
        sqlError: null,
        suggestions: FALLBACK_SUGGESTIONS,
      });
    }

    let queryData: Record<string, unknown>[] = [];
    let sqlError: string | null = null;
    let executedSql = sql;

    const runQuery = async (rawSql: string) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("ai_readonly_query", {
        query: rawSql,
      });
      if (error) return { data: null, error: error.message };
      return {
        data: Array.isArray(data) ? data : data ? [data] : [],
        error: null as string | null,
      };
    };

    try {
      const first = await runQuery(sql);
      if (first.error) {
        sqlError = first.error;
        console.warn("AI SQL attempt 1 failed:", first.error, "\nSQL:", sql);

        // Retry once: feed the error back to the LLM so it can self-correct.
        const retryResult = await callAnthropic(
          apiKey,
          SCHEMA_CONTEXT,
          [
            ...recentHistory,
            { role: "user", content: message },
            { role: "assistant", content: sqlGenResult.text },
            {
              role: "user",
              content: `La consulta anterior falló con el error:\n"${first.error}"\n\nCorrige el SQL y responde solo con el bloque \`\`\`sql ...\`\`\` corregido.`,
            },
          ],
          512
        );

        const retrySql = retryResult.text
          ? extractSqlFromResponse(retryResult.text)
          : null;
        if (retrySql) {
          const retryValidation = validateSql(retrySql);
          if (retryValidation.valid) {
            executedSql = retrySql;
            const second = await runQuery(retrySql);
            if (second.error) {
              sqlError = second.error;
              console.error(
                "AI SQL retry failed:",
                second.error,
                "\nSQL:",
                retrySql
              );
            } else {
              sqlError = null;
              queryData = second.data ?? [];
            }
          }
        }
      } else {
        queryData = first.data ?? [];
      }
    } catch (err) {
      sqlError = "Error al ejecutar la consulta";
      console.error("SQL execution error:", err);
    }

    if (sqlError) {
      console.error(
        "AI SQL final error:",
        sqlError,
        "\nMessage:",
        message,
        "\nSQL:",
        executedSql
      );
      return NextResponse.json({
        response:
          "No pude obtener esos datos. Intenta reformular tu pregunta de forma más específica (por ejemplo: mencionando un mes, un doctor o un servicio).",
        data: null,
        sql: null,
        sqlError: null,
        suggestions: FALLBACK_SUGGESTIONS,
      });
    }

    // ── PASO 3: Generar respuesta en lenguaje natural con los datos ──────────
    const dataContext =
      queryData.length > 0
        ? `Datos obtenidos:\n${JSON.stringify(queryData, null, 2)}`
        : "La consulta no retornó resultados.";

    const answerResult = await callAnthropic(
      apiKey,
      ANSWER_CONTEXT,
      [
        ...recentHistory,
        { role: "user", content: `Pregunta del usuario: "${message}"\n\n${dataContext}` },
      ],
      400
    );

    // ── Log AI query usage ──────────────────────────────────────────────────
    const { error: usageError } = await supabaseAuth
      .from("ai_query_usage")
      .insert({
        organization_id: orgId,
        user_id: user.id,
        tokens_used: 0,
      });

    if (usageError) {
      console.error("Failed to log AI query usage:", usageError.message);
    }

    const final = extractSuggestionsAndAnswer(
      answerResult.text ?? "No pude interpretar los resultados."
    );

    return NextResponse.json({
      response: final.answer,
      data: queryData,
      sql: executedSql,
      sqlError: null,
      suggestions: final.suggestions.length ? final.suggestions : FALLBACK_SUGGESTIONS,
    });
  } catch (err) {
    console.error("AI assistant error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
