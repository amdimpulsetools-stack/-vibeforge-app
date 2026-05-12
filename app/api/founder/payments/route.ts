import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

/**
 * GET /api/founder/payments
 *
 * Returns the 100 most recent rows from payment_history enriched with
 * org name and plan name. Powers the /founder-dashboard/refunds page —
 * the founder needs at-a-glance "what did this org pay last week" data
 * before clicking refund.
 */
export async function GET() {
  const guard = await requireFounder();
  if ("error" in guard) return guard.error;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("payment_history")
    .select(
      `id, mp_payment_id, amount, currency, status, payment_type,
       description, created_at, refunded_at, refund_amount,
       refund_source, refund_reason,
       organization_id,
       organizations(name),
       subscription_id,
       organization_subscriptions(plan_id, plans(name, slug))`,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[founder/payments] fetch failed:", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  return NextResponse.json({ payments: data ?? [] });
}
