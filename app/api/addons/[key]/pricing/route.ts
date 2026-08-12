import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { resolveModuleBilling } from "@/lib/billing/module-pricing";
import {
  getCurrentMonthlyTotal,
  getOrgPlanContext,
} from "@/lib/billing/module-addon-billing";

/**
 * GET /api/addons/[key]/pricing
 *
 * Preview de cobro para el diálogo de confirmación: "tu suscripción
 * pasará de S/X a S/Y al mes".
 *
 * Todo el cálculo es del servidor a propósito. El cliente no conoce ni
 * el precio del módulo ni el total actual: los pide acá y solo los
 * MUESTRA. El endpoint de activación vuelve a resolver el precio desde
 * el catálogo, así que un preview manipulado no cambia lo que se cobra.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key: addonKey } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "No perteneces a una organización activa" },
      { status: 403 }
    );
  }

  const { data: addon } = await supabase
    .from("addons")
    .select("key, name, monthly_price, included_from_plan")
    .eq("key", addonKey)
    .maybeSingle();

  if (!addon) {
    return NextResponse.json({ error: "Addon no encontrado" }, { status: 404 });
  }

  const planCtx = await getOrgPlanContext(supabase, membership.organization_id);
  const billing = resolveModuleBilling(addon, planCtx?.planSlug ?? null);

  const currentTotal = planCtx
    ? await getCurrentMonthlyTotal(
        supabase,
        membership.organization_id,
        planCtx.planPriceMonthly
      )
    : null;

  const newTotal =
    billing.requiresPayment && billing.price !== null && currentTotal !== null
      ? currentTotal + billing.price
      : currentTotal;

  return NextResponse.json({
    addon_key: addon.key,
    addon_name: addon.name,
    monthly_price: billing.price,
    included_from_plan: billing.includedFromPlan,
    included_in_plan: billing.includedInPlan,
    requires_payment: billing.requiresPayment,
    plan_slug: planCtx?.planSlug ?? null,
    plan_name: planCtx?.planName ?? null,
    // Sin preapproval no hay cómo cobrar: la UI muestra "activa tu
    // suscripción primero" en vez del botón de pago.
    has_payment_method: Boolean(planCtx?.mpPreapprovalId),
    current_monthly_total: currentTotal,
    new_monthly_total: newTotal,
  });
}
