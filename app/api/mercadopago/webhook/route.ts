import { NextResponse } from "next/server";
import { type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPreApprovalClient, getPaymentClient } from "@/lib/mercadopago/client";
import crypto from "crypto";
import { webhookLimiter } from "@/lib/rate-limit";

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

  // Verify webhook signature — MANDATORY in production
  const mpWebhookSecret = process.env.MP_WEBHOOK_SECRET;
  if (!mpWebhookSecret) {
    console.error("MP_WEBHOOK_SECRET is not configured — rejecting webhook");
    return NextResponse.json({ error: "server_config_error" }, { status: 500 });
  }

  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");

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
  if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(hash || ""))) {
    console.warn("Invalid webhook signature");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const type = body.type as string;
  const action = body.action as string;
  const bodyDataId = (body.data as Record<string, unknown>)?.id as string;

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
  const mpSub = await preApproval.get({ id: preapprovalId });

  // Map MP status to our status
  const statusMap: Record<string, string> = {
    authorized: "active",
    pending: "trialing",
    paused: "past_due",
    cancelled: "cancelled",
  };

  const newStatus = statusMap[mpSub.status || ""] || "active";

  const updateData = {
    status: newStatus,
    mp_preapproval_id: preapprovalId,
    mp_payer_email: mpSub.payer_email || null,
    mp_next_payment_date: mpSub.next_payment_date || null,
    mp_last_payment_status: mpSub.status || null,
    external_id: preapprovalId,
    payment_provider: "mercadopago",
    updated_at: new Date().toISOString(),
  };

  // Strategy 1: If external_reference exists (open subscriptions created via API)
  if (mpSub.external_reference) {
    let ref: { organization_id: string; plan_id: string; plan_slug: string };
    try {
      ref = JSON.parse(mpSub.external_reference);
    } catch {
      console.error("[MP Webhook] Invalid external_reference:", mpSub.external_reference);
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
  const mpPayment = await paymentClient.get({ id: paymentId });

  let orgId: string | null = null;

  // Try to get org_id from external_reference first
  if (mpPayment.external_reference) {
    try {
      const ref = JSON.parse(mpPayment.external_reference);
      orgId = ref.organization_id;
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

  // Record payment in history
  await supabase.from("payment_history").insert({
    organization_id: orgId,
    subscription_id: sub?.id || null,
    mp_payment_id: paymentId,
    amount: mpPayment.transaction_amount || 0,
    currency: mpPayment.currency_id || "PEN",
    status: paymentStatus,
    payment_type: "subscription",
    description: mpPayment.description || `Pago plan - ${mpPayment.status}`,
    mp_raw_data: mpPayment as unknown as Record<string, unknown>,
  });

  // If payment approved, ensure subscription is active
  if (paymentStatus === "approved" && sub) {
    await supabase
      .from("organization_subscriptions")
      .update({
        status: "active",
        mp_last_payment_status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
  }

  // If payment rejected/failed, mark subscription past_due
  if (paymentStatus === "rejected" && sub) {
    await supabase
      .from("organization_subscriptions")
      .update({
        status: "past_due",
        mp_last_payment_status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
  }

  console.log(
    `[MP Webhook] Payment ${paymentId} status=${paymentStatus} amount=${mpPayment.transaction_amount} org=${orgId}`
  );
}
