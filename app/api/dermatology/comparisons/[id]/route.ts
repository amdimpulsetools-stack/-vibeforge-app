import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { logClinicalAccess } from "@/lib/audit/clinical-access";

// ─── DELETE: remove a comparison (the photos are untouched) ───────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { id } = await params;

  const { data: row, error: readErr } = await supabase
    .from("patient_photo_comparisons")
    .select("id, patient_id, organization_id")
    .eq("id", id)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const { error: delErr } = await supabase
    .from("patient_photo_comparisons")
    .delete()
    .eq("id", id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  logClinicalAccess({
    organizationId: row.organization_id,
    userId: user.id,
    resourceType: "attachment",
    action: "delete",
    patientId: row.patient_id,
    resourceId: id,
    metadata: { kind: "dermatology_comparison" },
  });

  return NextResponse.json({ ok: true });
}
