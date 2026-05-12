// GET /api/patient-imports/[id]/failed-csv
//
// Returns a CSV of the rows that failed validation or insertion during
// a bulk import, so the admin can fix the source data and re-upload.
// We rebuild the failed-row CSV by joining the persisted error_summary
// (in patient_imports) against the original CSV pulled from Storage.
//
// Why join: error_summary is intentionally truncated to ~200 entries
// to keep the audit row small. For the download endpoint we want the
// full set, so we re-parse the original CSV and emit rows that the
// summary flagged. If error_summary is truncated, only the first ~200
// failures get exported (documented limit).

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { parseCSV, buildFailedCsv } from "@/lib/patient-imports/csv";

export const runtime = "nodejs";

type ErrorEntry = {
  row: number;
  dni?: string | null;
  reason: string;
  code?: string | null;
};

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

  const { data: importRow, error: importErr } = await supabase
    .from("patient_imports")
    .select("id, organization_id, csv_filename, csv_storage_path, error_summary")
    .eq("id", id)
    .single();

  if (importErr || !importRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const errors = (importRow.error_summary ?? []) as ErrorEntry[];
  if (errors.length === 0 || !importRow.csv_storage_path) {
    // Nothing to download — return an empty CSV with just the header.
    const empty = buildFailedCsv([]);
    return new NextResponse(empty, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="errores_${importRow.csv_filename}"`,
      },
    });
  }

  // Pull original CSV from Storage (service-role; the admin signed in
  // owns the row so RLS would allow it anyway but we keep it simple).
  const admin = createAdminClient();
  const { data: blob, error: downloadErr } = await admin.storage
    .from("patient-imports")
    .download(importRow.csv_storage_path);

  if (downloadErr || !blob) {
    return NextResponse.json(
      { error: "No se encontró el CSV original" },
      { status: 404 }
    );
  }

  const text = await blob.text();
  const { rows } = parseCSV(text);

  // row numbers in error_summary are 1-based on the CSV including the
  // header row, so row N corresponds to rows[N-2].
  const byRow = new Map<number, ErrorEntry>();
  for (const e of errors) byRow.set(e.row, e);

  const failed: { row: number; reason: string; raw: Record<string, string> }[] = [];
  for (const [rowNum, entry] of byRow.entries()) {
    const idx = rowNum - 2;
    if (idx >= 0 && idx < rows.length) {
      failed.push({ row: rowNum, reason: entry.reason, raw: rows[idx] });
    }
  }
  failed.sort((a, b) => a.row - b.row);

  const csv = buildFailedCsv(failed);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="errores_${importRow.csv_filename}"`,
    },
  });
}
