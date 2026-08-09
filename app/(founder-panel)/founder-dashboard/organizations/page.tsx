"use client";

import { useEffect, useState } from "react";
import { founderFetch } from "@/lib/founder-fetch";
import { Loader2, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClinicsSubNav } from "../subnav";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  organization_type: string | null;
  created_at: string;
  member_count: number;
  subscription_status: string | null;
  plan_name: string | null;
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    const load = async () => {
      try {
        const data = await founderFetch<OrgRow[]>("/api/founder/stats/organizations");
        setOrgs(Array.isArray(data) ? data : []);
      } catch (e) {
        // Antes un !res.ok dejaba el [] inicial → "0 organizaciones" falso.
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

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const STATUS_COLORS: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-500",
    trialing: "bg-blue-500/10 text-blue-500",
    past_due: "bg-amber-500/10 text-amber-500",
    cancelled: "bg-red-500/10 text-red-500",
    expired: "bg-red-500/10 text-red-500",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organizaciones</h1>
        <p className="text-sm text-muted-foreground mt-1">{orgs.length} organizaciones registradas</p>
      </div>
      <ClinicsSubNav />

      <div className="rounded-xl border border-border/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Organización</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipo</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Miembros</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plan</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Creada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {orgs.map((org) => (
              <tr key={org.id} className="hover:bg-accent/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="font-medium">{org.name}</p>
                      <p className="text-xs text-muted-foreground">{org.slug}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground capitalize">{org.organization_type ?? "—"}</td>
                <td className="px-4 py-3 text-center">{org.member_count}</td>
                <td className="px-4 py-3">{org.plan_name ?? "Sin plan"}</td>
                <td className="px-4 py-3">
                  {org.subscription_status ? (
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_COLORS[org.subscription_status] ?? "bg-muted text-muted-foreground")}>
                      {org.subscription_status}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {new Date(org.created_at).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
