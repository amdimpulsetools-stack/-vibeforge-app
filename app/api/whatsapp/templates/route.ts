import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidMetaTemplateName } from "@/lib/whatsapp/templates";
import { z } from "zod";

const whatsappTemplateCreateSchema = z.object({
  meta_template_name: z.string().min(1).max(512),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]).default("UTILITY"),
  language: z.string().min(2).max(10).default("es"),
  header_type: z.enum(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"]).default("NONE"),
  header_content: z.string().max(1000).nullable().default(null),
  body_text: z.string().max(1024).default(""),
  footer_text: z.string().max(60).nullable().default(null),
  buttons: z.array(z.record(z.unknown())).default([]),
  variable_mapping: z.record(z.string(), z.unknown()).default({}),
  sample_values: z.record(z.string(), z.unknown()).default({}),
  local_template_id: z.string().uuid().nullable().default(null),
});

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

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = whatsappTemplateCreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const body = parsed.data;

  if (!isValidMetaTemplateName(body.meta_template_name)) {
    return NextResponse.json(
      { error: "Nombre de plantilla inválido. Solo minúsculas, números y guiones bajos." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("whatsapp_templates")
    .insert({
      organization_id: member.organization_id,
      local_template_id: body.local_template_id,
      meta_template_name: body.meta_template_name,
      category: body.category,
      language: body.language,
      status: "DRAFT",
      header_type: body.header_type,
      header_content: body.header_content,
      body_text: body.body_text,
      footer_text: body.footer_text,
      buttons: body.buttons,
      variable_mapping: body.variable_mapping,
      sample_values: body.sample_values,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
