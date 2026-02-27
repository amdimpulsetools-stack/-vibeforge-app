import { NextResponse } from "next/server";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPreApprovalClient, getPaymentClient } from "@/lib/mercadopago/client";
import crypto from "crypto";

/**
 * POST /api/mercadopago/webhook
 * Handles Mercado Pago IPN (Instant Payment Notification) webhooks.
 *
 * Mercado Pago sends notifications for:
 * - subscription_preapproval: Subscription status changes
 * - payment: Individual payment events
 */
export async function POST(request: Request) {
  // Use service role client for webhook operations (bypasses RLS)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("Missing Supabase service role credentials");
    return NextResponse.json({ error: "server_config_error" }, { status: 500 });
  }

  const supabase = createServiceClient(supabaseUrl, serviceKey);

  // Verify webhook signature if secret is configured
  const mpWebhookSecret = process.env.MP_WEBHOOK_SECRET;
  if (mpWebhookSecret) {
    const xSignature = request.headers.get("x-signature");
    const xRequestId = request.headers.get("x-request-id");

    if (xSignature && xRequestId) {
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

      if (hmac !== hash) {
        console.warn("Invalid webhook signature");
        return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
      }
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const type = body.type as string;
  const action = body.action as string;
  const dataId = (body.data as Record<string, unknown>)?.id as string;

  console.log(`[MP Webhook] type=${type} action=${action} id=${dataId}`);

  try {
    // Handle subscription (preapproval) events
    if (type === "subscription_preapproval") {
      await handleSubscriptionEvent(supabase, dataId);
    }

    // Handle payment events
    if (type === "payment") {
      await handlePaymentEvent(supabase, dataId);
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

  if (!mpSub.external_reference) {
    console.warn("[MP Webhook] No external_reference on preapproval", preapprovalId);
    return;
  }

  let ref: { organization_id: string; plan_id: string; plan_slug: string };
  try {
    ref = JSON.parse(mpSub.external_reference);
  } catch {
    console.error("[MP Webhook] Invalid external_reference:", mpSub.external_reference);
    return;
  }

  // Map MP status to our status
  const statusMap: Record<string, string> = {
    authorized: "active",
    pending: "trialing",
    paused: "past_due",
    cancelled: "cancelled",
  };

  const newStatus = statusMap[mpSub.status || ""] || "active";

  // Update our subscription record
  const { error } = await supabase
    .from("organization_subscriptions")
    .update({
      status: newStatus,
      mp_preapproval_id: preapprovalId,
      mp_payer_email: mpSub.payer_email || null,
      mp_next_payment_date: mpSub.next_payment_date || null,
      mp_last_payment_status: mpSub.status || null,
      external_id: preapprovalId,
      payment_provider: "mercadopago",
      updated_at: new Date().toISOString(),
    })
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
}

async function handlePaymentEvent(
  supabase: SupabaseClient,
  paymentId: string
) {
  const paymentClient = getPaymentClient();
  const mpPayment = await paymentClient.get({ id: paymentId });

  if (!mpPayment.external_reference) return;

  let ref: { organization_id: string; plan_id: string };
  try {
    ref = JSON.parse(mpPayment.external_reference);
  } catch {
    console.error("[MP Webhook] Invalid payment external_reference");
    return;
  }

  // Find the subscription
  const { data: sub } = await supabase
    .from("organization_subscriptions")
    .select("id")
    .eq("organization_id", ref.organization_id)
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
    organization_id: ref.organization_id,
    subscription_id: sub?.id || null,
    mp_payment_id: paymentId,
    amount: mpPayment.transaction_amount || 0,
    currency: mpPayment.currency_id || "ARS",
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
    `[MP Webhook] Payment ${paymentId} status=${paymentStatus} amount=${mpPayment.transaction_amount} org=${ref.organization_id}`
  );
}
