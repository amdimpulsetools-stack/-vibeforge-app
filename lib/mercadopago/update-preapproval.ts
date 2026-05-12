import type { SupabaseClient } from "@supabase/supabase-js";
import { getPreApprovalClient } from "./client";

/**
 * Recompute the total monthly amount a Mercado Pago preApproval should
 * charge: base plan price (monthly) plus all currently active add-ons.
 *
 * The caller is expected to pass the NEW plan id (relevant for the
 * plan-change flow where the org is switching plans). For addon
 * add/cancel flows, pass the existing subscription's plan_id.
 *
 * Returns the new amount in PEN as a decimal number. Throws if the plan
 * row cannot be loaded.
 */
export async function computeSubscriptionAmount(
  supabase: SupabaseClient,
  orgId: string,
  planId: string,
): Promise<number> {
  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("price_monthly")
    .eq("id", planId)
    .single();

  if (planErr || !plan) {
    throw new Error(`plan_not_found: ${planId}`);
  }

  const { data: addons } = await supabase
    .from("plan_addons")
    .select("quantity, unit_price")
    .eq("organization_id", orgId)
    .eq("is_active", true);

  const addonTotal = (addons ?? []).reduce(
    (sum, a) => sum + Number(a.unit_price) * Number(a.quantity),
    0,
  );

  return Number(plan.price_monthly) + addonTotal;
}

/**
 * Push the new `transaction_amount` to Mercado Pago for an existing
 * preApproval. The change applies starting at the next billing cycle —
 * MP does not retroactively bill or refund the current cycle.
 *
 * Throws on MP error; caller must handle rollback of any local writes.
 */
export async function updatePreApprovalAmount(
  preApprovalId: string,
  newAmount: number,
): Promise<void> {
  const preApproval = getPreApprovalClient();
  await preApproval.update({
    id: preApprovalId,
    body: {
      auto_recurring: {
        transaction_amount: newAmount,
        currency_id: "PEN",
      },
    },
  });
}
