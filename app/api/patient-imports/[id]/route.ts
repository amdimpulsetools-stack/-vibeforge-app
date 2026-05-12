// GET /api/patient-imports/[id]
//
// Polled by the bulk-import modal every ~2s to render the progress
// bar and final summary. Read-only.

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
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

  // RLS scopes this to the caller's org automatically (pi_select).
  const { data, error } = await supabase
    .from("patient_imports")
    .select(
      "id, organization_id, imported_by_user_id, started_at, finished_at, csv_filename, csv_storage_path, total_rows, inserted_rows, skipped_duplicates, failed_rows, error_summary, status, created_at, updated_at"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Cheap derived progress for the UI. If processing has started but
  // not finished we approximate; once finished it is exact.
  const processed =
    data.inserted_rows + data.skipped_duplicates + data.failed_rows;
  const progress =
    data.status === "completed"
      ? 100
      : data.total_rows > 0
      ? Math.min(99, Math.round((processed / data.total_rows) * 100))
      : 0;

  return NextResponse.json({ ...data, progress });
}
