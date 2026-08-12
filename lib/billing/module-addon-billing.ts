/**
 * Facturación de módulos — capa server-side.
 *
 * Envuelve la maquinaria que YA existía para cupos extra (mig 152:
 * plan_addons + purchase_addon_atomic; lib/mercadopago/update-preapproval)
 * y la expone en términos de "módulo" para que las rutas de
 * /api/addons no repitan el baile de reserva → MP → confirmar/revertir.
 *
 * Solo se importa desde rutas de API (usa clientes de Supabase y el SDK
 * de Mercado Pago). Los helpers puros viven en ./module-pricing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeSubscriptionAmount,
  updatePreApprovalAmount,
} from "@/lib/mercadopago/update-preapproval";
import { moduleAddonType } from "./module-pricing";

/** Estados de suscripción en los que la org "tiene plan" para efectos de precio. */
const LIVE_SUB_STATUSES = ["active", "trialing", "past_due", "grace"];

export interface OrgPlanContext {
  subscriptionId: string;
  subscriptionStatus: string;
  planId: string | null;
  planSlug: string | null;
  planName: string | null;
  planPriceMonthly: number;
  mpPreapprovalId: string | null;
}

/**
 * Suscripción vigente + plan de la org. Devuelve null si la org nunca
 * tuvo suscripción (caso legacy / seed incompleto).
 *
 * Acepta cualquier cliente: con el cliente RLS del usuario funciona
 * porque `org_subs_select` deja leer la suscripción a todo miembro
 * (mig 016).
 */
export async function getOrgPlanContext(
  client: SupabaseClient,
  orgId: string,
): Promise<OrgPlanContext | null> {
  const { data } = await client
    .from("organization_subscriptions")
    .select("id, status, plan_id, mp_preapproval_id, plans(slug, name, price_monthly)")
    .eq("organization_id", orgId)
    .in("status", LIVE_SUB_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const plan = data.plans as unknown as
    | { slug: string | null; name: string | null; price_monthly: number | string | null }
    | null;

  return {
    subscriptionId: data.id,
    subscriptionStatus: data.status,
    planId: data.plan_id ?? null,
    planSlug: plan?.slug ?? null,
    planName: plan?.name ?? null,
    planPriceMonthly: Number(plan?.price_monthly ?? 0),
    mpPreapprovalId: data.mp_preapproval_id ?? null,
  };
}

/**
 * Total mensual que la org paga HOY: precio del plan + todos los addons
 * activos (cupos extra y módulos). Es el mismo cálculo que
 * computeSubscriptionAmount, expuesto aparte para que el diálogo de
 * confirmación pueda mostrar "de S/X a S/Y" sin adivinar en el cliente.
 */
export async function getCurrentMonthlyTotal(
  client: SupabaseClient,
  orgId: string,
  planPriceMonthly: number,
): Promise<number> {
  const { data: addons } = await client
    .from("plan_addons")
    .select("quantity, unit_price")
    .eq("organization_id", orgId)
    .eq("status", "active");

  const addonTotal = (addons ?? []).reduce(
    (sum, a) => sum + Number(a.unit_price) * Number(a.quantity),
    0,
  );

  return Number(planPriceMonthly) + addonTotal;
}

/** Fila de cobro activa del módulo, o null si el módulo no se está cobrando. */
export async function findActiveModuleCharge(
  client: SupabaseClient,
  orgId: string,
  addonKey: string,
): Promise<{ id: string; unit_price: number } | null> {
  const { data } = await client
    .from("plan_addons")
    .select("id, unit_price")
    .eq("organization_id", orgId)
    .eq("addon_type", moduleAddonType(addonKey))
    .eq("status", "active")
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, unit_price: Number(data.unit_price) };
}

export type CancelModuleChargeResult =
  | { status: "not_charged" }
  | { status: "cancelled"; addonId: string; newMonthlyTotal: number | null }
  | { status: "mp_failed"; addonId: string; error: string };

/**
 * Da de baja el cobro de un módulo y empuja el monto MENOR a Mercado
 * Pago. Mismo patrón (y mismas reversas) que /api/addons/cancel para
 * los cupos extra:
 *
 *   1. plan_addons → status 'cancelled' PRIMERO, para que el recálculo
 *      del total ya no lo cuente.
 *   2. preApproval.update con el nuevo total.
 *   3. Si MP falla → se revierte la fila a 'active' (DB y MP no pueden
 *      divergir: si divergen, la org paga algo que no tiene o tiene
 *      algo que no paga) y se devuelve mp_failed.
 *
 * Sin prorrateo: MP aplica el monto nuevo desde el SIGUIENTE ciclo, no
 * devuelve la fracción del ciclo en curso.
 *
 * Requiere un cliente admin (service-role): escribe en plan_addons y
 * billing_events. El caller ya validó sesión + rol.
 */
export async function cancelModuleAddonCharge(
  admin: SupabaseClient,
  params: { orgId: string; addonKey: string; actorUserId: string },
): Promise<CancelModuleChargeResult> {
  const { orgId, addonKey, actorUserId } = params;
  const addonType = moduleAddonType(addonKey);

  const { data: charge } = await admin
    .from("plan_addons")
    .select("id, quantity, unit_price")
    .eq("organization_id", orgId)
    .eq("addon_type", addonType)
    .eq("status", "active")
    .maybeSingle();

  if (!charge) return { status: "not_charged" };

  const sub = await getOrgPlanContext(admin, orgId);

  const { error: deactErr } = await admin
    .from("plan_addons")
    .update({ is_active: false, status: "cancelled" })
    .eq("id", charge.id);

  if (deactErr) {
    return { status: "mp_failed", addonId: charge.id, error: deactErr.message };
  }

  let newTotal: number | null = null;

  if (sub?.mpPreapprovalId && sub.planId) {
    try {
      newTotal = await computeSubscriptionAmount(admin, orgId, sub.planId);
      await updatePreApprovalAmount(sub.mpPreapprovalId, newTotal);
    } catch (err) {
      // Revertir: la org sigue pagando el módulo, así que sigue teniéndolo.
      await admin
        .from("plan_addons")
        .update({ is_active: true, status: "active" })
        .eq("id", charge.id);

      await admin.from("billing_events").insert({
        organization_id: orgId,
        subscription_id: sub.subscriptionId,
        event_type: "module_addon_mp_sync_failed",
        metadata: {
          operation: "cancel",
          addon_key: addonKey,
          addon_type: addonType,
          addon_id: charge.id,
          error: err instanceof Error ? err.message : String(err),
        },
      });

      return {
        status: "mp_failed",
        addonId: charge.id,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  await admin.from("billing_events").insert({
    organization_id: orgId,
    subscription_id: sub?.subscriptionId ?? null,
    event_type: "module_addon_cancelled",
    metadata: {
      addon_key: addonKey,
      addon_type: addonType,
      addon_id: charge.id,
      unit_price: Number(charge.unit_price),
      cancelled_by: actorUserId,
      new_monthly_total: newTotal,
      mp_synced: Boolean(sub?.mpPreapprovalId),
    },
  });

  return { status: "cancelled", addonId: charge.id, newMonthlyTotal: newTotal };
}
