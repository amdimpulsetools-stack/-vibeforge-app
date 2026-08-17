import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { logClinicalAccess } from "@/lib/audit/clinical-access";

const BUCKET = "clinical-photos";
const DISPLAY_SIGN_TTL = 60 * 60; // 1h — comparator renders the full display rendition

interface PhotoRef {
  id: string;
  storage_path: string;
  taken_at: string;
  is_face_visible: boolean;
  deleted_at: string | null;
}

// The comparisons table is newer than the generated Database types, so
// the embedded-join select can't be inferred — shape it explicitly.
interface ComparisonRow {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  organization_id: string;
  before: PhotoRef | null;
  after: PhotoRef | null;
}

// ─── GET: list a patient's comparisons with signed display URLs ───────
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const patientId = request.nextUrl.searchParams.get("patient_id");
  if (!patientId) return NextResponse.json({ error: "patient_id requerido" }, { status: 400 });

  const { data: rows, error } = await supabase
    .from("patient_photo_comparisons")
    .select(
      "id, title, description, created_at, organization_id, " +
      "before:patient_photos!patient_photo_comparisons_before_photo_id_fkey(id, storage_path, taken_at, is_face_visible, deleted_at), " +
      "after:patient_photos!patient_photo_comparisons_after_photo_id_fkey(id, storage_path, taken_at, is_face_visible, deleted_at)"
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A soft-deleted photo invalidates its comparison — hide it rather
  // than render a card with a broken half.
  const alive = ((rows ?? []) as unknown as ComparisonRow[]).filter(
    (r): r is ComparisonRow & { before: PhotoRef; after: PhotoRef } =>
      !!r.before && !!r.after && !r.before.deleted_at && !r.after.deleted_at
  );

  let signed: Record<string, string> = {};
  if (alive.length > 0) {
    const paths = Array.from(
      new Set(alive.flatMap((r) => [r.before.storage_path, r.after.storage_path]))
    );
    const { data: urls } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, DISPLAY_SIGN_TTL);
    if (urls) {
      signed = Object.fromEntries(
        urls.filter((u) => u.signedUrl && u.path).map((u) => [u.path as string, u.signedUrl])
      );
    }
  }

  const data = alive.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    created_at: r.created_at,
    before: {
      id: r.before.id,
      url: signed[r.before.storage_path] ?? null,
      taken_at: r.before.taken_at,
      is_face_visible: r.before.is_face_visible,
    },
    after: {
      id: r.after.id,
      url: signed[r.after.storage_path] ?? null,
      taken_at: r.after.taken_at,
      is_face_visible: r.after.is_face_visible,
    },
  }));

  if (alive.length > 0) {
    logClinicalAccess({
      organizationId: alive[0].organization_id,
      userId: user.id,
      resourceType: "attachment",
      action: "list",
      patientId,
      metadata: { kind: "dermatology_comparisons", count: alive.length },
    });
  }

  return NextResponse.json({ data });
}

// ─── POST: create a comparison from two existing photos ───────────────
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: {
    patient_id?: string;
    before_photo_id?: string;
    after_photo_id?: string;
    title?: string;
    description?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const patientId = body.patient_id ?? "";
  const beforeId = body.before_photo_id ?? "";
  const afterId = body.after_photo_id ?? "";
  const title = (body.title ?? "").trim();
  const description = (body.description ?? "").trim() || null;

  if (!patientId || !beforeId || !afterId || !title) {
    return NextResponse.json(
      { error: "patient_id, before_photo_id, after_photo_id y title requeridos" },
      { status: 400 }
    );
  }
  if (beforeId === afterId) {
    return NextResponse.json({ error: "Elige dos fotos distintas" }, { status: 400 });
  }
  if (title.length > 120) {
    return NextResponse.json({ error: "Título demasiado largo (máx. 120)" }, { status: 400 });
  }

  // Both photos must exist, belong to the patient and be alive.
  // RLS already scopes the read to the caller's org(s).
  const { data: photos, error: phErr } = await supabase
    .from("patient_photos")
    .select("id, patient_id, organization_id, deleted_at")
    .in("id", [beforeId, afterId]);

  if (phErr) return NextResponse.json({ error: phErr.message }, { status: 500 });
  if (
    !photos ||
    photos.length !== 2 ||
    photos.some((p) => p.patient_id !== patientId || p.deleted_at !== null)
  ) {
    return NextResponse.json({ error: "Fotos no válidas para este paciente" }, { status: 400 });
  }

  const orgId = photos[0].organization_id;

  const { data: row, error: insErr } = await supabase
    .from("patient_photo_comparisons")
    .insert({
      organization_id: orgId,
      patient_id: patientId,
      before_photo_id: beforeId,
      after_photo_id: afterId,
      title,
      description,
      created_by: user.id,
    })
    .select("id, title, description, created_at")
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  logClinicalAccess({
    organizationId: orgId,
    userId: user.id,
    resourceType: "attachment",
    action: "create",
    patientId,
    resourceId: row.id,
    metadata: { kind: "dermatology_comparison" },
  });

  return NextResponse.json({ data: row }, { status: 201 });
}
