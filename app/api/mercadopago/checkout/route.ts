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

  const frequency = billing_cycle === "yearly" ? 12 : 1;
  const frequencyType = "months";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const isLocalhost = appUrl.includes("localhost") || appUrl.includes("127.0.0.1");

  try {
    const preApproval = getPreApprovalClient();

    const preapprovalBody: Record<string, unknown> = {
      reason: `VibeForge - Plan ${plan.name} (${billing_cycle === "yearly" ? "Anual" : "Mensual"})`,
      auto_recurring: {
        frequency: frequency,
        frequency_type: frequencyType,
        transaction_amount: Number(price),
        currency_id: "PEN",
      },
      payer_email: user.email || "",
      external_reference: JSON.stringify({
        organization_id: membership.organization_id,
        plan_id: plan.id,
        plan_slug: plan.slug,
        billing_cycle,
        user_id: user.id,
      }),
    };

    // Mercado Pago rejects localhost URLs in back_url
    if (!isLocalhost) {
      preapprovalBody.back_url = `${appUrl}/dashboard/plans?payment=success`;
    }

    const result = await preApproval.create({
      body: preapprovalBody,
    });

    // Store pending subscription in DB
    await supabase.from("organization_subscriptions").update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    }).eq("organization_id", membership.organization_id)
      .in("status", ["active", "trialing"]);

    await supabase.from("organization_subscriptions").insert({
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

    return NextResponse.json({
      init_point: result.init_point,
      preapproval_id: result.id,
    });
  } catch (error: unknown) {
    console.error("Mercado Pago checkout error:", error);
    return NextResponse.json({ error: "checkout_error" }, { status: 500 });
  }
}
