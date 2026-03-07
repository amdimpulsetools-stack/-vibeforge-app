import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { paymentLimiter } from "@/lib/rate-limit";

/**
 * POST /api/mercadopago/checkout
 * Returns a Mercado Pago checkout URL for a plan's preapproval subscription.
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

  const { plan_id } = await request.json();

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

  // Get plan details (including mp_plan_id)
  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .eq("id", plan_id)
    .eq("is_active", true)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  if (!plan.mp_plan_id) {
    return NextResponse.json(
      { error: `Plan "${plan.name}" no tiene un plan de Mercado Pago configurado` },
      { status: 400 }
    );
  }

  console.log("[MP Checkout] Plan:", plan.slug, "| MP Plan ID:", plan.mp_plan_id);

  // Build the Mercado Pago checkout URL for this preapproval plan
  const checkoutUrl = `https://www.mercadopago.com.pe/subscriptions/checkout?preapproval_plan_id=${plan.mp_plan_id}`;

  // Save a pending subscription record so we can match it when the webhook fires.
  // NOTE: We do NOT cancel the existing active/trialing subscription here.
  // The webhook handler will cancel old subscriptions once the new one is confirmed.
  try {
    // Remove any previous pending subscriptions (from abandoned checkout attempts)
    await supabase.from("organization_subscriptions").delete()
      .eq("organization_id", membership.organization_id)
      .eq("status", "pending");

    const { error: insertError } = await supabase.from("organization_subscriptions").insert({
      organization_id: membership.organization_id,
      plan_id: plan.id,
      status: "pending",
      started_at: new Date().toISOString(),
      payment_provider: "mercadopago",
      mp_payer_email: user.email || null,
    });

    if (insertError) {
      console.error("DB insert error:", insertError);
    }
  } catch (dbError) {
    console.error("DB error (non-blocking):", dbError);
  }

  return NextResponse.json({
    init_point: checkoutUrl,
    mp_plan_id: plan.mp_plan_id,
  });
}
