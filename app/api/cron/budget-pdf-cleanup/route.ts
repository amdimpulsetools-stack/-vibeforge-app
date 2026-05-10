import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteBudgetPdf } from "@/lib/budget-pdf/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/budget-pdf-cleanup
 *
 * Vercel Cron — monthly. Deletes generated budget PDFs that are old
 * enough to no longer warrant storage:
 *
 *   - rejected   → 6 months after rejected_at
 *   - accepted   → 2 years after accepted_at
 *   - expired    → 6 months after updated_at (forward-compat; the
 *                  current acceptance_status enum has no 'expired'
 *                  literal yet — this branch is a no-op until then)
 *
 * For each match: removes the file from the bucket, then nulls
 * `pdf_storage_path`/`pdf_generated_at`/`pdf_size_bytes` on the row
 * so the budget can be lazily re-rendered if someone opens it again.
 *
 * Auth: gated with CRON_SECRET like the other crons (same shape as
 * `app/api/cron/fertility-followup-contact/route.ts`).
 */

interface BudgetCleanupRow {
  id: string;
  pdf_storage_path: string;
  acceptance_status: string;
  accepted_at: string | null;
  rejected_at: string | null;
  updated_at: string;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    cronSecret.length < 32 ||
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Window: anything > 6 months ago for rejected/expired,
  // > 2 years ago for accepted. Compute the cutoffs in JS so we can
  // OR-compose them in a single .or() clause — Supabase JS doesn't
  // expose CASE expressions cleanly.
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const sixMonthsIso = sixMonthsAgo.toISOString();
  const twoYearsIso = twoYearsAgo.toISOString();

  // Fetch candidates. We over-fetch by status and filter the time
  // condition client-side so the OR composition stays readable.
  const { data, error } = await supabase
    .from("budget_records")
    .select(
      "id, pdf_storage_path, acceptance_status, accepted_at, rejected_at, updated_at",
    )
    .not("pdf_storage_path", "is", null)
    .in("acceptance_status", ["rejected", "accepted", "expired"]);

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "query failed" },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as BudgetCleanupRow[];
  const toDelete = rows.filter((r) => {
    if (r.acceptance_status === "rejected") {
      return r.rejected_at !== null && r.rejected_at < sixMonthsIso;
    }
    if (r.acceptance_status === "accepted") {
      return r.accepted_at !== null && r.accepted_at < twoYearsIso;
    }
    if (r.acceptance_status === "expired") {
      return r.updated_at < sixMonthsIso;
    }
    return false;
  });

  let deleted = 0;
  let storageFailed = 0;
  let dbFailed = 0;

  for (const row of toDelete) {
    try {
      await deleteBudgetPdf(supabase, row.pdf_storage_path);
    } catch {
      storageFailed += 1;
      // Don't bail — we still want to null the row so future renders
      // don't think the file exists.
    }
    const { error: updErr } = await supabase
      .from("budget_records")
      .update({
        pdf_storage_path: null,
        pdf_generated_at: null,
        pdf_size_bytes: null,
      })
      .eq("id", row.id);
    if (updErr) {
      dbFailed += 1;
    } else {
      deleted += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[budget-pdf-cleanup] candidates=${rows.length} purged=${deleted} storageFailed=${storageFailed} dbFailed=${dbFailed}`,
  );

  return NextResponse.json({
    candidates: rows.length,
    purged: deleted,
    storage_failed: storageFailed,
    db_failed: dbFailed,
  });
}
