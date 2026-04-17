"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Search,
  ArrowUpDown,
  Users,
  Crown,
  Building2,
  TrendingUp,
  AlertTriangle,
  Moon,
  XCircle,
  Sparkles,
  ArrowRight,
} from "lucide-react";

interface Owner {
  id: string;
  name: string;
  slug: string;
  type: string;
  is_active: boolean;
  created_at: string;
  owner: { id: string; name: string | null; email: string | null; avatar_url: string | null };
  plan: string | null;
  mrr: number;
  subscription_status: string | null;
  trial_ends_at: string | null;
  team: { total: number; doctors: number; receptionists: number };
  patients: number;
  total_appointments: number;
  recent_appointments_30d: number;
  total_revenue: number;
  health_status: "healthy" | "at_risk" | "dormant" | "churned" | "trial";
}

type SortKey = "name" | "created_at" | "mrr" | "recent_appointments_30d" | "patients" | "total_revenue";

const HEALTH_CONFIG: Record<string, { label: string; color: string; icon: typeof TrendingUp }> = {
  healthy: { label: "Activo", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30", icon: TrendingUp },
  at_risk: { label: "En riesgo", color: "text-amber-500 bg-amber-500/10 border-amber-500/30", icon: AlertTriangle },
  dormant: { label: "Inactivo", color: "text-slate-400 bg-slate-400/10 border-slate-400/30", icon: Moon },
  churned: { label: "Churned", color: "text-red-500 bg-red-500/10 border-red-500/30", icon: XCircle },
  trial: { label: "Trial", color: "text-blue-500 bg-blue-500/10 border-blue-500/30", icon: Sparkles },
};

export default function OwnersPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterHealth, setFilterHealth] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    fetch("/api/founder/stats/owners")
      .then((r) => r.json())
      .then((data) => {
        setOwners(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const filtered = owners
    .filter((o) => {
      if (filterHealth !== "all" && o.health_status !== filterHealth) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          o.name.toLowerCase().includes(q) ||
          o.owner.name?.toLowerCase().includes(q) ||
          o.owner.email?.toLowerCase().includes(q) ||
          o.slug.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case "name": av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case "created_at": av = a.created_at; bv = b.created_at; break;
        case "mrr": av = a.mrr; bv = b.mrr; break;
        case "recent_appointments_30d": av = a.recent_appointments_30d; bv = b.recent_appointments_30d; break;
        case "patients": av = a.patients; bv = b.patients; break;
        case "total_revenue": av = a.total_revenue; bv = b.total_revenue; break;
      }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });

  // Summary stats
  const totalMRR = owners.reduce((s, o) => s + o.mrr, 0);
  const healthCounts = owners.reduce(
    (acc, o) => { acc[o.health_status] = (acc[o.health_status] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Owners</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Seguimiento de cada dueño de clínica en la plataforma
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="text-xl font-bold">{owners.length}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">MRR</p>
          <p className="text-xl font-bold">S/{totalMRR.toLocaleString()}</p>
        </div>
        {(["healthy", "trial", "at_risk", "dormant"] as const).map((h) => {
          const cfg = HEALTH_CONFIG[h];
          const Icon = cfg.icon;
          return (
            <button
              key={h}
              onClick={() => setFilterHealth(filterHealth === h ? "all" : h)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                filterHealth === h ? cfg.color + " border-current" : "border-border/60 bg-card"
              }`}
            >
              <div className="flex items-center gap-1">
                <Icon className="h-3 w-3" />
                <p className="text-[10px] uppercase tracking-wide">{cfg.label}</p>
              </div>
              <p className="text-xl font-bold">{healthCounts[h] ?? 0}</p>
            </button>
          );
        })}
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre, email o slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          />
        </div>
        {filterHealth !== "all" && (
          <button
            onClick={() => setFilterHealth("all")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Limpiar filtro
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30 text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">
                  <button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-foreground">
                    Owner / Clínica <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">Plan</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">
                  <button onClick={() => toggleSort("mrr")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                    MRR <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <button onClick={() => toggleSort("patients")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                    Pacientes <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <button onClick={() => toggleSort("recent_appointments_30d")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                    Citas 30d <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-center font-medium">Equipo</th>
                <th className="px-4 py-3 text-right font-medium">
                  <button onClick={() => toggleSort("total_revenue")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                    Revenue <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  <button onClick={() => toggleSort("created_at")} className="flex items-center gap-1 ml-auto hover:text-foreground">
                    Alta <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const hcfg = HEALTH_CONFIG[o.health_status];
                const HIcon = hcfg.icon;
                return (
                  <tr
                    key={o.id}
                    className="border-b border-border/20 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-xs font-bold uppercase text-muted-foreground">
                          {o.name.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{o.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {o.owner.name ?? o.owner.email ?? "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium">{o.plan ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${hcfg.color}`}
                      >
                        <HIcon className="h-2.5 w-2.5" />
                        {hcfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      S/{o.mrr.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {o.patients.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {o.recent_appointments_30d}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <Crown className="h-3 w-3 text-amber-500" />
                        <span>{o.team.doctors}d</span>
                        <span className="text-border">·</span>
                        <span>{o.team.receptionists}r</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      S/{o.total_revenue.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/founder-dashboard/owners/${o.id}`}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No se encontraron resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
