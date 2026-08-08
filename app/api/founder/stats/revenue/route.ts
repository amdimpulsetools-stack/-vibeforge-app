import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();
  const now = new Date();
  const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // INGRESO YENDA = payment_history (lo que las clínicas nos pagan por sus
  // suscripciones), NO patient_payments. El RPC founder_revenue_compact
  // (mig 155) sumaba patient_payments — el GMV de las clínicas — y el
  // founder veía "su revenue" mezclado con la facturación de sus clientes
  // (auditoría 2026-08-08). payment_history tiene 2 filas hoy: sumar en
  // memoria es trivial; si crece a miles, mover a RPC.
  const [subsRes, paymentsRes] = await Promise.all([
    admin
      .from("organization_subscriptions")
      .select("status, plans(name, price_monthly)"),
    admin
      .from("payment_history")
      .select("amount, status, created_at"),
  ]);

  const subs = (subsRes.data ?? []) as unknown as {
    status: string;
    plans: { name: string; price_monthly: number } | null;
  }[];

  const payments = paymentsRes.data ?? [];
  const sumApproved = (rows: typeof payments) =>
    rows
      .filter((p) => p.status === "approved")
      .reduce((s, p) => s + Number(p.amount), 0) -
    rows
      .filter((p) => p.status === "refunded")
      .reduce((s, p) => s + Number(p.amount), 0);
  const rev = {
    total_revenue: sumApproved(payments),
    monthly_revenue: sumApproved(payments.filter((p) => p.created_at >= monthStartIso)),
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
