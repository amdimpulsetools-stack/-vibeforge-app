import { createClient } from "@/lib/supabase/server";
import { getPreApprovalClient } from "@/lib/mercadopago/client";
import { NextResponse } from "next/server";

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
    .select("*, plans(*)")
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
    .select("*")
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

  const { addon_type, quantity } = await request.json();

  if (!addon_type || !quantity || quantity < 1) {
    return NextResponse.json(
      { error: "addon_type and quantity (>= 1) required" },
      { status: 400 }
    );
  }

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
    .select("*, plans(*)")
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

  // Get current total (base plan + existing addons)
  const { data: existingAddons } = await supabase
    .from("plan_addons")
    .select("*")
    .eq("organization_id", membership.organization_id)
    .eq("is_active", true);

  const currentAddonCost = (existingAddons || []).reduce(
    (sum: number, a: Record<string, unknown>) =>
      sum + (a.unit_price as number) * (a.quantity as number),
    0
  );

  const basePlanPrice = plan.price_monthly as number;
  const newTotal = basePlanPrice + currentAddonCost + addonTotal;

  // Register addon in our DB
  await supabase.from("plan_addons").insert({
    organization_id: membership.organization_id,
    addon_type,
    quantity,
    unit_price: unitPrice,
    is_active: true,
  });

  // Update MP subscription amount if we have one
  if (sub.mp_preapproval_id) {
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
        `[MP] Updated subscription ${sub.mp_preapproval_id} amount to $${newTotal}`
      );
    } catch (error) {
      console.error("Error updating MP subscription amount:", error);
      // Addon was saved to DB, but MP update failed - log it
      return NextResponse.json({
        success: true,
        warning: "Addon registrado pero Mercado Pago no pudo actualizarse automaticamente. Contacte soporte.",
        new_total: newTotal,
      });
    }
  }

  return NextResponse.json({
    success: true,
    addon_type,
    quantity,
    unit_price: unitPrice,
    addon_cost: addonTotal,
    new_monthly_total: newTotal,
    message: `Se agregaron ${quantity} ${addon_type === "extra_member" ? "miembros" : "consultorios"} extra. Nuevo total mensual: $${newTotal}`,
  });
}
