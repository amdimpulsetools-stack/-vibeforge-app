"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Building2, Users, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      const { data: rawOrgs } = await supabase
        .from("organizations")
        .select("id, name, slug, is_active, organization_type, created_at")
        .order("created_at", { ascending: false });

      if (!rawOrgs) { setLoading(false); return; }

      // Enrich with member count + subscription
      const enriched: OrgRow[] = [];
      for (const org of rawOrgs) {
        const [membersRes, subRes] = await Promise.all([
          supabase.from("organization_members").select("id").eq("organization_id", org.id),
          supabase.from("organization_subscriptions").select("status, plans(name)").eq("organization_id", org.id).limit(1).single(),
        ]);

        enriched.push({
          ...org,
          member_count: membersRes.data?.length ?? 0,
          subscription_status: (subRes.data as Record<string, unknown>)?.status as string ?? null,
          plan_name: ((subRes.data as Record<string, unknown>)?.plans as Record<string, unknown>)?.name as string ?? null,
        });
      }

      setOrgs(enriched);
      setLoading(false);
    };
    load();
  }, []);

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
