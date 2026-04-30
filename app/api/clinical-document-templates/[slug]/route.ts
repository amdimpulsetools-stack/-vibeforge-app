import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";

const VALID_SLUGS = [
  "prescription",
  "clinical_note",
  "exam_order",
  "consent",
  "treatment_plan",
] as const;

type TemplateSlug = (typeof VALID_SLUGS)[number];

const updateSchema = z.object({
  body_html: z.string().max(50_000).optional(),
  is_enabled: z.boolean().optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
});

// GET /api/clinical-document-templates/[slug] — la plantilla de la org.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!VALID_SLUGS.includes(slug as TemplateSlug)) {
    return NextResponse.json({ error: "Slug inválido" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { data, error } = await supabase
    .from("clinical_document_templates")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Clinical document template fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// Default labels para auto-creación cuando la fila aún no existe
// (org creada después del seed, o migración aún no aplicada — el upsert
// igual funciona si la tabla existe).
const DEFAULT_NAMES: Record<TemplateSlug, string> = {
  prescription: "Receta médica",
  clinical_note: "Nota clínica SOAP",
  exam_order: "Orden de exámenes",
  consent: "Consentimiento informado",
  treatment_plan: "Plan de tratamiento",
};

// PATCH /api/clinical-document-templates/[slug] — actualiza body_html, etc.
// Hace upsert: si la fila no existe, la crea con los defaults. Solo
// owner/admin (RLS lo refuerza con is_org_admin tanto en INSERT como UPDATE).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!VALID_SLUGS.includes(slug as TemplateSlug)) {
    return NextResponse.json({ error: "Slug inválido" }, { status: 400 });
  }
  const validSlug = slug as TemplateSlug;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  // Resolver org del usuario (necesario para upsert si la fila no existe).
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Upsert: insert si no existe (org+slug), update si existe.
  const { data, error } = await supabase
    .from("clinical_document_templates")
    .upsert(
      {
        organization_id: membership.organization_id,
        slug: validSlug,
        name: parsed.data.name ?? DEFAULT_NAMES[validSlug],
        description: parsed.data.description ?? null,
        body_html: parsed.data.body_html ?? "",
        is_enabled: parsed.data.is_enabled ?? true,
      },
      { onConflict: "organization_id,slug" }
    )
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Clinical document template upsert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "No se pudo guardar la plantilla" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
