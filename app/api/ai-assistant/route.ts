import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SCHEMA_CONTEXT = `
Eres un asistente de base de datos para una clínica médica. Tu rol es responder preguntas sobre los datos de la clínica consultando la base de datos de forma segura y solo lectura.

ESQUEMA DE LA BASE DE DATOS:
- patients: id, first_name, last_name, dni, phone, email, status (active/inactive), notes, viene_desde, adicional_1, adicional_2, created_at
- appointments: id, patient_name, patient_phone, patient_id, doctor_id, office_id, service_id, appointment_date (YYYY-MM-DD), start_time, end_time, status (scheduled/confirmed/completed/cancelled), origin, payment_method, responsible, notes, created_at
- doctors: id, full_name, color, specialty, is_active
- offices: id, name, display_order, is_active
- services: id, name, base_price, duration_minutes, is_active, category_id
- patient_payments: id, patient_id, appointment_id, amount, payment_method, payment_date, notes
- patient_tags: id, patient_id, tag
- schedule_blocks: id, block_date, start_time, end_time, office_id, all_day, reason

REGLAS ESTRICTAS:
1. SOLO puedes consultar datos (SELECT). Nunca INSERT, UPDATE, DELETE, DROP, ALTER.
2. Si el usuario pide modificar datos, responde: "Solo puedo consultar información, no modificar registros."
3. Para consultas simples, responde directamente con la información relevante.
4. Si necesitas ejecutar SQL, inclúyelo en un bloque \`\`\`sql ... \`\`\` en tu respuesta.
5. Usa JOIN cuando sea necesario para obtener información completa.
6. Limita resultados a máximo 100 filas.
7. Responde siempre en español.

EJEMPLOS DE CONSULTAS VÁLIDAS:
- "¿Cuál fue la última cita del paciente Juan Pérez?"
- "¿Cuántas citas se atendieron esta semana?"
- "¿Cuáles son los pacientes con deuda pendiente?"
- "¿Qué doctor tiene más citas este mes?"
- "¿Cuántos pacientes vienen de Instagram?"
- "¿Cuál es el total facturado en enero?"
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

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
    }

    // Check for write intent before calling AI
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

    // Call Anthropic API
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        system: SCHEMA_CONTEXT,
        messages: [{ role: "user", content: message }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error("Anthropic API error:", errBody);
      return NextResponse.json(
        { error: "Error al contactar el servicio de IA" },
        { status: 502 }
      );
    }

    const anthropicData = await anthropicRes.json();
    const aiText: string = anthropicData.content?.[0]?.text ?? "";

    // Extract SQL if present
    const sql = extractSqlFromResponse(aiText);
    let queryData: unknown[] | null = null;
    let sqlError: string | null = null;

    if (sql) {
      const validation = validateSql(sql);

      if (!validation.valid) {
        sqlError = validation.error ?? "Consulta no permitida";
      } else {
        // Execute via Supabase RPC
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
      }
    }

    // Clean AI response (remove sql blocks for display, we'll show data separately)
    const cleanResponse = aiText.replace(/```sql[\s\S]*?```/gi, "").trim();

    return NextResponse.json({
      response: cleanResponse || aiText,
      data: queryData,
      sql: sql,
      sqlError: sqlError,
    });
  } catch (err) {
    console.error("AI assistant error:", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
