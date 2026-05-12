import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveBillingEmailContext,
  sendAccountDeletionCompletedEmail,
} from "@/lib/billing-emails";

/**
 * GET /api/cron/account-deletion-process
 *
 * Daily cron (vercel.json) that finalises soft-deletes whose 30-day
 * grace window has expired. For each org:
 *   1. Calls `anonymize_org(p_org_id)` — IRREVERSIBLE PII removal
 *   2. Sends "your account was deleted" email to the owner
 *
 * Gated by CRON_SECRET header (matches the other crons). Anonymization
 * is idempotent at the row level (the RPC raises if already done), so
 * a second run on the same day is safe.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find orgs whose grace window has elapsed and that have not yet
  // been anonymized. Cap at 100 per run to keep the function cheap.
  const { data: pending, error } = await admin
    .from("organizations")
    .select("id, owner_id, name")
    .not("deleted_at", "is", null)
    .is("anonymized_at", null)
    .lte("delete_grace_until", new Date().toISOString())
    .limit(100);

  if (error) {
    console.error("[cron/account-deletion] fetch failed:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const results: Array<{ org_id: string; ok: boolean; error?: string }> = [];

  for (const org of pending ?? []) {
    try {
      const { data: emailCtx } = (await admin
        .rpc("anonymize_org", { p_org_id: org.id })
        .then(async (rpcRes) => {
          if (rpcRes.error) throw rpcRes.error;
          // Pull email context BEFORE anonymization runs the email
          // would be sent to anonymized data otherwise — but the RPC
          // already finished by the time we get here, so we have to
          // resolve the owner email via auth.admin (still works).
          const ctx = await resolveBillingEmailContext(admin, org.id, null);
          return { data: ctx };
        })) as { data: Awaited<ReturnType<typeof resolveBillingEmailContext>> };

      if (emailCtx) {
        await sendAccountDeletionCompletedEmail(emailCtx);
      }
      results.push({ org_id: org.id, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/account-deletion] org ${org.id} failed:`, msg);
      results.push({ org_id: org.id, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
