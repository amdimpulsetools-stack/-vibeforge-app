import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";

/**
 * GET /api/clinical-notes/[id]/versions
 * Returns all versions (audit trail) for a clinical note
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  // Verify user belongs to an organization
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No organization membership" }, { status: 403 });
  }

  // Verify the clinical note belongs to the user's organization
  const { data: note } = await supabase
    .from("clinical_notes")
    .select("id")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .single();

  if (!note) {
    return NextResponse.json({ error: "Clinical note not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("clinical_note_versions")
    .select("*")
    .eq("clinical_note_id", id)
    .order("version_number", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}
