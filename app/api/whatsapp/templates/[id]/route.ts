import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const whatsappTemplateUpdateSchema = z.object({
  meta_template_name: z.string().min(1).max(512),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]),
  language: z.string().min(2).max(10),
  header_type: z.enum(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"]),
  header_content: z.string().max(1000).nullable(),
  body_text: z.string().min(1).max(1024),
  footer_text: z.string().max(60).nullable(),
  buttons: z.array(z.record(z.unknown())),
  variable_mapping: z.record(z.string(), z.unknown()),
  sample_values: z.record(z.string(), z.unknown()),
  local_template_id: z.string().uuid().nullable(),
}).partial();

export const runtime = "nodejs";

/**
 * GET /api/whatsapp/templates/[id]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: template, error } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !template) {
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  return NextResponse.json(template);
}

/**
 * PUT /api/whatsapp/templates/[id]
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const parsed = whatsappTemplateUpdateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Only allow editing drafts or rejected templates
  const { data: existing } = await supabase
    .from("whatsapp_templates")
    .select("status, organization_id")
    .eq("id", id)
    .single();

  if (!existing || existing.organization_id !== member.organization_id) {
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  if (!["DRAFT", "REJECTED"].includes(existing.status)) {
    return NextResponse.json(
      { error: "Solo se pueden editar plantillas en borrador o rechazadas" },
      { status: 400 }
    );
  }

  const updatePayload: Record<string, unknown> = { ...parsed.data };

  // Reset status to DRAFT when editing a rejected template
  if (existing.status === "REJECTED") {
    updatePayload.status = "DRAFT";
    updatePayload.rejection_reason = null;
  }

  const { data, error } = await supabase
    .from("whatsapp_templates")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * DELETE /api/whatsapp/templates/[id]
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const { error } = await supabase
    .from("whatsapp_templates")
    .delete()
    .eq("id", id)
    .eq("organization_id", member.organization_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
