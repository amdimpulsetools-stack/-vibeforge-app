import { createClient } from "@/lib/supabase/server";
import { getPreApprovalClient } from "@/lib/mercadopago/client";
import { exceedsMpPreapprovalCap } from "@/lib/billing/constants";
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
    .select("id, name, slug, price_monthly, price_semiannual, price_yearly, is_active")
    .eq("id", plan_id)
    .eq("is_active", true)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  // Resolve price + recurring frequency for the chosen cadence.
  // Falls back to monthly if the requested cadence isn't priced yet.
  let price: number;
  if (billing_cycle === "yearly" && plan.price_yearly) {
    price = plan.price_yearly;
  } else if (billing_cycle === "semiannual" && plan.price_semiannual) {
    price = plan.price_semiannual;
  } else {
    price = plan.price_monthly;
  }

  // Detect test mode. MP's prefix convention:
  //   "TEST-..."     → sandbox / test credentials
  //   "APP_USR-..."  → real production credentials
  // The previous code treated both as test, which caused production
  // checkouts to send MP_TEST_PAYER_EMAIL as payer_email. MP then
  // rejected with "Both payer and collector must be real or test
  // users" because the collector (APP_USR-) is real but the payer
  // was the sandbox test user. Fix: only TEST- counts as test mode.
  const accessToken = process.env.MP_ACCESS_TOKEN || "";
  const isTestMode = accessToken.startsWith("TEST-");

  console.log("[MP Checkout] Plan:", plan.slug, "| Price:", price, "| Cycle:", billing_cycle, "| TestMode:", isTestMode);

  // Mercado Pago minimum for recurring payments is S/ 2.00
  if (!price || Number(price) < 2) {
    return NextResponse.json(
      { error: `Plan "${plan.name}" tiene precio S/ ${price} — MP requiere mínimo S/ 2.00` },
      { status: 400 }
    );
  }

  // Tope de MP para el monto por período de una preapproval (límite de la
  // cuenta, ver lib/billing/constants). Sin este guard, MP revienta con
  // "Cannot pay an amount greater than S/ 1500.00" en inglés y crudo. La UI
  // ya ofrece estas cadencias como "Próximamente"; esto cubre UI cacheada
  // vieja y llamadas directas al API.
  if (exceedsMpPreapprovalCap(Number(price))) {
    return NextResponse.json(
      {
        error: "cadence_amount_over_limit",
        message:
          "Esta modalidad de pago aún no está disponible. Elige el plan mensual — el pago semestral/anual llegará pronto.",
      },
      { status: 400 }
    );
  }

  // Mercado Pago preapproval supports monthly cycles {1, 2, 3, 4, 6, 12}.
  // We only use 1 (monthly), 6 (semiannual) and 12 (yearly).
  const frequency =
    billing_cycle === "yearly" ? 12 : billing_cycle === "semiannual" ? 6 : 1;
  const frequencyType = "months";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Create open subscription (auto_recurring) — generates an init_point
  // that works in both TEST and production mode.
  let result;
  try {
    const preApproval = getPreApprovalClient();

    // In test mode, payer_email MUST be the test buyer's email (not the seller's).
    // In production, use the authenticated user's email — but validate it
    // looks like a real email first (anti-corruption for the rare case
    // where a social-login row or a partially-migrated user ends up here
    // without one).
    const rawEmail = isTestMode
      ? (process.env.MP_TEST_PAYER_EMAIL || "")
      : (user.email || "").trim();
    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail);

    if (!rawEmail) {
      return NextResponse.json(
        {
          error: isTestMode ? "missing_test_payer_email" : "missing_user_email",
          message: isTestMode
            ? "Falta MP_TEST_PAYER_EMAIL en variables de entorno (email de la cuenta compradora de prueba)"
            : "No encontramos un email asociado a tu cuenta. Actualiza tu perfil antes de suscribirte.",
        },
        { status: 400 },
      );
    }
    if (!emailLooksValid) {
      return NextResponse.json(
        {
          error: "invalid_user_email",
          message: isTestMode
            ? "MP_TEST_PAYER_EMAIL no tiene formato válido."
            : "El email de tu cuenta no tiene formato válido. Actualízalo desde tu perfil antes de suscribirte.",
        },
        { status: 400 },
      );
    }

    // Self-pay guard. MP rejects (with a vague 500, no useful body)
    // any preapproval where payer_email matches the email tied to
    // the integrator account that owns the access token. Confirmed
    // by MP support 2026-05-14: "no es posible pagarse a sí mismo".
    //
    // Surfaces a clear 400 instead of the 500 maze when a founder
    // tries to test signup with their own real Yenda account in
    // production. Set MP_INTEGRATOR_EMAIL in env to enable; left
    // unset disables the guard (no behaviour change).
    const integratorEmail = (process.env.MP_INTEGRATOR_EMAIL || "")
      .trim()
      .toLowerCase();
    if (
      !isTestMode &&
      integratorEmail &&
      rawEmail.toLowerCase() === integratorEmail
    ) {
      return NextResponse.json(
        {
          error: "self_payment_not_allowed",
          message:
            "No podés suscribirte con el mismo email que está vinculado a la cuenta de Mercado Pago de Yenda. Usá otra cuenta para probar el flow de pago.",
        },
        { status: 400 },
      );
    }

    const payerEmail = rawEmail;

    const body: Record<string, unknown> = {
      reason: `Yenda - Plan ${plan.name} (${
        billing_cycle === "yearly"
          ? "Anual"
          : billing_cycle === "semiannual"
          ? "Semestral"
          : "Mensual"
      })`,
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
      // Some MP application configurations reject preapproval.create
      // with a vague 500 if notification_url is omitted, even though
      // the URL is also configured in the MP dashboard. Sending it
      // explicitly costs nothing and rules out that failure mode.
      notification_url: `${appUrl}/api/mercadopago/webhook`,
      // Required for the "subscription without associated plan and
      // without card_token" model. Without this MP defaults to
      // status=authorized, which mandates card_token_id — and since
      // we never collect a card client-side, MP returns a generic
      // 500 instead of a useful 400. Confirmed root cause by MP
      // support 2026-05-14, ref docs:
      //   /developers/es/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
      // Once user redirects to init_point, MP collects the payment
      // method there and the subscription transitions to authorized.
      status: "pending",
    };

    console.log("[MP Checkout] Request body:", JSON.stringify(body, null, 2));
    result = await preApproval.create({ body });
    console.log("[MP Checkout] Response:", JSON.stringify(result, null, 2));
  } catch (error: unknown) {
    // Dump every property the SDK gave us — including non-enumerable
    // ones — so we can see what MP is hiding behind a generic
    // "Internal server error". Past versions only stringified the
    // enumerable surface, which left useful keys like `cause` or
    // `error_code` invisible.
    let msg: string;
    if (error instanceof Error) {
      const own = Object.getOwnPropertyNames(error).reduce<Record<string, unknown>>(
        (acc, key) => {
          acc[key] = (error as unknown as Record<string, unknown>)[key];
          return acc;
        },
        {},
      );
      msg = JSON.stringify({ name: error.name, message: error.message, ...own }, null, 2);
    } else if (typeof error === "object" && error !== null) {
      const own = Object.getOwnPropertyNames(error).reduce<Record<string, unknown>>(
        (acc, key) => {
          acc[key] = (error as Record<string, unknown>)[key];
          return acc;
        },
        {},
      );
      msg = JSON.stringify(own, null, 2);
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
