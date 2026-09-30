import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

// ─── Types & defaults (kept in sync with lib/whatsapp-clipboard-config.ts) ───
const CLIPBOARD_TEMPLATE_KINDS = [
  "post_appointment",
  "second_consultation_followup",
  "budget_followup",
  "reschedule_notice",
  "reschedule_coordinate",
  "prereserva",
] as const;

type ClipboardTemplateKind = (typeof CLIPBOARD_TEMPLATE_KINDS)[number];

// Kinds que el CHECK de `org_whatsapp_clipboard_templates.kind` solo acepta
// desde la mig 274. Sin ella, guardarlos falla con 23514 → 409 legible.
const MIG_274_KINDS: readonly ClipboardTemplateKind[] = [
  "reschedule_notice",
  "reschedule_coordinate",
  "prereserva",
];
const MIG_274_MISSING_MESSAGE =
  "Actualiza la base (mig 274) para editar esta plantilla";

const DEFAULT_TEMPLATES: Record<ClipboardTemplateKind, string> = {
  post_appointment:
    "Hola {{NOMBRE}}, tu cita ha sido reservada para el día {{FECHA}} a las {{HORA}} con {{DOCTOR}} en {{CLINICA}}.\n\nDirección: {{DIRECCION}}.\n¡Te esperamos!",
  second_consultation_followup:
    "Hola {{NOMBRE}}, somos de {{CLINICA}} 👋\n\nQueremos saber cómo te sientes después de tu primera consulta con {{DOCTOR}}. ¿Has podido revisar las indicaciones? Estamos a tu disposición para coordinar tu segunda consulta cuando estés lista.\n\n¿Te gustaría agendar?",
  budget_followup:
    "Hola {{NOMBRE}} 👋\n\nTe escribimos de {{CLINICA}} para hacer seguimiento al presupuesto de {{TRATAMIENTO}} que te enviamos. ¿Has tenido oportunidad de revisarlo? Cualquier duda con gusto te la resolvemos.\n\nQuedamos atentos a tus comentarios 💚",
  reschedule_notice:
    "Hola {{NOMBRE}} 👋\n\nTe escribimos de {{CLINICA}}: tuvimos que cancelar tu cita de {{SERVICIO}} del {{FECHA}} a las {{HORA}}. Queremos darte una nueva fecha. ¿Qué día y horario te acomoda?\n\nQuedamos atentos.",
  reschedule_coordinate:
    "Hola {{NOMBRE}} 👋\n\nTe escribimos de {{CLINICA}} para reprogramar tu cita de {{SERVICIO}} del {{FECHA}} a las {{HORA}}. ¿Qué día y horario te acomoda?\n\nQuedamos atentos.",
  prereserva:
    "Hola {{NOMBRE}} 👋\n\nTu horario del {{FECHA}} a las {{HORA}} ({{SERVICIO}}) en {{CLINICA}} queda separado hasta las {{VENCE}}. Para confirmarlo, envía tu pago de {{MONTO}}.\n\n¡Gracias!",
};

const putSchema = z.object({
  kind: z.enum(CLIPBOARD_TEMPLATE_KINDS),
  template: z.string().min(1).max(4000),
});

// Local row type — Supabase types not regenerated yet (see migration 139).
interface OrgClipboardTemplateRow {
  kind: ClipboardTemplateKind;
  template: string;
}

// GET /api/whatsapp-clipboard-templates — list every kind for the caller's org.
// If a row doesn't exist for a kind, returns the in-code default so the UI
// never sees an empty template.
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    // Cast: table not yet present in generated Supabase types.
    .from("org_whatsapp_clipboard_templates" as never)
    .select("kind, template")
    .eq("organization_id", membership.organization_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byKind = new Map<ClipboardTemplateKind, string>();
  for (const row of (rows ?? []) as unknown as OrgClipboardTemplateRow[]) {
    byKind.set(row.kind, row.template);
  }

  const templates = CLIPBOARD_TEMPLATE_KINDS.map((kind) => ({
    kind,
    template: byKind.get(kind) ?? DEFAULT_TEMPLATES[kind],
  }));

  return NextResponse.json({ templates });
}

// PUT /api/whatsapp-clipboard-templates — upsert one kind for the caller's org.
// Admin/owner only.
export async function PUT(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 404 });
  }

  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { kind, template } = parsed.data;

  const { error } = await supabase
    .from("org_whatsapp_clipboard_templates" as never)
    .upsert(
      {
        organization_id: membership.organization_id,
        kind,
        template,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "organization_id,kind" }
    );

  if (error) {
    // 23514 = check_violation: la base aún no tiene la mig 274, cuyo CHECK
    // de `kind` acepta los kinds nuevos. Leer sigue devolviendo el default.
    if (error.code === "23514" && MIG_274_KINDS.includes(kind)) {
      return NextResponse.json(
        { error: MIG_274_MISSING_MESSAGE, code: "migration_274_missing" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ kind, template });
}
