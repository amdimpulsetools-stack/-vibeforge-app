import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { logClinicalAccess } from "@/lib/audit/clinical-access";

const BUCKET = "clinical-photos";
const THUMB_SIGN_TTL = 60 * 60; // 1h — gallery thumbnails
const MAX_DISPLAY_BYTES = 6 * 1024 * 1024; // matches bucket-level cap
const MAX_THUMB_BYTES = 512 * 1024;
const ALLOWED_MIME = ["image/webp", "image/jpeg", "image/png"];
const VALID_PHASES = ["before", "after", "progress", "final"];

// ─── GET: list a patient's photos with signed thumbnail URLs ──────────
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const patientId = request.nextUrl.searchParams.get("patient_id");
  if (!patientId) return NextResponse.json({ error: "patient_id requerido" }, { status: 400 });

  // RLS scopes patient_photos to the caller's org(s); no manual org filter
  // needed for correctness, but the index makes this fast.
  const { data: rows, error } = await supabase
    .from("patient_photos")
    .select("id, patient_id, appointment_id, service_id, doctor_id, storage_path, thumbnail_path, file_size_bytes, mime_type, phase, body_zone, is_face_visible, notes, taken_at, created_at, organization_id")
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .order("taken_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const photos = rows ?? [];

  // Batch-sign all thumbnails in one round-trip — the gallery only needs
  // these tiny renditions; the full display image is signed lazily by the
  // [id] route when a photo is expanded.
  let signed: Record<string, string> = {};
  if (photos.length > 0) {
    const { data: urls } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(photos.map((p) => p.thumbnail_path), THUMB_SIGN_TTL);
    if (urls) {
      signed = Object.fromEntries(
        urls.filter((u) => u.signedUrl && u.path).map((u) => [u.path as string, u.signedUrl])
      );
    }
  }

  const data = photos.map((p) => ({
    ...p,
    thumbnail_url: signed[p.thumbnail_path] ?? null,
  }));

  if (photos.length > 0) {
    logClinicalAccess({
      organizationId: photos[0].organization_id,
      userId: user.id,
      resourceType: "attachment",
      action: "list",
      patientId,
      metadata: { kind: "dermatology_photos", count: photos.length },
    });
  }

  return NextResponse.json({ data });
}

// ─── POST: upload one photo (display + thumbnail, pre-compressed) ─────
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const form = await request.formData();
  const display = form.get("display") as File | null;
  const thumb = form.get("thumb") as File | null;
  const patientId = form.get("patient_id") as string | null;
  const appointmentId = (form.get("appointment_id") as string) || null;
  const serviceId = (form.get("service_id") as string) || null;
  const doctorId = (form.get("doctor_id") as string) || null;
  const phase = ((form.get("phase") as string) || "before").toLowerCase();
  const bodyZone = ((form.get("body_zone") as string) || "").trim() || null;
  const isFaceVisible = form.get("is_face_visible") === "true";
  const notes = ((form.get("notes") as string) || "").trim() || null;
  const takenAtRaw = (form.get("taken_at") as string) || null;

  if (!display || !thumb || !patientId) {
    return NextResponse.json({ error: "display, thumb y patient_id requeridos" }, { status: 400 });
  }
  if (!VALID_PHASES.includes(phase)) {
    return NextResponse.json({ error: "Fase inválida" }, { status: 400 });
  }
  if (display.size > MAX_DISPLAY_BYTES || thumb.size > MAX_THUMB_BYTES) {
    return NextResponse.json({ error: "Imagen demasiado grande tras compresión" }, { status: 400 });
  }
  if (!ALLOWED_MIME.includes(display.type) || !ALLOWED_MIME.includes(thumb.type)) {
    return NextResponse.json({ error: "Tipo de imagen no permitido" }, { status: 400 });
  }

  // Derive the org from the PATIENT (RLS-safe) instead of picking an
  // arbitrary membership — correct for doctors who belong to several orgs.
  const { data: patient, error: patErr } = await supabase
    .from("patients")
    .select("organization_id")
    .eq("id", patientId)
    .single();
  if (patErr || !patient) {
    return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  }
  const orgId = patient.organization_id;

  const stamp = Date.now();
  const base = `${orgId}/${patientId}/${stamp}`;
  const displayPath = `${base}-d.webp`;
  const thumbPath = `${base}-t.webp`;

  const up1 = await supabase.storage.from(BUCKET).upload(displayPath, display, {
    cacheControl: "31536000", // 1y — content is immutable per path
    contentType: "image/webp",
    upsert: false,
  });
  if (up1.error) {
    return NextResponse.json({ error: "Error al subir imagen: " + up1.error.message }, { status: 500 });
  }
  const up2 = await supabase.storage.from(BUCKET).upload(thumbPath, thumb, {
    cacheControl: "31536000",
    contentType: "image/webp",
    upsert: false,
  });
  if (up2.error) {
    // Roll back the display object so we never orphan storage.
    await supabase.storage.from(BUCKET).remove([displayPath]);
    return NextResponse.json({ error: "Error al subir miniatura: " + up2.error.message }, { status: 500 });
  }

  const { data: row, error: insErr } = await supabase
    .from("patient_photos")
    .insert({
      organization_id: orgId,
      patient_id: patientId,
      appointment_id: appointmentId,
      service_id: serviceId,
      doctor_id: doctorId,
      uploaded_by: user.id,
      storage_path: displayPath,
      thumbnail_path: thumbPath,
      file_size_bytes: display.size,
      mime_type: "image/webp",
      phase,
      body_zone: bodyZone,
      is_face_visible: isFaceVisible,
      notes,
      taken_at: takenAtRaw ? new Date(takenAtRaw).toISOString() : new Date().toISOString(),
    })
    .select("id, patient_id, appointment_id, service_id, doctor_id, storage_path, thumbnail_path, file_size_bytes, mime_type, phase, body_zone, is_face_visible, notes, taken_at, created_at")
    .single();

  if (insErr) {
    await supabase.storage.from(BUCKET).remove([displayPath, thumbPath]);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Sign the thumbnail so the client can render it immediately.
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(thumbPath, THUMB_SIGN_TTL);

  logClinicalAccess({
    organizationId: orgId,
    userId: user.id,
    resourceType: "attachment",
    action: "create",
    patientId,
    resourceId: row.id,
    metadata: { kind: "dermatology_photo", phase, file_size: display.size },
  });

  return NextResponse.json(
    { data: { ...row, thumbnail_url: signed?.signedUrl ?? null } },
    { status: 201 }
  );
}
