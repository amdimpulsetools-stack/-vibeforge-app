import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { treatmentPlanTemplateUpdateSchema } from "@/lib/validations/api";

// PATCH /api/treatment-plan-templates/[id] — Update a template
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

  const parsed = await parseBody(request, treatmentPlanTemplateUpdateSchema);
  if (parsed.error) return parsed.error;

  const { data: template } = await supabase
    .from("treatment_plan_templates")
    .select("organization_id, doctor_id, is_global")
    .eq("id", id)
    .single();

  if (!template || template.organization_id !== membership.organization_id) {
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  // Admin/owner can modify any template; doctors only their own non-global
  if (!["owner", "admin"].includes(membership.role)) {
    const { data: doctor } = await supabase
      .from("doctors")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!doctor || template.doctor_id !== doctor.id || template.is_global) {
      return NextResponse.json(
        { error: "No tienes permisos para modificar esta plantilla" },
        { status: 403 }
      );
    }
  }

  const { data, error } = await supabase
    .from("treatment_plan_templates")
    .update(parsed.data)
    .eq("id", id)
    .select("*, doctors(full_name)")
    .single();

  if (error) {
    console.error("Treatment plan template update error:", error);
    return NextResponse.json({ error: "Error al actualizar plantilla" }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// DELETE /api/treatment-plan-templates/[id] — Delete a template
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

  const { data: template } = await supabase
    .from("treatment_plan_templates")
    .select("organization_id, doctor_id, is_global")
    .eq("id", id)
    .single();

  if (!template || template.organization_id !== membership.organization_id) {
    return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
  }

  if (!["owner", "admin"].includes(membership.role)) {
    const { data: doctor } = await supabase
      .from("doctors")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!doctor || template.doctor_id !== doctor.id || template.is_global) {
      return NextResponse.json(
        { error: "No tienes permisos para eliminar esta plantilla" },
        { status: 403 }
      );
    }
  }

  const { error } = await supabase
    .from("treatment_plan_templates")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Treatment plan template delete error:", error);
    return NextResponse.json({ error: "Error al eliminar plantilla" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
