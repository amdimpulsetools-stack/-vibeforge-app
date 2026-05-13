import { NextResponse } from "next/server";
import { type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPreApprovalClient, getPaymentClient } from "@/lib/mercadopago/client";
import crypto from "crypto";
import { webhookLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { mpWebhookBodySchema } from "@/lib/validations/api";
import {
  resolveBillingEmailContext,
  sendPaymentFailedEmail,
  sendRefundIssuedEmail,
} from "@/lib/billing-emails";

// Grace period after the first payment failure. Tuned to overlap
// with Mercado Pago's default 3-retry window (~7 days).
const GRACE_DAYS = 7;
// MP retries 3 times + final settlement attempt = 4 failures before
// we give up. Anything past this and we flip past_due immediately
// regardless of the grace window remaining.
const MAX_FAILURES_BEFORE_PAST_DUE = 4;

/**
 * POST /api/mercadopago/webhook
 * Handles Mercado Pago IPN (Instant Payment Notification) webhooks.
 *
 * Mercado Pago sends notifications for:
 * - subscription_preapproval: Subscription status changes
 * - payment: Individual payment events
 */
export async function POST(request: Request) {
  // Rate limit webhooks by IP (60/min — MP can burst on retries)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "webhook";
  const rl = webhookLimiter(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: "too_many_requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  // Use centralized admin client for webhook operations (bypasses RLS)
  const supabase = createAdminClient();

  // Verify webhook signature
  const mpWebhookSecret = process.env.MP_WEBHOOK_SECRET;
  const accessToken = process.env.MP_ACCESS_TOKEN || "";
  const isTestMode = accessToken.startsWith("TEST-") || accessToken.startsWith("APP_USR-");

  if (!mpWebhookSecret) {
    if (isTestMode) {
      console.warn("[MP Webhook] MP_WEBHOOK_SECRET not configured — skipping signature check (TEST MODE)");
    } else {
      console.error("MP_WEBHOOK_SECRET is not configured — rejecting webhook");
      return NextResponse.json({ error: "server_config_error" }, { status: 500 });
    }
  }

  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");

  if (mpWebhookSecret) {
    if (!xSignature || !xRequestId) {
      return NextResponse.json({ error: "missing_signature" }, { status: 401 });
    }

    const url = new URL(request.url);
    const dataId = url.searchParams.get("data.id") || url.searchParams.get("id");

    const parts = xSignature.split(",");
    let ts = "";
    let hash = "";
    for (const part of parts) {
      const [key, value] = part.trim().split("=");
      if (key === "ts") ts = value;
      if (key === "v1") hash = value;
    }

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const hmac = crypto
      .createHmac("sha256", mpWebhookSecret)
      .update(manifest)
      .digest("hex");

    // Use constant-time comparison to prevent timing attacks
    const hmacBuf = Buffer.from(hmac);
    const hashBuf = Buffer.from(hash || "");
    if (hmacBuf.length !== hashBuf.length || !crypto.timingSafeEqual(hmacBuf, hashBuf)) {
      console.warn("[MP Webhook] Invalid signature. dataId:", dataId, "ts:", ts);
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  }

  const parsed = await parseBody(request, mpWebhookBodySchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const type = body.type;
  const action = body.action as string | undefined;
  const bodyDataId = body.data.id;

  console.log(`[MP Webhook] type=${type} action=${action} id=${bodyDataId}`);

  try {
    // Handle subscription (preapproval) events
    if (type === "subscription_preapproval") {
      await handleSubscriptionEvent(supabase, bodyDataId);
    }

    // Handle payment events
    if (type === "payment") {
      await handlePaymentEvent(supabase, bodyDataId);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[MP Webhook] Error processing:", error);
    return NextResponse.json({ error: "processing_error" }, { status: 500 });
  }
}

async function handleSubscriptionEvent(
  supabase: SupabaseClient,
  preapprovalId: string
) {
  const preApproval = getPreApprovalClient();
  let mpSub;
  try {
    mpSub = await preApproval.get({ id: preapprovalId });
  } catch (err: unknown) {
    // Same defensive pattern as handlePaymentEvent — MP "Simular
    // notificación" sends fake preapproval IDs and a 404 here would
    // crash the whole handler. Treat as a no-op so the dashboard
    // probe reports success.
    const status =
      (err as { status?: number; statusCode?: number })?.status ??
      (err as { statusCode?: number })?.statusCode;
    if (status === 404) {
      console.warn(
        `[MP Webhook] Preapproval ${preapprovalId} not found in MP (404) — skipping`,
      );
      return;
    }
    throw err;
  }

  // Map MP status to our status
  const statusMap: Record<string, string> = {
    authorized: "active",
    pending: "trialing",
    paused: "past_due",
    cancelled: "cancelled",
  };

  const newStatus = statusMap[mpSub.status || ""] || "active";

  const updateData: Record<string, unknown> = {
    status: newStatus,
    mp_preapproval_id: preapprovalId,
    mp_payer_email: mpSub.payer_email || null,
    mp_next_payment_date: mpSub.next_payment_date || null,
    mp_last_payment_status: mpSub.status || null,
    external_id: preapprovalId,
    payment_provider: "mercadopago",
    updated_at: new Date().toISOString(),
  };

  // If MP confirms cancellation (user cancelled from MP UI or our
  // own /api/billing/cancel propagated through), stamp cancelled_at
  // so the middleware grace logic can keep access until period end.
  if (newStatus === "cancelled") {
    updateData.cancelled_at = new Date().toISOString();
  }

  // Strategy 1: If external_reference exists (open subscriptions created via API)
  if (mpSub.external_reference) {
    let ref: { organization_id: string; plan_id: string; plan_slug: string };
    try {
      const parsed = JSON.parse(mpSub.external_reference);
      // Validate required fields are valid UUIDs to prevent injection
      if (
        typeof parsed.organization_id !== "string" || !/^[a-f0-9-]{36}$/.test(parsed.organization_id) ||
        typeof parsed.plan_id !== "string" || !/^[a-f0-9-]{36}$/.test(parsed.plan_id)
      ) {
        console.error("[MP Webhook] external_reference failed UUID validation");
        return;
      }
      ref = parsed;
    } catch {
      console.error("[MP Webhook] Invalid external_reference JSON");
      return;
    }

    const { error } = await supabase
      .from("organization_subscriptions")
      .update(updateData)
      .eq("organization_id", ref.organization_id)
      .eq("plan_id", ref.plan_id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[MP Webhook] Error updating subscription:", error);
    } else {
      console.log(
        `[MP Webhook] Subscription ${preapprovalId} -> ${newStatus} for org ${ref.organization_id}`
      );
    }

    // F11: when MP authorizes a fresh preApproval that was created via
    // /api/billing/reactivate, close the loop by logging
    // reactivation_completed. We detect it via the most recent
    // reactivation_requested event for this org within the last 7 days
    // (enough to cover slow MP authorization).
    if (newStatus === "active") {
      const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 3600 * 1000,
      ).toISOString();
      const { data: pendingReactivation } = await supabase
        .from("billing_events")
        .select("id, subscription_id")
        .eq("organization_id", ref.organization_id)
        .eq("event_type", "reactivation_requested")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingReactivation) {
        const { data: alreadyCompleted } = await supabase
          .from("billing_events")
          .select("id")
          .eq("organization_id", ref.organization_id)
          .eq("event_type", "reactivation_completed")
          .gte("created_at", sevenDaysAgo)
          .limit(1)
          .maybeSingle();

        if (!alreadyCompleted) {
          await supabase.from("billing_events").insert({
            organization_id: ref.organization_id,
            subscription_id: pendingReactivation.subscription_id,
            event_type: "reactivation_completed",
            metadata: {
              mp_preapproval_id: preapprovalId,
              reactivation_request_event_id: pendingReactivation.id,
            },
          });
        }
      }
    }
    return;
  }

  // Strategy 2: Plan-based subscriptions (from MP checkout URL).
  // Match by payer_email + mp_plan_id to find the pending subscription.
  const payerEmail = mpSub.payer_email;
  const mpPlanId = (mpSub as unknown as Record<string, unknown>).preapproval_plan_id as string | undefined;

  if (!payerEmail) {
    console.warn("[MP Webhook] No external_reference and no payer_email on preapproval", preapprovalId);
    return;
  }

  console.log(`[MP Webhook] Plan-based subscription. payer_email=${payerEmail} mp_plan_id=${mpPlanId}`);

  // Build the query to find the pending subscription
  let query = supabase
    .from("organization_subscriptions")
    .update(updateData)
    .eq("mp_payer_email", payerEmail)
    .in("status", ["pending", "trialing"]);

  // If we have a MP plan ID, find our plan and narrow the search
  if (mpPlanId) {
    const { data: matchedPlan } = await supabase
      .from("plans")
      .select("id")
      .eq("mp_plan_id", mpPlanId)
      .single();

    if (matchedPlan) {
      query = query.eq("plan_id", matchedPlan.id);
    }
  }

  const { data: updated, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .select("id, organization_id");

  if (error) {
    console.error("[MP Webhook] Error updating plan-based subscription:", error);
    return;
  }

  // If the new subscription became active, cancel any old active/trialing ones for the same org
  if (newStatus === "active" && updated && updated.length > 0) {
    const orgId = updated[0].organization_id;
    const newSubId = updated[0].id;

    await supabase
      .from("organization_subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .in("status", ["active", "trialing"])
      .neq("id", newSubId);

    console.log(
      `[MP Webhook] Cancelled old subscriptions for org ${orgId}, new active sub: ${newSubId}`
    );
  }

  console.log(
    `[MP Webhook] Plan-based subscription ${preapprovalId} -> ${newStatus} (email=${payerEmail})`
  );
}

async function handlePaymentEvent(
  supabase: SupabaseClient,
  paymentId: string
) {
  const paymentClient = getPaymentClient();
  let mpPayment;
  try {
    mpPayment = await paymentClient.get({ id: paymentId });
  } catch (err: unknown) {
    // MP returns 404 when the payment doesn't exist. Two real scenarios:
    //   1. MP "Simular notificación" sends fake ID 123456 — webhook must
    //      stay reachable so the dashboard probe reports success.
    //   2. A real webhook fires before the payment is fully indexed in
    //      MP's read API (rare, but possible). MP retries the webhook up
    //      to 5 times over ~24h — on retry the payment is queryable.
    // In both cases returning a no-op 200 is the right move.
    const status =
      (err as { status?: number; statusCode?: number })?.status ??
      (err as { statusCode?: number })?.statusCode;
    if (status === 404) {
      console.warn(
        `[MP Webhook] Payment ${paymentId} not found in MP (404) — skipping`,
      );
      return;
    }
    throw err;
  }

  let orgId: string | null = null;

  // Try to get org_id from external_reference first
  if (mpPayment.external_reference) {
    try {
      const ref = JSON.parse(mpPayment.external_reference);
      if (typeof ref.organization_id === "string" && /^[a-f0-9-]{36}$/.test(ref.organization_id)) {
        orgId = ref.organization_id;
      }
    } catch {
      console.warn("[MP Webhook] Invalid payment external_reference");
    }
  }

  // Fallback: find org by payer email from subscription record
  if (!orgId && mpPayment.payer?.email) {
    const { data: subByEmail } = await supabase
      .from("organization_subscriptions")
      .select("organization_id")
      .eq("mp_payer_email", mpPayment.payer.email)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (subByEmail) {
      orgId = subByEmail.organization_id;
    }
  }

  if (!orgId) {
    console.warn("[MP Webhook] Could not determine organization for payment", paymentId);
    return;
  }

  // Find the subscription
  const { data: sub } = await supabase
    .from("organization_subscriptions")
    .select("id")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Map MP payment status
  const statusMap: Record<string, string> = {
    approved: "approved",
    pending: "pending",
    in_process: "pending",
    rejected: "rejected",
    refunded: "refunded",
    cancelled: "cancelled",
  };

  const paymentStatus = statusMap[mpPayment.status || ""] || "pending";

  // Idempotent record. MP retries the same event multiple times — the
  // legacy `.insert` was creating N rows per payment. Mig 151 added
  // UNIQUE(mp_payment_id) so we can upsert. We also read the prior
  // state first so we can detect transitions (e.g. approved → refunded
  // initiated from the MP dashboard, not from /api/admin/refund-payment).
  const { data: prevPayment } = await supabase
    .from("payment_history")
    .select("id, status, refund_source, refunded_at")
    .eq("mp_payment_id", paymentId)
    .maybeSingle();

  await supabase.from("payment_history").upsert(
    {
      organization_id: orgId,
      subscription_id: sub?.id || null,
      mp_payment_id: paymentId,
      amount: mpPayment.transaction_amount || 0,
      currency: mpPayment.currency_id || "PEN",
      status: paymentStatus,
      payment_type: "subscription",
      description: mpPayment.description || `Pago plan - ${mpPayment.status}`,
      mp_raw_data: mpPayment as unknown as Record<string, unknown>,
    },
    { onConflict: "mp_payment_id" },
  );

  // Refund detected on the MP side that wasn't started here. /api/admin/
  // refund-payment already stamps refund_source='founder_app' before MP
  // fires the webhook, so we skip those — the webhook is then just an
  // ack. The case we DO want to catch is when the founder refunded via
  // the MP dashboard directly: stamp refund metadata, log event, email
  // the owner so they don't get confused by an unexplained refund.
  if (
    paymentStatus === "refunded" &&
    prevPayment?.status !== "refunded" &&
    prevPayment?.refund_source !== "founder_app"
  ) {
    const refundedAmount = mpPayment.transaction_amount || 0;
    await supabase
      .from("payment_history")
      .update({
        refunded_at: new Date().toISOString(),
        refund_amount: refundedAmount,
        refund_source: "mp_dashboard",
      })
      .eq("mp_payment_id", paymentId);

    await supabase.from("billing_events").insert({
      organization_id: orgId,
      subscription_id: sub?.id || null,
      event_type: "refund_received",
      metadata: {
        mp_payment_id: paymentId,
        amount: refundedAmount,
        source: "mp_dashboard",
      },
    });

    try {
      const ctx = await resolveBillingEmailContext(
        supabase,
        orgId,
        sub?.id || null,
      );
      if (ctx) {
        ctx.amount = `S/ ${refundedAmount.toFixed(2)}`;
        await sendRefundIssuedEmail(ctx);
      }
    } catch (err) {
      console.warn("[MP Webhook] refund email failed:", err);
    }
  }

  // If payment approved, ensure subscription is active and clear
  // any grace counters that may have been set by previous rejections.
  if (paymentStatus === "approved" && sub) {
    const { data: prev } = await supabase
      .from("organization_subscriptions")
      .select("status, failure_count")
      .eq("id", sub.id)
      .single();

    await supabase
      .from("organization_subscriptions")
      .update({
        status: "active",
        mp_last_payment_status: "approved",
        failure_count: 0,
        grace_period_until: null,
        past_due_since: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);

    if (prev && (prev.status === "grace" || prev.status === "past_due")) {
      await supabase.from("billing_events").insert({
        organization_id: orgId,
        subscription_id: sub.id,
        event_type: "recovered_to_active",
        metadata: { from_status: prev.status, failure_count_before: prev.failure_count },
      });
    }
  }

  // If payment rejected, enter (or extend) the grace period unless
  // we've burned through MP's retry window — then flip to past_due.
  if (paymentStatus === "rejected" && sub) {
    await handlePaymentFailure(supabase, sub.id, orgId);
  }

  console.log(
    `[MP Webhook] Payment ${paymentId} status=${paymentStatus} amount=${mpPayment.transaction_amount} org=${orgId}`
  );
}

/**
 * Reaction to a rejected payment. Implements the grace policy:
 *
 *   - First failure on an active/trialing sub
 *     → status='grace', grace_period_until = NOW() + 7d, failure_count = 1
 *   - Subsequent failure already in grace
 *     → failure_count++, keep grace status (window unchanged)
 *   - failure_count >= 4 (MP's retry budget exhausted)
 *     → status='past_due', past_due_since = NOW(), grace cleared
 *   - Failure on an already-cancelled sub → no-op (user wants out)
 *
 * Sends the "pago no procesado" email on the FIRST failure only.
 * Subsequent failures are silent (otherwise we spam — the grace
 * ending reminder is the cron's job 2 days before expiry).
 */
async function handlePaymentFailure(
  supabase: SupabaseClient,
  subscriptionId: string,
  organizationId: string,
): Promise<void> {
  const { data: sub } = await supabase
    .from("organization_subscriptions")
    .select("id, status, failure_count, grace_period_until")
    .eq("id", subscriptionId)
    .single();

  if (!sub) return;
  if (sub.status === "cancelled") {
    // User already cancelled; the rejection is MP draining its
    // retry queue. Don't bother the user.
    return;
  }

  const nowIso = new Date().toISOString();
  const nextFailureCount = (sub.failure_count ?? 0) + 1;
  const isFirstFailure = (sub.failure_count ?? 0) === 0;

  if (nextFailureCount >= MAX_FAILURES_BEFORE_PAST_DUE) {
    // MP gave up. Cut access.
    await supabase
      .from("organization_subscriptions")
      .update({
        status: "past_due",
        mp_last_payment_status: "rejected",
        failure_count: nextFailureCount,
        last_payment_failure_at: nowIso,
        past_due_since: nowIso,
        grace_period_until: null,
        updated_at: nowIso,
      })
      .eq("id", subscriptionId);

    await supabase.from("billing_events").insert({
      organization_id: organizationId,
      subscription_id: subscriptionId,
      event_type: "past_due_terminated",
      metadata: { reason: "max_failures_reached", failure_count: nextFailureCount },
    });
    return;
  }

  // Otherwise enter or extend grace.
  const graceUntil =
    sub.grace_period_until && new Date(sub.grace_period_until) > new Date()
      ? sub.grace_period_until
      : new Date(Date.now() + GRACE_DAYS * 24 * 3600 * 1000).toISOString();

  await supabase
    .from("organization_subscriptions")
    .update({
      status: "grace",
      mp_last_payment_status: "rejected",
      failure_count: nextFailureCount,
      last_payment_failure_at: nowIso,
      grace_period_until: graceUntil,
      updated_at: nowIso,
    })
    .eq("id", subscriptionId);

  await supabase.from("billing_events").insert({
    organization_id: organizationId,
    subscription_id: subscriptionId,
    event_type: isFirstFailure ? "entered_grace" : "grace_extended",
    metadata: {
      failure_count: nextFailureCount,
      grace_period_until: graceUntil,
    },
  });

  // Email the owner on the first failure only.
  if (isFirstFailure) {
    const ctx = await resolveBillingEmailContext(
      supabase,
      organizationId,
      subscriptionId,
    );
    if (ctx) {
      await sendPaymentFailedEmail(ctx);
    }
  }
}
