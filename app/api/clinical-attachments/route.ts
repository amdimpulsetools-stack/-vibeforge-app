import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const patientId = request.nextUrl.searchParams.get("patient_id");
  const noteId = request.nextUrl.searchParams.get("clinical_note_id");

  let query = supabase
    .from("clinical_attachments")
    .select("id, patient_id, clinical_note_id, appointment_id, file_name, file_type, file_size, storage_path, category, description, uploaded_by, organization_id, created_at")
    .order("created_at", { ascending: false });

  if (patientId) query = query.eq("patient_id", patientId);
  if (noteId) query = query.eq("clinical_note_id", noteId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const patientId = formData.get("patient_id") as string;
  const clinicalNoteId = formData.get("clinical_note_id") as string | null;
  const appointmentId = formData.get("appointment_id") as string | null;
  const category = (formData.get("category") as string) || "general";
  const description = formData.get("description") as string | null;

  if (!file || !patientId) {
    return NextResponse.json({ error: "Archivo y patient_id requeridos" }, { status: 400 });
  }

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "El archivo no puede superar 10MB" }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 403 });

  // Upload to Supabase Storage
  const ext = file.name.split(".").pop() || "bin";
  const storagePath = `${membership.organization_id}/${patientId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("clinical-files")
    .upload(storagePath, file, { cacheControl: "3600", upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: "Error al subir archivo: " + uploadError.message }, { status: 500 });
  }

  // Create DB record
  const { data, error } = await supabase
    .from("clinical_attachments")
    .insert({
      organization_id: membership.organization_id,
      patient_id: patientId,
      clinical_note_id: clinicalNoteId || null,
      appointment_id: appointmentId || null,
      uploaded_by: user.id,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
      category,
      description: description || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data }, { status: 201 });
}
