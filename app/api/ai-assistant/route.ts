import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { aiAssistantSchema } from "@/lib/validations/api";

const SCHEMA_CONTEXT = `
Eres un generador de SQL para una clínica médica. Tu ÚNICA tarea es generar la consulta SQL necesaria para responder la pregunta del usuario.

ESQUEMA DE LA BASE DE DATOS (Multi-Tenant — cada tabla tiene organization_id, RLS filtra automáticamente):
- patients: id, first_name, last_name, dni, phone, email, status (active/inactive), notes, referral_source, custom_field_1, custom_field_2, organization_id, created_at
- appointments: id, patient_name, patient_phone, patient_id, doctor_id, office_id, service_id, appointment_date (YYYY-MM-DD), start_time, end_time, status (scheduled/confirmed/completed/cancelled), origin, payment_method, responsible, notes, organization_id, created_at
- doctors: id, full_name, cmp, color, is_active, organization_id
- offices: id, name, display_order, is_active, organization_id
- services: id, name, base_price, duration_minutes, is_active, category_id, organization_id
- patient_payments: id, patient_id, appointment_id, amount, payment_method, payment_date, notes, organization_id
- patient_tags: id, patient_id, tag, organization_id
- schedule_blocks: id, block_date, start_time, end_time, office_id, all_day, reason, organization_id
NOTA: No filtres por organization_id en tus queries — las políticas RLS lo hacen automáticamente.

REGLAS ESTRICTAS:
1. Responde ÚNICAMENTE con el bloque SQL entre triple backticks. Sin explicaciones.
2. Solo SELECT. Nunca INSERT, UPDATE, DELETE, DROP, ALTER, CREATE.
3. Limita siempre a 100 filas con LIMIT 100.
4. Usa JOIN cuando necesites datos de varias tablas.
5. Si la pregunta no requiere consultar la base de datos, responde exactamente: NO_SQL_NEEDED

EJEMPLOS:
Pregunta: "¿Cuál es el doctor con más citas completadas este mes?"
Respuesta:
\`\`\`sql
SELECT d.full_name, COUNT(*) as total_citas
FROM appointments a
JOIN doctors d ON a.doctor_id = d.id
WHERE a.status = 'completed'
  AND DATE_TRUNC('month', a.appointment_date::date) = DATE_TRUNC('month', CURRENT_DATE)
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

EJEMPLOS DE BUENAS RESPUESTAS:
- "El Dr. Carlos Martínez lidera con 24 citas completadas este mes de febrero."
- "Hoy se atendieron 15 citas en total."
- "Hay 3 pacientes con pagos pendientes: Juan Pérez ($150), María García ($80) y Pedro López ($200)."
- "No se encontraron citas para ese período."
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
  const normalized = sql.trim().toLowerCase();

  if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
    return { valid: false, error: "Solo se permiten consultas SELECT" };
  }

  for (const [pattern, label] of FORBIDDEN_PATTERNS) {
    if (pattern.test(sql)) {
      console.warn(`SQL blocked by pattern "${label}":`, sql.slice(0, 200));
      return { valid: false, error: "La consulta contiene operaciones no permitidas" };
    }
  }

  return { valid: true };
}

function extractSqlFromResponse(text: string): string | null {
  const match = text.match(/```sql\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : null;
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
        256
      );
      return NextResponse.json({
        response: directResult.text ?? "No tengo información para responder esa pregunta.",
        data: null,
        sql: null,
      });
    }

    const sql = extractSqlFromResponse(sqlGenResult.text);

    if (!sql) {
      return NextResponse.json({
        response: "No pude generar una consulta para esa pregunta. Intenta reformularla.",
        data: null,
        sql: null,
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
      });
    }

    let queryData: Record<string, unknown>[] = [];
    let sqlError: string | null = null;

    try {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("ai_readonly_query", { query: sql });

      if (error) {
        sqlError = error.message;
      } else {
        queryData = Array.isArray(data) ? data : (data ? [data] : []);
      }
    } catch (err) {
      sqlError = "Error al ejecutar la consulta";
      console.error("SQL execution error:", err);
    }

    if (sqlError) {
      console.error("AI SQL error:", sqlError);
      return NextResponse.json({
        response: "Tuve un problema al consultar los datos. Por favor, intenta de nuevo.",
        data: null,
        sql: null,
        sqlError: null,
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
      256
    );

    // ── Log AI query usage ──────────────────────────────────────────────────
    await supabaseAuth
      .from("ai_query_usage")
      .insert({
        organization_id: orgId,
        user_id: user.id,
        tokens_used: 0,
      });

    return NextResponse.json({
      response: answerResult.text ?? "No pude interpretar los resultados.",
      data: queryData,
      sql: null,
      sqlError: null,
    });
  } catch (err) {
    console.error("AI assistant error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
