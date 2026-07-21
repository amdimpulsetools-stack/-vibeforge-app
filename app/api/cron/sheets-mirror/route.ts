// Nightly Google Sheets mirror.
//
// For every org with sheets_enabled = true AND an active Google integration,
// rewrites its backup spreadsheet (tabs "📅 Hoy", "Citas", "Léeme") with the
// current -30/+90 day appointment window. Idempotent and self-recovering:
// a deleted spreadsheet is recreated on the next run.
//
// Security: Bearer CRON_SECRET (>=32 chars), same as the other crons.
// Errors are per-org (try/catch inside runSheetsMirrorForOrg) — one bad org
// never stops the rest.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSheetsMirrorForOrg } from "@/lib/google-sheets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // 1. Validate cron secret.
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 32 || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 2. Orgs with the mirror enabled and an active integration.
  const { data: integrations } = await supabase
    .from("google_calendar_integrations")
    .select("organization_id")
    .eq("sheets_enabled", true)
    .eq("is_active", true);

  if (!integrations || integrations.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, reason: "no_enabled_orgs" });
  }

  const results: Array<{ org_id: string; status: string; reason?: string; rows?: number }> = [];

  for (const row of integrations) {
    const orgId = (row as { organization_id: string }).organization_id;
    try {
      const r = await runSheetsMirrorForOrg(orgId);
      results.push({ org_id: orgId, status: r.status, reason: r.reason, rows: r.rows });
      if (r.status === "skipped" && r.reason === "missing_drive_scope") {
        console.warn(`[sheets-mirror] org ${orgId} skipped: falta scope drive.file (reconectar Google)`);
      } else if (r.status === "error") {
        console.error(`[sheets-mirror] org ${orgId} error: ${r.reason}`);
      }
    } catch (err) {
      // Defensive: runSheetsMirrorForOrg is designed not to throw, but never
      // let one org kill the whole run.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[sheets-mirror] org ${orgId} unexpected error: ${msg}`);
      results.push({ org_id: orgId, status: "error", reason: msg.slice(0, 200) });
    }
  }

  const okCount = results.filter((r) => r.status === "ok").length;
  return NextResponse.json({
    ok: true,
    processed: results.length,
    mirrored: okCount,
    results,
  });
}
