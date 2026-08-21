"use client";

import { useEffect, useState } from "react";
import { founderFetch } from "@/lib/founder-fetch";
import { Loader2, DollarSign, TrendingUp, Users, CreditCard } from "lucide-react";
import { NumberPopIn } from "@/components/ui/number-pop-in";
import { MoneySubNav } from "../subnav";

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

  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    const load = async () => {
      try {
        setData(await founderFetch("/api/founder/stats/revenue"));
      } catch (e) {
        // Antes un !res.ok dejaba los ceros iniciales como si fueran reales.
        setLoadError(e instanceof Error ? e.message : "Error");
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
        <p className="text-sm font-semibold text-red-500">No se pudieron cargar los datos</p>
        <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Reintentar</button>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
        <p className="text-sm text-muted-foreground mt-1">Ingresos y suscripciones de la plataforma</p>
      </div>
      <MoneySubNav />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <DollarSign className="h-4 w-4 text-emerald-500" /> Revenue total
          </div>
          <p className="text-2xl font-bold"><NumberPopIn key={data.totalRevenue} value={`S/${data.totalRevenue.toLocaleString()}`} /></p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <TrendingUp className="h-4 w-4 text-blue-500" /> Revenue mensual
          </div>
          <p className="text-2xl font-bold"><NumberPopIn key={data.monthlyRevenue} value={`S/${data.monthlyRevenue.toLocaleString()}`} /></p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <CreditCard className="h-4 w-4 text-emerald-500" /> Suscripciones activas
          </div>
          <p className="text-2xl font-bold"><NumberPopIn key={data.activeSubscriptions} value={String(data.activeSubscriptions)} /></p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Users className="h-4 w-4 text-amber-500" /> En trial
          </div>
          <p className="text-2xl font-bold"><NumberPopIn key={data.trialingOrgs} value={String(data.trialingOrgs)} /></p>
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
