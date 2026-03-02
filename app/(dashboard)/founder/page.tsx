"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { formatCurrency } from "@/lib/utils";
import { ORG_TYPE_LABELS } from "@/lib/constants";
import {
  Building2,
  Users,
  CalendarDays,
  DollarSign,
  TrendingUp,
  Crown,
  Loader2,
  Stethoscope,
  Clock,
} from "lucide-react";

interface OrgByPlan {
  slug: string;
  name: string;
  org_count: number;
}

interface OrgByType {
  organization_type: string;
  org_count: number;
}

interface RecentOrg {
  id: string;
  name: string;
  slug: string;
  organization_type: string;
  created_at: string;
  plan_name: string | null;
  plan_slug: string | null;
  sub_status: string | null;
}

interface FounderStats {
  total_organizations: number;
  total_users: number;
  total_patients: number;
  total_appointments_this_month: number;
  orgs_by_plan: OrgByPlan[];
  orgs_by_type: OrgByType[];
  revenue_this_month: number;
  recent_orgs: RecentOrg[];
}

const PLAN_COLORS: Record<string, string> = {
  independiente: "bg-emerald-500/10 text-emerald-400",
  starter: "bg-emerald-500/10 text-emerald-400",
  professional: "bg-blue-500/10 text-blue-400",
  enterprise: "bg-amber-500/10 text-amber-400",
};

export default function FounderDashboard() {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  const [stats, setStats] = useState<FounderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const checkAndFetch = async () => {
      const supabase = createClient();

      // Check founder flag
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("is_founder")
        .eq("id", user.id)
        .single();

      if (!profile?.is_founder) {
        router.push("/dashboard");
        return;
      }

      setAuthorized(true);

      // Fetch stats
      const res = await fetch("/api/founder");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
      setLoading(false);
    };

    checkAndFetch();
  }, [user, userLoading, router]);

  if (loading || !authorized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Error al cargar estadísticas</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
            <Crown className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Founder Dashboard
            </h1>
            <p className="text-muted-foreground">
              Vista general de la plataforma
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title="Organizaciones"
          value={stats.total_organizations.toLocaleString()}
          icon={Building2}
          color="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <KpiCard
          title="Usuarios totales"
          value={stats.total_users.toLocaleString()}
          icon={Users}
          color="text-purple-400"
          bgColor="bg-purple-500/10"
        />
        <KpiCard
          title="Pacientes totales"
          value={stats.total_patients.toLocaleString()}
          icon={Stethoscope}
          color="text-cyan-400"
          bgColor="bg-cyan-500/10"
        />
        <KpiCard
          title="Citas este mes"
          value={stats.total_appointments_this_month.toLocaleString()}
          icon={CalendarDays}
          color="text-emerald-400"
          bgColor="bg-emerald-500/10"
        />
        <KpiCard
          title="Facturación mes"
          value={formatCurrency(stats.revenue_this_month)}
          icon={DollarSign}
          color="text-amber-400"
          bgColor="bg-amber-500/10"
        />
      </div>

      {/* Distribution cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Organizations by Plan */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10">
              <TrendingUp className="h-4 w-4 text-blue-400" />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Organizaciones por plan
            </h2>
          </div>
          <div className="space-y-3">
            {stats.orgs_by_plan.map((p) => {
              const total = Math.max(stats.total_organizations, 1);
              const pct = Math.round((p.org_count / total) * 100);
              return (
                <div key={p.slug}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${PLAN_COLORS[p.slug] ?? "bg-muted text-muted-foreground"}`}
                    >
                      {p.name}
                    </span>
                    <span className="text-sm font-bold">
                      {p.org_count}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({pct}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Organizations by Type */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10">
              <Building2 className="h-4 w-4 text-purple-400" />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Organizaciones por tipo
            </h2>
          </div>
          <div className="space-y-3">
            {stats.orgs_by_type.map((t) => {
              const total = Math.max(stats.total_organizations, 1);
              const pct = Math.round((t.org_count / total) * 100);
              return (
                <div key={t.organization_type}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium">
                      {ORG_TYPE_LABELS[t.organization_type] ??
                        t.organization_type}
                    </span>
                    <span className="text-sm font-bold">
                      {t.org_count}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({pct}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-purple-500/50 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Organizations */}
      <div className="rounded-2xl border border-border/60 bg-card">
        <div className="flex items-center gap-2.5 border-b border-border/40 px-6 py-4">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-bold">Últimas organizaciones registradas</h2>
        </div>
        {stats.recent_orgs.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Sin organizaciones registradas
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {stats.recent_orgs.map((org) => (
              <div
                key={org.id}
                className="flex items-center gap-4 px-6 py-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{org.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ORG_TYPE_LABELS[org.organization_type] ??
                      org.organization_type}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${PLAN_COLORS[org.plan_slug ?? ""] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {org.plan_name ?? "Sin plan"}
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(org.created_at).toLocaleDateString("es-PE")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  bgColor,
}: {
  title: string;
  value: string;
  icon: typeof Building2;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="card-hover rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {title}
        </span>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${bgColor}`}
        >
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </div>
      <div className="mt-3">
        <span className="text-2xl font-extrabold tracking-tight">{value}</span>
      </div>
    </div>
  );
}
