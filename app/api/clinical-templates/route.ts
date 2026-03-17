import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { clinicalTemplateSchema } from "@/lib/validations/api";

// GET /api/clinical-templates — List templates for current doctor/org
export async function GET(request: NextRequest) {
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

  const specialty = request.nextUrl.searchParams.get("specialty");

  // RLS handles visibility (global + own templates)
  let query = supabase
    .from("clinical_templates")
    .select("*, doctors(full_name)")
    .order("name");

  if (specialty) {
    query = query.eq("specialty", specialty);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Clinical templates fetch error:", error);
    return NextResponse.json({ error: "Error al obtener plantillas" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

// POST /api/clinical-templates — Create a new template
export async function POST(request: NextRequest) {
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

  const parsed = await parseBody(request, clinicalTemplateSchema);
  if (parsed.error) return parsed.error;

  // Get user's org
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const isAdmin = membership.role === "owner" || membership.role === "admin";

  // Non-admin doctors can only create personal templates
  if (!isAdmin && parsed.data.is_global) {
    return NextResponse.json(
      { error: "Solo administradores pueden crear plantillas globales" },
      { status: 403 }
    );
  }

  // If doctor_id not provided and user is a doctor, auto-assign
  let doctorId = parsed.data.doctor_id ?? null;
  if (!doctorId && !parsed.data.is_global) {
    const { data: doctor } = await supabase
      .from("doctors")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    doctorId = doctor?.id ?? null;
  }

  const { data, error } = await supabase
    .from("clinical_templates")
    .insert({
      ...parsed.data,
      organization_id: membership.organization_id,
      doctor_id: doctorId,
    })
    .select("*, doctors(full_name)")
    .single();

  if (error) {
    console.error("Clinical template create error:", error);
    return NextResponse.json({ error: "Error al crear plantilla" }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
