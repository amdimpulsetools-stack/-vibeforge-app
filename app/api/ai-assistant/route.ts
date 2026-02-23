import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SCHEMA_CONTEXT = `
Eres un generador de SQL para una clínica médica. Tu ÚNICA tarea es generar la consulta SQL necesaria para responder la pregunta del usuario.

ESQUEMA DE LA BASE DE DATOS (Multi-Tenant — cada tabla tiene organization_id, RLS filtra automáticamente):
- patients: id, first_name, last_name, dni, phone, email, status (active/inactive), notes, viene_desde, adicional_1, adicional_2, organization_id, created_at
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

const FORBIDDEN_PATTERNS = [
  /\binsert\b/i,
  /\bupdate\b/i,
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\btruncate\b/i,
  /\balter\b/i,
  /\bcreate\b/i,
  /\breplace\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\bexecute\b/i,
  /\bcopy\s/i,
  /pg_read_file/i,
  /pg_ls_dir/i,
];

function validateSql(sql: string): { valid: boolean; error?: string } {
  const normalized = sql.trim().toLowerCase();

  if (!normalized.startsWith("select")) {
    return { valid: false, error: "Solo se permiten consultas SELECT" };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(sql)) {
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
  userMessage: string,
  maxTokens = 512
): Promise<string | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.content?.[0]?.text ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
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
    const sqlGenResponse = await callAnthropic(apiKey, SCHEMA_CONTEXT, message, 512);

    if (!sqlGenResponse) {
      return NextResponse.json({ error: "Error al contactar el servicio de IA" }, { status: 502 });
    }

    // If no SQL needed, answer directly
    if (sqlGenResponse.includes("NO_SQL_NEEDED")) {
      const directAnswer = await callAnthropic(
        apiKey,
        ANSWER_CONTEXT,
        `Pregunta: ${message}\n\nNo se requiere consultar la base de datos para responder esto.`,
        256
      );
      return NextResponse.json({
        response: directAnswer ?? "No tengo información para responder esa pregunta.",
        data: null,
        sql: null,
      });
    }

    const sql = extractSqlFromResponse(sqlGenResponse);

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
        sql,
        sqlError: validation.error,
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
      return NextResponse.json({
        response: "Tuve un problema al consultar los datos. Por favor, intenta de nuevo.",
        data: null,
        sql,
        sqlError,
      });
    }

    // ── PASO 3: Generar respuesta en lenguaje natural con los datos ──────────
    const dataContext =
      queryData.length > 0
        ? `Datos obtenidos:\n${JSON.stringify(queryData, null, 2)}`
        : "La consulta no retornó resultados.";

    const naturalAnswer = await callAnthropic(
      apiKey,
      ANSWER_CONTEXT,
      `Pregunta del usuario: "${message}"\n\n${dataContext}`,
      256
    );

    return NextResponse.json({
      response: naturalAnswer ?? "No pude interpretar los resultados.",
      data: queryData,
      sql,
      sqlError: null,
    });
  } catch (err) {
    console.error("AI assistant error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
