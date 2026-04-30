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

// PATCH /api/clinical-document-templates/[slug] — actualiza body_html, etc.
// Solo owner/admin (RLS lo refuerza con is_org_admin).
export async function PATCH(
  request: NextRequest,
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

  const { data, error } = await supabase
    .from("clinical_document_templates")
    .update(parsed.data)
    .eq("slug", slug)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Clinical document template update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Plantilla no encontrada o sin permiso" },
      { status: 404 }
    );
  }

  return NextResponse.json({ data });
}
