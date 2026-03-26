"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, DollarSign, TrendingUp, Users, CreditCard } from "lucide-react";

export default function RevenuePage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    totalRevenue: 0,
    monthlyRevenue: 0,
    activeSubscriptions: 0,
    trialingOrgs: 0,
    cancelledOrgs: 0,
    planBreakdown: [] as { name: string; count: number; revenue: number }[],
  });

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

      const [paymentsRes, subsRes, monthPayRes] = await Promise.all([
        supabase.from("patient_payments").select("amount"),
        supabase.from("organization_subscriptions").select("status, plans(name, price_monthly)"),
        supabase.from("patient_payments").select("amount").gte("payment_date", monthStart),
      ]);

      const payments = paymentsRes.data ?? [];
      const monthPayments = monthPayRes.data ?? [];
      const subs = (subsRes.data ?? []) as unknown as { status: string; plans: { name: string; price_monthly: number } | null }[];

      const totalRevenue = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);
      const monthlyRevenue = monthPayments.reduce((s, p) => s + Number(p.amount ?? 0), 0);

      // Plan breakdown
      const planMap = new Map<string, { count: number; revenue: number }>();
      for (const sub of subs) {
        const name = sub.plans?.name ?? "Sin plan";
        const existing = planMap.get(name) ?? { count: 0, revenue: 0 };
        existing.count++;
        if (sub.status === "active") existing.revenue += sub.plans?.price_monthly ?? 0;
        planMap.set(name, existing);
      }

      setData({
        totalRevenue,
        monthlyRevenue,
        activeSubscriptions: subs.filter((s) => s.status === "active").length,
        trialingOrgs: subs.filter((s) => s.status === "trialing").length,
        cancelledOrgs: subs.filter((s) => s.status === "cancelled").length,
        planBreakdown: Array.from(planMap.entries()).map(([name, d]) => ({ name, ...d })),
      });
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
        <p className="text-sm text-muted-foreground mt-1">Ingresos y suscripciones de la plataforma</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <DollarSign className="h-4 w-4 text-emerald-500" /> Revenue total
          </div>
          <p className="text-2xl font-bold">S/{data.totalRevenue.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <TrendingUp className="h-4 w-4 text-blue-500" /> Revenue mensual
          </div>
          <p className="text-2xl font-bold">S/{data.monthlyRevenue.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <CreditCard className="h-4 w-4 text-emerald-500" /> Suscripciones activas
          </div>
          <p className="text-2xl font-bold">{data.activeSubscriptions}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Users className="h-4 w-4 text-amber-500" /> En trial
          </div>
          <p className="text-2xl font-bold">{data.trialingOrgs}</p>
        </div>
      </div>

      {/* Plan breakdown */}
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <h2 className="text-sm font-semibold mb-4">Desglose por Plan</h2>
        <div className="space-y-3">
          {data.planBreakdown.map((plan) => (
            <div key={plan.name} className="flex items-center justify-between">
              <span className="text-sm">{plan.name}</span>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">{plan.count} orgs</span>
                <span className="font-semibold">S/{plan.revenue.toLocaleString()}/mes</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
