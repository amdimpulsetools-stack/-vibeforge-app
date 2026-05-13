import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();
  const now = new Date();
  const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // founder_revenue_compact (mig 155) computes total + monthly in a
  // single round trip server-side instead of shipping every row of
  // patient_payments. Drops this endpoint from O(rows) → O(1).
  const [subsRes, revenueRes] = await Promise.all([
    admin
      .from("organization_subscriptions")
      .select("status, plans(name, price_monthly)"),
    admin.rpc("founder_revenue_compact", {
      p_current_month_start: monthStartIso,
    }),
  ]);

  const subs = (subsRes.data ?? []) as unknown as {
    status: string;
    plans: { name: string; price_monthly: number } | null;
  }[];
  const rev = (revenueRes.data ?? { total_revenue: 0, monthly_revenue: 0 }) as {
    total_revenue: number;
    monthly_revenue: number;
  };

  const planMap = new Map<string, { count: number; revenue: number }>();
  for (const sub of subs) {
    const name = sub.plans?.name ?? "Sin plan";
    const existing = planMap.get(name) ?? { count: 0, revenue: 0 };
    existing.count++;
    if (sub.status === "active") existing.revenue += sub.plans?.price_monthly ?? 0;
    planMap.set(name, existing);
  }

  return NextResponse.json({
    totalRevenue: Number(rev.total_revenue ?? 0),
    monthlyRevenue: Number(rev.monthly_revenue ?? 0),
    activeSubscriptions: subs.filter((s) => s.status === "active").length,
    trialingOrgs: subs.filter((s) => s.status === "trialing").length,
    cancelledOrgs: subs.filter((s) => s.status === "cancelled").length,
    planBreakdown: Array.from(planMap.entries()).map(([name, d]) => ({ name, ...d })),
  });
}
