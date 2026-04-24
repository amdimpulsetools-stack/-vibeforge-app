import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

  const [paymentsRes, subsRes, monthPayRes] = await Promise.all([
    admin.from("patient_payments").select("amount"),
    admin.from("organization_subscriptions").select("status, plans(name, price_monthly)"),
    admin.from("patient_payments").select("amount").gte("payment_date", monthStart),
  ]);

  const payments = paymentsRes.data ?? [];
  const monthPayments = monthPayRes.data ?? [];
  const subs = (subsRes.data ?? []) as unknown as { status: string; plans: { name: string; price_monthly: number } | null }[];

  const totalRevenue = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const monthlyRevenue = monthPayments.reduce((s, p) => s + Number(p.amount ?? 0), 0);

  const planMap = new Map<string, { count: number; revenue: number }>();
  for (const sub of subs) {
    const name = sub.plans?.name ?? "Sin plan";
    const existing = planMap.get(name) ?? { count: 0, revenue: 0 };
    existing.count++;
    if (sub.status === "active") existing.revenue += sub.plans?.price_monthly ?? 0;
    planMap.set(name, existing);
  }

  return NextResponse.json({
    totalRevenue,
    monthlyRevenue,
    activeSubscriptions: subs.filter((s) => s.status === "active").length,
    trialingOrgs: subs.filter((s) => s.status === "trialing").length,
    cancelledOrgs: subs.filter((s) => s.status === "cancelled").length,
    planBreakdown: Array.from(planMap.entries()).map(([name, d]) => ({ name, ...d })),
  });
}
