import { createClient } from "@/lib/supabase/server";
import { getPreApprovalClient } from "@/lib/mercadopago/client";
import { NextResponse } from "next/server";
import { paymentLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { mpCheckoutSchema } from "@/lib/validations/api";

/**
 * POST /api/mercadopago/checkout
 * Creates a Mercado Pago open subscription (preapproval) for a plan.
 * Uses auto_recurring with plan price to generate a checkout init_point.
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

  const parsed = await parseBody(request, mpCheckoutSchema);
  if (parsed.error) return parsed.error;
  const { plan_id, billing_cycle } = parsed.data;

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

  // Detect test mode: ACCESS_TOKEN from test accounts use APP_USR- prefix
  const accessToken = process.env.MP_ACCESS_TOKEN || "";
  const isTestMode = accessToken.startsWith("TEST-") || accessToken.startsWith("APP_USR-");

  console.log("[MP Checkout] Plan:", plan.slug, "| Price:", price, "| Cycle:", billing_cycle, "| TestMode:", isTestMode);

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

  // Create open subscription (auto_recurring) — generates an init_point
  // that works in both TEST and production mode.
  let result;
  try {
    const preApproval = getPreApprovalClient();

    // In test mode, payer_email MUST be the test buyer's email (not the seller's).
    // In production, use the authenticated user's email.
    const payerEmail = isTestMode
      ? (process.env.MP_TEST_PAYER_EMAIL || "")
      : (user.email || "");

    if (!payerEmail) {
      return NextResponse.json(
        { error: isTestMode
          ? "Falta MP_TEST_PAYER_EMAIL en variables de entorno (email de la cuenta compradora de prueba)"
          : "El usuario no tiene email configurado" },
        { status: 400 }
      );
    }

    const body: Record<string, unknown> = {
      reason: `VibeForge - Plan ${plan.name} (${billing_cycle === "yearly" ? "Anual" : "Mensual"})`,
      payer_email: payerEmail,
      external_reference: JSON.stringify({
        organization_id: membership.organization_id,
        plan_id: plan.id,
        plan_slug: plan.slug,
        billing_cycle,
        user_id: user.id,
      }),
      auto_recurring: {
        frequency,
        frequency_type: frequencyType,
        transaction_amount: Number(price),
        currency_id: "PEN",
      },
      back_url: `${appUrl}/select-plan?payment=success`,
    };

    console.log("[MP Checkout] Request body:", JSON.stringify(body, null, 2));
    result = await preApproval.create({ body });
    console.log("[MP Checkout] Response:", JSON.stringify(result, null, 2));
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

  // Save a pending subscription record.
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
      external_id: result.id?.toString() || null,
      mp_preapproval_id: result.id?.toString() || null,
      mp_payer_email: user.email || null,
    });

    if (insertError) {
      console.error("DB insert error:", insertError);
    }
  } catch (dbError) {
    console.error("DB error (non-blocking):", dbError);
  }

  return NextResponse.json({
    init_point: result.init_point,
    preapproval_id: result.id,
  });
}
