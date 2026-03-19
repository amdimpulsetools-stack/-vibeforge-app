import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { clinicalNoteSchema } from "@/lib/validations/api";

// GET /api/clinical-notes?appointment_id=xxx
// Returns the clinical note for a given appointment
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

  const appointmentId = request.nextUrl.searchParams.get("appointment_id");
  const patientId = request.nextUrl.searchParams.get("patient_id");

  if (!appointmentId && !patientId) {
    return NextResponse.json(
      { error: "Se requiere appointment_id o patient_id" },
      { status: 400 }
    );
  }

  // Single note by appointment
  if (appointmentId) {
    const { data, error } = await supabase
      .from("clinical_notes")
      .select("*, doctors(full_name, color)")
      .eq("appointment_id", appointmentId)
      .maybeSingle();

    if (error) {
      console.error("Clinical note fetch error:", error);
      return NextResponse.json({ error: "Error al obtener nota clínica" }, { status: 500 });
    }

    return NextResponse.json({ data });
  }

  // All notes for a patient (history)
  const { data, error } = await supabase
    .from("clinical_notes")
    .select("*, doctors(full_name, color)")
    .eq("patient_id", patientId!)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Clinical notes fetch error:", error);
    return NextResponse.json({ error: "Error al obtener notas clínicas" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

// POST /api/clinical-notes — Create a new clinical note
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

  const parsed = await parseBody(request, clinicalNoteSchema);
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

  // Verify doctor belongs to current user (only the treating doctor can create notes)
  const { data: doctor } = await supabase
    .from("doctors")
    .select("id")
    .eq("id", parsed.data.doctor_id)
    .eq("user_id", user.id)
    .maybeSingle();

  // Allow admins to create notes on behalf of doctors
  const isAdmin = membership.role === "owner" || membership.role === "admin";
  if (!doctor && !isAdmin) {
    return NextResponse.json(
      { error: "Solo el doctor asignado o un admin puede crear notas clínicas" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("clinical_notes")
    .insert({
      ...parsed.data,
      organization_id: membership.organization_id,
      vitals: parsed.data.vitals ?? {},
    })
    .select("*, doctors(full_name, color)")
    .single();

  if (error) {
    // Unique constraint violation — note already exists
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Ya existe una nota clínica para esta cita" },
        { status: 409 }
      );
    }
    console.error("Clinical note create error:", error);
    return NextResponse.json({ error: "Error al crear nota clínica" }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
