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

  const parsed = await parseBody(request, clinicalTemplateUpdateSchema);
  if (parsed.error) return parsed.error;

  // RLS ensures only owner/admin can update
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

  // RLS ensures only owner can delete
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
