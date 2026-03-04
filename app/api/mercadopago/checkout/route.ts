import { createClient } from "@/lib/supabase/server";
import { getPreApprovalClient } from "@/lib/mercadopago/client";
import { NextResponse } from "next/server";
import { paymentLimiter } from "@/lib/rate-limit";

/**
 * POST /api/mercadopago/checkout
 * Creates a Mercado Pago subscription (preapproval) for a plan.
 *
 * Body: { plan_id: string, billing_cycle?: "monthly" | "yearly" }
 *
 * Returns: { init_point: string } — URL to redirect user to MP checkout
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 checkout attempts per minute per user
  const rl = paymentLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "too_many_requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  const { plan_id, billing_cycle = "monthly" } = await request.json();

  if (!plan_id) {
    return NextResponse.json({ error: "plan_id required" }, { status: 400 });
  }

  // Get user's organization
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Get plan details
  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .eq("id", plan_id)
    .eq("is_active", true)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  const price =
    billing_cycle === "yearly" && plan.price_yearly
      ? plan.price_yearly
      : plan.price_monthly;

  console.log("[MP Checkout] Plan:", plan.slug, "| Price:", price, "| Cycle:", billing_cycle);

  // Mercado Pago minimum for recurring payments is S/ 2.00
  if (!price || Number(price) < 2) {
    return NextResponse.json(
      { error: `Plan "${plan.name}" tiene precio S/ ${price} — MP requiere mínimo S/ 2.00` },
      { status: 400 }
    );
  }

  const frequency = billing_cycle === "yearly" ? 12 : 1;
  const frequencyType = "months";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const isLocalhost = appUrl.includes("localhost") || appUrl.includes("127.0.0.1");

  // Step 1: Create MP preapproval
  let result;
  try {
    const preApproval = getPreApprovalClient();

    const preapprovalBody: Record<string, unknown> = {
      payer_email: user.email || "",
      external_reference: JSON.stringify({
        organization_id: membership.organization_id,
        plan_id: plan.id,
        plan_slug: plan.slug,
        billing_cycle,
        user_id: user.id,
      }),
    };

    // Use open subscription (auto_recurring) — redirects to MP hosted checkout.
    // preapproval_plan_id requires card_token_id (custom card form), so we use
    // open subscriptions which give us an init_point redirect instead.
    preapprovalBody.reason = `VibeForge - Plan ${plan.name} (${billing_cycle === "yearly" ? "Anual" : "Mensual"})`;
    preapprovalBody.auto_recurring = {
      frequency: frequency,
      frequency_type: frequencyType,
      transaction_amount: Number(price),
      currency_id: "PEN",
    };

    // back_url is required for open subscriptions.
    // For localhost, use a placeholder URL since MP rejects localhost.
    preapprovalBody.back_url = isLocalhost
      ? "https://vibeforge.app/dashboard/plans?payment=success"
      : `${appUrl}/dashboard/plans?payment=success`;

    result = await preApproval.create({
      body: preapprovalBody,
    });
  } catch (error: unknown) {
    let msg: string;
    if (error instanceof Error) {
      msg = error.message;
    } else if (typeof error === "object" && error !== null) {
      msg = JSON.stringify(error, null, 2);
    } else {
      msg = String(error);
    }
    console.error("MP PreApproval create error:", msg);
    return NextResponse.json(
      { error: `mp_error: ${msg}` },
      { status: 500 }
    );
  }

  // Step 2: Store pending subscription in DB
  try {
    await supabase.from("organization_subscriptions").update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    }).eq("organization_id", membership.organization_id)
      .in("status", ["active", "trialing"]);

    const { error: insertError } = await supabase.from("organization_subscriptions").insert({
      organization_id: membership.organization_id,
      plan_id: plan.id,
      status: "trialing",
      started_at: new Date().toISOString(),
      trial_ends_at: new Date(
        Date.now() + 14 * 24 * 60 * 60 * 1000
      ).toISOString(),
      payment_provider: "mercadopago",
      external_id: result.id?.toString() || null,
      mp_preapproval_id: result.id?.toString() || null,
      mp_payer_email: user.email || null,
    });

    if (insertError) {
      console.error("DB insert error:", insertError);
      // Still return the MP link — the subscription was created in MP
    }
  } catch (dbError) {
    console.error("DB error (non-blocking):", dbError);
  }

  return NextResponse.json({
    init_point: result.init_point,
    preapproval_id: result.id,
  });
}
