import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidMetaTemplateName } from "@/lib/whatsapp/templates";

export const runtime = "nodejs";

/**
 * GET /api/whatsapp/templates
 * Lists all WhatsApp templates for the organization.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  const { data: templates, error } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .eq("organization_id", member.organization_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(templates);
}

/**
 * POST /api/whatsapp/templates
 * Creates a new WhatsApp template (local draft).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!member || !["owner", "admin"].includes(member.role)) {
    return NextResponse.json({ error: "No tienes permisos" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const metaTemplateName = body.meta_template_name as string;
  if (!metaTemplateName || !isValidMetaTemplateName(metaTemplateName)) {
    return NextResponse.json(
      { error: "Nombre de plantilla inválido. Solo minúsculas, números y guiones bajos." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("whatsapp_templates")
    .insert({
      organization_id: member.organization_id,
      local_template_id: (body.local_template_id as string) || null,
      meta_template_name: metaTemplateName,
      category: (body.category as string) || "UTILITY",
      language: (body.language as string) || "es",
      status: "DRAFT",
      header_type: (body.header_type as string) || "NONE",
      header_content: (body.header_content as string) || null,
      body_text: (body.body_text as string) || "",
      footer_text: (body.footer_text as string) || null,
      buttons: body.buttons || [],
      variable_mapping: body.variable_mapping || {},
      sample_values: body.sample_values || {},
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
