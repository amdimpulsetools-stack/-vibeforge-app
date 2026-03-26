import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { clinicalTemplateUpdateSchema } from "@/lib/validations/api";

// PATCH /api/clinical-templates/[id] — Update a template
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  // Verify org membership and role
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No organization membership" }, { status: 403 });
  }

  const parsed = await parseBody(request, clinicalTemplateUpdateSchema);
  if (parsed.error) return parsed.error;

  // Fetch the template to check ownership
  const { data: template } = await supabase
    .from("clinical_templates")
    .select("organization_id, doctor_id, is_global")
    .eq("id", id)
    .single();

  if (!template || template.organization_id !== membership.organization_id) {
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  // Admin/owner can modify any template; doctors can only modify their own non-global templates
  if (!["owner", "admin"].includes(membership.role)) {
    const { data: doctor } = await supabase
      .from("doctors")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!doctor || template.doctor_id !== doctor.id || template.is_global) {
      return NextResponse.json({ error: "No tienes permisos para modificar esta plantilla" }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from("clinical_templates")
    .update(parsed.data)
    .eq("id", id)
    .select("*, doctors(full_name)")
    .single();

  if (error) {
    console.error("Clinical template update error:", error);
    return NextResponse.json({ error: "Error al actualizar plantilla" }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// DELETE /api/clinical-templates/[id] — Delete a template
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  // Verify org membership and role
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No organization membership" }, { status: 403 });
  }

  // Fetch the template to check ownership
  const { data: template } = await supabase
    .from("clinical_templates")
    .select("organization_id, doctor_id, is_global")
    .eq("id", id)
    .single();

  if (!template || template.organization_id !== membership.organization_id) {
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  // Admin/owner can delete any template; doctors can only delete their own non-global templates
  if (!["owner", "admin"].includes(membership.role)) {
    const { data: doctor } = await supabase
      .from("doctors")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!doctor || template.doctor_id !== doctor.id || template.is_global) {
      return NextResponse.json({ error: "No tienes permisos para eliminar esta plantilla" }, { status: 403 });
    }
  }

  const { error } = await supabase
    .from("clinical_templates")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Clinical template delete error:", error);
    return NextResponse.json({ error: "Error al eliminar plantilla" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
