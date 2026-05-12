import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveBillingEmailContext,
  sendGraceEndingEmail,
  sendAccessSuspendedEmail,
} from "@/lib/billing-emails";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/billing-status
 *
 * Vercel Cron — daily at 14:00 UTC (09:00 Lima). Handles the three
 * timed lifecycle transitions the webhook can't do on its own:
 *
 *   1. trialing + trial_ends_at <= NOW()
 *        → past_due (existing logic from mig 067/118; we enforce
 *          here because the middleware only checks at request
 *          time, so an offline org would never be marked).
 *
 *   2. grace + grace_period_until - 2d <= NOW() < grace_period_until
 *        → send "tu período de gracia termina en 2 días" reminder
 *          (idempotent: we only send if no `email_sent` event of
 *          this kind was logged in the last 36h).
 *
 *   3. grace + grace_period_until <= NOW()
 *        → past_due + email "acceso suspendido". This is the cut
 *          the audit's P0 demanded: middleware now rejects past_due
 *          (no `grace` literal in `has_active_subscription`).
 *
 *   4. past_due + past_due_since <= NOW() - 30d
 *        → cancelled (permanent termination; user kept the door
 *          open for a month without paying).
 *
 * Auth: CRON_SECRET in Bearer header — same shape as
 * `app/api/cron/fertility-followup-contact/route.ts`.
 */

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
  const now = new Date();
  const nowIso = now.toISOString();
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  const thirtySixHoursAgo = new Date(now.getTime() - 36 * 3600 * 1000).toISOString();

  let trialsExpired = 0;
  let graceReminded = 0;
  let graceSuspended = 0;
  let pastDueTerminated = 0;

  // ── 1. trialing → past_due when trial elapses ─────────────────
  const { data: expiredTrials } = await supabase
    .from("organization_subscriptions")
    .select("id, organization_id")
    .eq("status", "trialing")
    .not("trial_ends_at", "is", null)
    .lte("trial_ends_at", nowIso);

  for (const sub of expiredTrials ?? []) {
    await supabase
      .from("organization_subscriptions")
      .update({
        status: "past_due",
        past_due_since: nowIso,
        updated_at: nowIso,
      })
      .eq("id", sub.id);

    await supabase.from("billing_events").insert({
      organization_id: sub.organization_id,
      subscription_id: sub.id,
      event_type: "past_due_terminated",
      metadata: { reason: "trial_expired" },
    });
    trialsExpired++;
  }

  // ── 2. grace ending in <2d → reminder email ───────────────────
  const { data: graceReminders } = await supabase
    .from("organization_subscriptions")
    .select("id, organization_id, grace_period_until")
    .eq("status", "grace")
    .not("grace_period_until", "is", null)
    .gt("grace_period_until", nowIso)
    .lte("grace_period_until", twoDaysFromNow);

  for (const sub of graceReminders ?? []) {
    // Idempotency: skip if we already sent grace_ending recently.
    const { data: recent } = await supabase
      .from("billing_events")
      .select("id, metadata, created_at")
      .eq("organization_id", sub.organization_id)
      .eq("event_type", "email_sent")
      .gte("created_at", thirtySixHoursAgo)
      .order("created_at", { ascending: false })
      .limit(5);

    const alreadySent = (recent ?? []).some((e) => {
      const md = e.metadata as { kind?: string } | null;
      return md?.kind === "grace_ending";
    });
    if (alreadySent) continue;

    const ctx = await resolveBillingEmailContext(
      supabase,
      sub.organization_id,
      sub.id,
    );
    if (ctx) {
      await sendGraceEndingEmail(ctx);
      graceReminded++;
    }
  }

  // ── 3. grace expired → past_due + suspended email ─────────────
  const { data: graceExpired } = await supabase
    .from("organization_subscriptions")
    .select("id, organization_id, grace_period_until, failure_count")
    .eq("status", "grace")
    .not("grace_period_until", "is", null)
    .lte("grace_period_until", nowIso);

  for (const sub of graceExpired ?? []) {
    await supabase
      .from("organization_subscriptions")
      .update({
        status: "past_due",
        past_due_since: nowIso,
        updated_at: nowIso,
      })
      .eq("id", sub.id);

    await supabase.from("billing_events").insert({
      organization_id: sub.organization_id,
      subscription_id: sub.id,
      event_type: "grace_expired",
      metadata: {
        grace_period_until: sub.grace_period_until,
        failure_count: sub.failure_count,
      },
    });

    const ctx = await resolveBillingEmailContext(
      supabase,
      sub.organization_id,
      sub.id,
    );
    if (ctx) {
      await sendAccessSuspendedEmail(ctx);
    }
    graceSuspended++;
  }

  // ── 4. past_due > 30d → permanent cancellation ────────────────
  const { data: stalePastDue } = await supabase
    .from("organization_subscriptions")
    .select("id, organization_id, past_due_since")
    .eq("status", "past_due")
    .not("past_due_since", "is", null)
    .lte("past_due_since", thirtyDaysAgo);

  for (const sub of stalePastDue ?? []) {
    await supabase
      .from("organization_subscriptions")
      .update({
        status: "cancelled",
        cancelled_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", sub.id);

    await supabase.from("billing_events").insert({
      organization_id: sub.organization_id,
      subscription_id: sub.id,
      event_type: "past_due_terminated",
      metadata: {
        reason: "past_due_30d",
        past_due_since: sub.past_due_since,
      },
    });
    pastDueTerminated++;
  }

  return NextResponse.json({
    ok: true,
    timestamp: nowIso,
    trials_expired: trialsExpired,
    grace_reminded: graceReminded,
    grace_suspended: graceSuspended,
    past_due_terminated: pastDueTerminated,
  });
}
