import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { logClinicalAccess } from "@/lib/audit/clinical-access";

const BUCKET = "clinical-photos";
const DISPLAY_SIGN_TTL = 60 * 60; // 1h

// ─── GET: signed URL for the full-size display image (lazy, on expand) ─
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS scopes the row to the caller's org; if it's not theirs, this 404s.
  const { data: photo } = await supabase
    .from("patient_photos")
    .select("storage_path, organization_id, patient_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(photo.storage_path, DISPLAY_SIGN_TTL);

  if (error || !signed) {
    return NextResponse.json({ error: "No se pudo generar el enlace" }, { status: 500 });
  }

  logClinicalAccess({
    organizationId: photo.organization_id,
    userId: user.id,
    resourceType: "attachment",
    action: "view",
    patientId: photo.patient_id,
    resourceId: id,
    metadata: { kind: "dermatology_photo" },
  });

  return NextResponse.json({ url: signed.signedUrl });
}

// ─── DELETE: soft-delete the row + remove both storage objects ────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: photo } = await supabase
    .from("patient_photos")
    .select("storage_path, thumbnail_path, organization_id, patient_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft-delete the row (retained for audit / Ley 29733), then drop the
  // storage objects so we don't pay to keep the bytes.
  const { error } = await supabase
    .from("patient_photos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.storage.from(BUCKET).remove([photo.storage_path, photo.thumbnail_path]);

  logClinicalAccess({
    organizationId: photo.organization_id,
    userId: user.id,
    resourceType: "attachment",
    action: "delete",
    patientId: photo.patient_id,
    resourceId: id,
    metadata: { kind: "dermatology_photo" },
  });

  return NextResponse.json({ success: true });
}
