import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPreApprovalClient } from "@/lib/mercadopago/client";
import { updatePreApprovalAmount } from "@/lib/mercadopago/update-preapproval";
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

  // Historial de pagos, addons activos y el estado en Mercado Pago solo
  // dependen de `sub` (ya resuelto), no unos de otros. Antes se encadenaban
  // en serie — tres esperas, y la de MP es una llamada a un tercero que puede
  // tardar cientos de ms. En paralelo, el TTFB del endpoint pasa a ser el del
  // más lento de los tres.
  const [paymentsRes, addonsRes, mpStatus] = await Promise.all([
    // Get payment history
    supabase
      .from("payment_history")
      .select("id, organization_id, amount, currency, status, payment_method, mp_payment_id, created_at")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false })
      .limit(10),
    // Active add-ons the org has purchased (cupos extra de doctores /
    // recepcionistas / consultorios). Exposed so /account can render the
    // "cancelar cupo" UI introduced in Wave 2 Sprint 1.
    supabase
      .from("plan_addons")
      .select("id, addon_type, quantity, unit_price, created_at")
      .eq("organization_id", membership.organization_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    // If we have a MP preapproval, fetch latest status from MP
    (async () => {
      if (!sub.mp_preapproval_id) return null;
      try {
        const preApproval = getPreApprovalClient();
        const preApprovalData = await preApproval.get({ id: sub.mp_preapproval_id });
        // Solo estos dos campos se usan aguas abajo; el objeto completo de MP
        // son varios kB de payload que nadie lee.
        return {
          status: preApprovalData?.status ?? null,
          next_payment_date: preApprovalData?.next_payment_date ?? null,
        };
      } catch (error) {
        console.error("Error fetching MP subscription status:", error);
        return null;
      }
    })(),
  ]);

  return NextResponse.json({
    subscription: sub,
    payments: paymentsRes.data || [],
    addons: addonsRes.data || [],
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

  // OWNER ONLY — adding paid addons increases the monthly bill, so
  // we deliberately exclude admins. This mirrors /api/billing/cancel
  // which is also owner-gated.
  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "forbidden_owner_only" }, { status: 403 });
  }

  const orgId = membership.organization_id;

  // Resolve the unit price from the plan. We still do this in JS
  // because the price comes from the plans table the caller can read,
  // and the RPC takes it as a parameter to avoid coupling the lock
  // function to plan column names.
  const { data: planRow } = await supabase
    .from("organization_subscriptions")
    .select("plans(addon_price_per_member, addon_price_per_office)")
    .eq("organization_id", orgId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const plan = (planRow?.plans as unknown as
    | { addon_price_per_member: number | null; addon_price_per_office: number | null }
    | null);

  if (!plan) {
    return NextResponse.json({ error: "no_active_subscription" }, { status: 400 });
  }

  const unitPrice =
    addon_type === "extra_member"
      ? plan.addon_price_per_member
      : plan.addon_price_per_office;

  if (!unitPrice) {
    return NextResponse.json(
      { error: "Este plan no soporta addons" },
      { status: 400 }
    );
  }

  // F12 — reserve the addon slot atomically. The RPC locks the
  // subscription row, recomputes the new total under the lock, and
  // inserts a plan_addons row with status='pending_mp_sync'. A parallel
  // call for the same (org, addon_type) blocks on the partial unique
  // index and gets 'addon_purchase_in_progress'.
  const admin = createAdminClient();
  const { data: reservation, error: rpcErr } = await admin.rpc(
    "purchase_addon_atomic",
    {
      p_org_id: orgId,
      p_user_id: user.id,
      p_addon_type: addon_type,
      p_quantity: quantity,
      p_unit_price: unitPrice,
    }
  );

  if (rpcErr) {
    const msg = rpcErr.message || "";
    if (msg.includes("addon_purchase_in_progress")) {
      return NextResponse.json(
        {
          error: "addon_purchase_in_progress",
          message:
            "Ya hay otra compra del mismo tipo en proceso. Espera unos segundos y reintenta.",
        },
        { status: 409 }
      );
    }
    if (msg.includes("no_active_subscription")) {
      return NextResponse.json({ error: "no_active_subscription" }, { status: 400 });
    }
    if (msg.includes("subscription_required")) {
      return NextResponse.json(
        {
          error: "subscription_required",
          message:
            "Debes tener una suscripción activa con método de pago para comprar cupos extra. Activa tu suscripción primero.",
        },
        { status: 402 }
      );
    }
    console.error("[mercadopago/subscription] RPC purchase_addon_atomic error:", msg);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const reservationData = reservation as {
    addon_id: string;
    subscription_id: string;
    mp_preapproval_id: string;
    new_total: number;
    addon_total: number;
  };

  // Push the new total to Mercado Pago. On any failure we roll back
  // the reservation by deleting the pending plan_addons row, then
  // surface the error to the caller.
  try {
    await updatePreApprovalAmount(
      reservationData.mp_preapproval_id,
      Number(reservationData.new_total)
    );
    console.log(
      `[MP] Updated subscription ${reservationData.mp_preapproval_id} amount to S/${reservationData.new_total}`
    );
  } catch (error) {
    console.error("Error updating MP subscription amount:", error);
    await admin.from("plan_addons").delete().eq("id", reservationData.addon_id);
    await admin.from("billing_events").insert({
      organization_id: orgId,
      subscription_id: reservationData.subscription_id,
      event_type: "addon_mp_sync_failed",
      metadata: {
        operation: "add",
        addon_type,
        quantity,
        unit_price: unitPrice,
        attempted_total: reservationData.new_total,
        rolled_back_addon_id: reservationData.addon_id,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return NextResponse.json(
      {
        error: "payment_failed",
        message:
          "No se pudo actualizar tu suscripción en Mercado Pago. Intenta de nuevo o contacta soporte.",
      },
      { status: 502 }
    );
  }

  // MP confirmed — flip the reservation to active.
  await admin
    .from("plan_addons")
    .update({ is_active: true, status: "active" })
    .eq("id", reservationData.addon_id);

  await admin.from("billing_events").insert({
    organization_id: orgId,
    subscription_id: reservationData.subscription_id,
    event_type: "addon_added",
    metadata: {
      addon_id: reservationData.addon_id,
      addon_type,
      quantity,
      unit_price: unitPrice,
      added_by: user.id,
      new_monthly_total: reservationData.new_total,
    },
  });

  return NextResponse.json({
    success: true,
    addon_type,
    quantity,
    unit_price: unitPrice,
    addon_cost: reservationData.addon_total,
    new_monthly_total: reservationData.new_total,
    message: `Se agregaron ${quantity} ${addon_type === "extra_member" ? "miembros" : "consultorios"} extra. Nuevo total mensual: S/${reservationData.new_total}`,
  });
}
