import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPreApprovalClient } from "@/lib/mercadopago/client";
import { paymentLimiter } from "@/lib/rate-limit";

/**
 * POST /api/billing/reactivate
 *
 * Owner-only "deshacer cancelación" path. The audit found we had no
 * way for an owner who cancelled (intentionally or by mistake) to
 * come back without creating a brand-new account and losing their
 * data. The data stays put for ~90 days post-cancel (no hard purge
 * happens unless the owner also triggers account deletion), so we
 * just need to wire a payment channel back to it.
 *
 * Mercado Pago does NOT allow flipping a `cancelled` preApproval
 * back to `authorized` — once cancelled it is dead forever. So we
 * follow the same pattern as the initial checkout: create a fresh
 * preApproval, save a pending subscription, return `init_point`.
 * The webhook will mark the new sub as `active` after the user
 * authorizes the recurring charge.
 *
 * Validation:
 *  - Caller is the org owner
 *  - The latest subscription is `cancelled` AND `cancelled_at` is
 *    within 90 days (older than that and we ask the user to re-pick
 *    a plan from /select-plan to make sure they accept current pricing)
 *  - The org is NOT in account-deletion flow (deleted_at IS NULL)
 *
 * Add-ons (Sprint 5): we sum still-active `plan_addons` for the org
 * into the new preApproval's transaction_amount up front. The owner
 * authorizes the FULL recurring amount once at MP, so MP charges the
 * correct total from month 1 instead of needing a post-authorization
 * bump. We log the restored addons in `reactivation_addons_restored`
 * (when any were present) so the audit trail is intact.
 */
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = paymentLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "too_many_requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)),
        },
      },
    );
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 });
  }
  if (membership.role !== "owner") {
    return NextResponse.json(
      { error: "forbidden_owner_only" },
      { status: 403 },
    );
  }

  // Make sure the org isn't already in account-deletion flow.
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, deleted_at")
    .eq("id", membership.organization_id)
    .maybeSingle();

  if (!org) {
    return NextResponse.json({ error: "org_not_found" }, { status: 404 });
  }
  if (org.deleted_at) {
    return NextResponse.json(
      {
        error: "org_in_deletion",
        message:
          "Tu clínica está marcada para eliminación. Revierte la eliminación antes de reactivar la suscripción.",
      },
      { status: 409 },
    );
  }

  // Find the latest cancelled subscription. We accept reactivation
  // only within the 90-day post-cancel window — older than that we
  // funnel users through /select-plan to ensure they see current
  // pricing.
  const { data: lastSub } = await supabase
    .from("organization_subscriptions")
    .select(
      "id, status, plan_id, cancelled_at, mp_payer_email, plans(id, name, slug, price_monthly, is_active)",
    )
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastSub) {
    return NextResponse.json(
      {
        error: "no_subscription_history",
        message: "No tienes suscripciones previas. Elige un plan en /select-plan.",
      },
      { status: 400 },
    );
  }

  if (lastSub.status !== "cancelled") {
    return NextResponse.json(
      {
        error: "subscription_not_cancelled",
        message:
          "Tu suscripción no está cancelada. Si necesitas cambiar de plan ve a /select-plan.",
      },
      { status: 400 },
    );
  }

  const cancelledAt = lastSub.cancelled_at ? new Date(lastSub.cancelled_at) : null;
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  if (!cancelledAt || cancelledAt < ninetyDaysAgo) {
    return NextResponse.json(
      {
        error: "reactivation_window_expired",
        message:
          "Han pasado más de 90 días desde tu cancelación. Selecciona un plan desde /select-plan para volver.",
      },
      { status: 410 },
    );
  }

  const plan = (lastSub.plans as unknown as {
    id: string;
    name: string;
    slug: string;
    price_monthly: number;
    is_active: boolean;
  } | null);

  if (!plan || !plan.is_active) {
    return NextResponse.json(
      {
        error: "plan_unavailable",
        message:
          "El plan que tenías ya no está disponible. Elige uno actual en /select-plan.",
      },
      { status: 410 },
    );
  }

  const basePrice = Number(plan.price_monthly);
  if (!basePrice || basePrice < 2) {
    return NextResponse.json(
      { error: "invalid_plan_price" },
      { status: 400 },
    );
  }

  // F13 — sum the org's still-active addons. plan_addons rows are not
  // cancelled when the subscription is cancelled (they live in our DB
  // independent of the dead MP preApproval), so the snapshot of what
  // the org was paying for is right there.
  const { data: activeAddons } = await supabase
    .from("plan_addons")
    .select("id, addon_type, quantity, unit_price")
    .eq("organization_id", membership.organization_id)
    .eq("status", "active");

  const addonsCost = (activeAddons ?? []).reduce(
    (sum: number, a: { unit_price: number | string; quantity: number }) =>
      sum + Number(a.unit_price) * Number(a.quantity),
    0,
  );

  const price = basePrice + addonsCost;

  // Detect test mode to pick the right payer email (matches the
  // initial checkout endpoint). Only TEST- is sandbox; APP_USR- is
  // the production prefix. The previous check OR'd both, which
  // caused reactivations in production to send MP_TEST_PAYER_EMAIL
  // and MP to reject with "Both payer and collector must be real
  // or test users".
  const accessToken = process.env.MP_ACCESS_TOKEN || "";
  const isTestMode = accessToken.startsWith("TEST-");
  const payerEmail = isTestMode
    ? process.env.MP_TEST_PAYER_EMAIL || ""
    : user.email || lastSub.mp_payer_email || "";

  if (!payerEmail) {
    return NextResponse.json(
      { error: "no_payer_email" },
      { status: 400 },
    );
  }

  // Self-pay guard — same rationale as /api/mercadopago/checkout.
  // MP rejects (vague 500) any preapproval where payer_email
  // matches the integrator account. MP_INTEGRATOR_EMAIL env-flag.
  const integratorEmail = (process.env.MP_INTEGRATOR_EMAIL || "")
    .trim()
    .toLowerCase();
  if (
    !isTestMode &&
    integratorEmail &&
    payerEmail.toLowerCase() === integratorEmail
  ) {
    return NextResponse.json(
      {
        error: "self_payment_not_allowed",
        message:
          "No podés reactivar la suscripción con el mismo email vinculado a la cuenta de Mercado Pago de Yenda. Cambiá el email del owner desde tu perfil antes de reactivar.",
      },
      { status: 400 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  let result;
  try {
    const preApproval = getPreApprovalClient();
    result = await preApproval.create({
      body: {
        reason: `Yenda - Reactivación Plan ${plan.name}`,
        payer_email: payerEmail,
        external_reference: JSON.stringify({
          organization_id: membership.organization_id,
          plan_id: plan.id,
          plan_slug: plan.slug,
          billing_cycle: "monthly",
          user_id: user.id,
          reactivation: true,
        }),
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: price,
          currency_id: "PEN",
        },
        back_url: `${appUrl}/account?reactivated=1`,
        // Required for the no-card-token preapproval model. Without
        // it MP defaults to status=authorized, which requires
        // card_token_id and triggers a vague 500 since we don't
        // collect cards client-side. See full note in
        // app/api/mercadopago/checkout/route.ts.
        status: "pending",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[billing/reactivate] MP create error:", msg);
    return NextResponse.json(
      { error: "mp_error", message: msg },
      { status: 502 },
    );
  }

  const admin = createAdminClient();

  // Clean up any abandoned pending rows so we don't accumulate
  // half-checkouts.
  await admin
    .from("organization_subscriptions")
    .delete()
    .eq("organization_id", membership.organization_id)
    .eq("status", "pending");

  await admin.from("organization_subscriptions").insert({
    organization_id: membership.organization_id,
    plan_id: plan.id,
    status: "pending",
    started_at: new Date().toISOString(),
    payment_provider: "mercadopago",
    external_id: result.id?.toString() || null,
    mp_preapproval_id: result.id?.toString() || null,
    mp_payer_email: payerEmail,
  });

  await admin.from("billing_events").insert({
    organization_id: membership.organization_id,
    subscription_id: lastSub.id,
    event_type: "reactivation_requested",
    metadata: {
      requested_by: user.id,
      previous_subscription_id: lastSub.id,
      previous_cancelled_at: lastSub.cancelled_at,
      new_mp_preapproval_id: result.id?.toString() || null,
      plan_id: plan.id,
      plan_slug: plan.slug,
      base_price: basePrice,
      addons_cost: addonsCost,
      total_monthly: price,
      addon_count: activeAddons?.length ?? 0,
    },
  });

  if ((activeAddons?.length ?? 0) > 0) {
    await admin.from("billing_events").insert({
      organization_id: membership.organization_id,
      subscription_id: lastSub.id,
      event_type: "reactivation_addons_restored",
      metadata: {
        new_mp_preapproval_id: result.id?.toString() || null,
        addon_count: activeAddons!.length,
        addons: activeAddons!.map((a) => ({
          id: a.id,
          addon_type: a.addon_type,
          quantity: a.quantity,
          unit_price: a.unit_price,
        })),
        addons_cost: addonsCost,
        total_monthly: price,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    init_point: result.init_point,
    preapproval_id: result.id,
    base_price: basePrice,
    addons_cost: addonsCost,
    total_monthly: price,
    restored_addon_count: activeAddons?.length ?? 0,
    message:
      "Vamos a Mercado Pago para confirmar tu método de pago. Apenas autorices, tu suscripción se reactivará.",
  });
}
