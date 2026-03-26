import { createClient } from "@/lib/supabase/server";
import { getPreApprovalClient } from "@/lib/mercadopago/client";
import { NextResponse } from "next/server";
import { paymentLimiter } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { mpSubscriptionUpdateSchema } from "@/lib/validations/api";

/**
 * GET /api/mercadopago/subscription
 * Returns the current Mercado Pago subscription status for the org.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 requests per minute per user
  const rlGet = paymentLimiter(user.id);
  if (!rlGet.success) {
    return NextResponse.json(
      { error: "too_many_requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rlGet.reset - Date.now()) / 1000)) } }
    );
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 400 });
  }

  // Get current subscription
  const { data: sub } = await supabase
    .from("organization_subscriptions")
    .select("*, plans(id, name, slug, price_monthly, price_yearly, addon_price_per_member, addon_price_per_office)")
    .eq("organization_id", membership.organization_id)
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!sub) {
    return NextResponse.json({ subscription: null, payments: [] });
  }

  // Get payment history
  const { data: payments } = await supabase
    .from("payment_history")
    .select("id, organization_id, amount, currency, status, payment_method, mp_payment_id, created_at")
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: false })
    .limit(10);

  // If we have a MP preapproval, fetch latest status from MP
  let mpStatus = null;
  if (sub.mp_preapproval_id) {
    try {
      const preApproval = getPreApprovalClient();
      mpStatus = await preApproval.get({ id: sub.mp_preapproval_id });
    } catch (error) {
      console.error("Error fetching MP subscription status:", error);
    }
  }

  return NextResponse.json({
    subscription: sub,
    payments: payments || [],
    mp_status: mpStatus,
  });
}

/**
 * PUT /api/mercadopago/subscription
 * Updates a Mercado Pago subscription (e.g., when adding members/addons).
 *
 * Body: { addon_type: "extra_member" | "extra_office", quantity: number }
 */
export async function PUT(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 requests per minute per user
  const rlPut = paymentLimiter(user.id);
  if (!rlPut.success) {
    return NextResponse.json(
      { error: "too_many_requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rlPut.reset - Date.now()) / 1000)) } }
    );
  }

  const parsed = await parseBody(request, mpSubscriptionUpdateSchema);
  if (parsed.error) return parsed.error;
  const { addon_type, quantity } = parsed.data;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Get current subscription with plan
  const { data: sub } = await supabase
    .from("organization_subscriptions")
    .select("*, plans(id, name, slug, price_monthly, price_yearly, addon_price_per_member, addon_price_per_office)")
    .eq("organization_id", membership.organization_id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!sub || !sub.plans) {
    return NextResponse.json({ error: "no_active_subscription" }, { status: 400 });
  }

  const plan = sub.plans as Record<string, unknown>;

  // Calculate addon price
  const unitPrice =
    addon_type === "extra_member"
      ? (plan.addon_price_per_member as number)
      : (plan.addon_price_per_office as number);

  if (!unitPrice) {
    return NextResponse.json(
      { error: "Este plan no soporta addons" },
      { status: 400 }
    );
  }

  const addonTotal = unitPrice * quantity;

  // Require active MP subscription to purchase addons
  // (trial users cannot buy addons — they must subscribe first)
  if (!sub.mp_preapproval_id) {
    return NextResponse.json(
      {
        error: "subscription_required",
        message:
          "Debes tener una suscripción activa con método de pago para comprar cupos extra. Activa tu suscripción primero.",
      },
      { status: 402 }
    );
  }

  // Get current total (base plan + existing addons)
  const { data: existingAddons } = await supabase
    .from("plan_addons")
    .select("id, addon_type, quantity, unit_price, is_active")
    .eq("organization_id", membership.organization_id)
    .eq("is_active", true);

  const currentAddonCost = (existingAddons || []).reduce(
    (sum: number, a: Record<string, unknown>) =>
      sum + (a.unit_price as number) * (a.quantity as number),
    0
  );

  const basePlanPrice = plan.price_monthly as number;
  const newTotal = basePlanPrice + currentAddonCost + addonTotal;

  // Update MP subscription amount FIRST before registering addon
  try {
    const preApproval = getPreApprovalClient();
    await preApproval.update({
      id: sub.mp_preapproval_id,
      body: {
        auto_recurring: {
          transaction_amount: newTotal,
          currency_id: "PEN",
        },
      },
    });

    console.log(
      `[MP] Updated subscription ${sub.mp_preapproval_id} amount to S/${newTotal}`
    );
  } catch (error) {
    console.error("Error updating MP subscription amount:", error);
    // MP update failed — do NOT register addon in DB
    return NextResponse.json(
      {
        error: "payment_failed",
        message:
          "No se pudo actualizar tu suscripción en Mercado Pago. Intenta de nuevo o contacta soporte.",
      },
      { status: 502 }
    );
  }

  // MP update succeeded — now register addon in our DB
  await supabase.from("plan_addons").insert({
    organization_id: membership.organization_id,
    addon_type,
    quantity,
    unit_price: unitPrice,
    is_active: true,
  });

  return NextResponse.json({
    success: true,
    addon_type,
    quantity,
    unit_price: unitPrice,
    addon_cost: addonTotal,
    new_monthly_total: newTotal,
    message: `Se agregaron ${quantity} ${addon_type === "extra_member" ? "miembros" : "consultorios"} extra. Nuevo total mensual: S/${newTotal}`,
  });
}
