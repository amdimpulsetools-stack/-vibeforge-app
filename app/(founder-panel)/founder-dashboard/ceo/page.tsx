"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  AlertTriangle,
  DollarSign,
  Hourglass,
  Building2,
  MessageCircle,
  Receipt,
  Repeat,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { founderFetch } from "@/lib/founder-fetch";

/* Tipos espejo del payload de /api/founder/ceo */
interface CeoOrg {
  id: string;
  name: string;
  created_at: string;
  owner_email: string | null;
  members: number;
  patients: number;
  patients_30d: number;
  citas_creadas_7d: number;
  citas_proximas_7d: number;
  last_seen: string | null;
  days_since_seen: number | null;
  sub_status: string | null;
  plan_name: string | null;
  billing_cycle: string | null;
  mrr: number;
  trial_days_left: number | null;
  features: {
    whatsapp: boolean;
    facturacion: boolean;
    seguimientos_30d: number;
    plugins: string[];
  };
  category: "activa" | "vacia" | "bot";
  health: "verde" | "ambar" | "rojo";
}
interface CeoPayload {
  pulse: {
    mrr: number;
    mrr_proyectado_si_trials_convierten: number;
    cobrado_mes: number;
    cobrado_historico: number;
    trials: { org: string; org_id: string; dias_restantes: number | null; ultima_actividad_dias: number | null }[];
    en_problemas: { org: string; org_id: string; status: string | null }[];
    conteos: { total_orgs: number; activas: number; vacias: number; sospechosas_bot: number };
  };
  orgs: CeoOrg[];
  alerts: { severity: "rojo" | "ambar"; title: string; detail: string; org_id?: string }[];
  generated_at: string;
}

const SUB_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: "Activa", cls: "bg-emerald-500/10 text-emerald-600" },
  trialing: { label: "Trial", cls: "bg-blue-500/10 text-blue-600" },
  grace: { label: "Gracia", cls: "bg-amber-500/10 text-amber-600" },
  past_due: { label: "Vencida", cls: "bg-red-500/10 text-red-600" },
  pending: { label: "Pendiente", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelada", cls: "bg-muted text-muted-foreground" },
};

type CategoryFilter = "activa" | "vacia" | "bot" | "todas";

export default function CeoPanelPage() {
  const [data, setData] = useState<CeoPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryFilter>("activa");
  const [search, setSearch] = useState("");

  useEffect(() => {
    founderFetch<CeoPayload>("/api/founder/ceo")
      .then(setData)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Error"));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.orgs;
    if (category !== "todas") rows = rows.filter((o) => o.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          (o.owner_email ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [data, category, search]);

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
        <p className="text-sm font-semibold text-red-500">No se pudo cargar el panel</p>
        <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Reintentar</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { pulse, alerts } = data;
  const fmt = (n: number) => `S/${n.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Panel CEO</h1>
        <p className="text-sm text-muted-foreground">
          El pulso de Yenda — ingreso real, salud por clínica y qué requiere tu acción hoy.
        </p>
      </div>

      {/* ── Capa A: Pulso ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PulseCard
          icon={DollarSign}
          label="MRR (ingreso Yenda)"
          value={fmt(pulse.mrr)}
          hint={`Proyectado si trials convierten: ${fmt(pulse.mrr_proyectado_si_trials_convierten)}`}
        />
        <PulseCard
          icon={Receipt}
          label="Cobrado este mes"
          value={fmt(pulse.cobrado_mes)}
          hint={`Histórico: ${fmt(pulse.cobrado_historico)} · Solo pagos de clínicas a Yenda, no su facturación`}
        />
        <PulseCard
          icon={Hourglass}
          label="Trials activos"
          value={String(pulse.trials.length)}
          hint={
            pulse.trials.length
              ? pulse.trials
                  .map((t) => `${t.org}: ${t.dias_restantes ?? "?"}d`)
                  .join(" · ")
              : "Ninguno"
          }
        />
        <PulseCard
          icon={Building2}
          label="Clínicas con actividad"
          value={String(pulse.conteos.activas)}
          hint={`${pulse.conteos.total_orgs} registradas · ${pulse.conteos.vacias} vacías · ${pulse.conteos.sospechosas_bot} sospechosas de bot`}
        />
      </div>

      {/* ── Capa D: Alertas ── */}
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          <AlertTriangle className="h-4 w-4" /> Requiere tu acción
        </h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada urgente hoy. 🎉</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li
                key={i}
                className={cn(
                  "rounded-xl border px-4 py-2.5 text-sm",
                  a.severity === "rojo"
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-amber-500/30 bg-amber-500/5"
                )}
              >
                <span className="font-semibold">{a.title}</span>
                <span className="ml-2 text-muted-foreground">{a.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Capa B: Salud por clínica ── */}
      <div className="rounded-2xl border border-border/60 bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 p-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Salud por clínica
          </h2>
          <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1 text-xs">
            {(
              [
                ["activa", `Con actividad (${pulse.conteos.activas})`],
                ["vacia", `Vacías (${pulse.conteos.vacias})`],
                ["bot", `Sospechosas (${pulse.conteos.sospechosas_bot})`],
                ["todas", `Todas (${pulse.conteos.total_orgs})`],
              ] as [CategoryFilter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 font-medium transition-colors",
                  category === key
                    ? "bg-card text-foreground shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar org o email…"
              className="rounded-lg border border-input bg-background py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Clínica</th>
                <th className="px-3 py-2.5 font-medium">Plan / Estado</th>
                <th className="px-3 py-2.5 font-medium">Última actividad</th>
                <th className="px-3 py-2.5 font-medium text-right">Citas 7d</th>
                <th className="px-3 py-2.5 font-medium text-right">Próx. 7d</th>
                <th className="px-3 py-2.5 font-medium text-right">Pacientes</th>
                <th className="px-3 py-2.5 font-medium">Features</th>
                <th className="px-3 py-2.5 font-medium text-right">MRR</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Sin organizaciones en este filtro.
                  </td>
                </tr>
              )}
              {filtered.map((o) => {
                const sub = o.sub_status ? SUB_LABEL[o.sub_status] : null;
                return (
                  <tr key={o.id} className="border-b border-border/40 hover:bg-accent/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          title={`Salud: ${o.health}`}
                          className={cn(
                            "h-2.5 w-2.5 shrink-0 rounded-full",
                            o.health === "rojo"
                              ? "bg-red-500"
                              : o.health === "ambar"
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                          )}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{o.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {o.owner_email ?? "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs">{o.plan_name ?? "—"}</span>
                        {sub && (
                          <span className={cn("w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold", sub.cls)}>
                            {sub.label}
                            {o.trial_days_left != null && ` · ${o.trial_days_left}d`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {o.days_since_seen == null
                        ? "Nunca"
                        : o.days_since_seen === 0
                          ? "Hoy"
                          : `Hace ${o.days_since_seen}d`}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{o.citas_creadas_7d}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{o.citas_proximas_7d}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {o.patients}
                      {o.patients_30d > 0 && (
                        <span className="ml-1 text-[10px] text-emerald-600">+{o.patients_30d}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <MessageCircle
                          className={cn("h-3.5 w-3.5", o.features.whatsapp ? "text-emerald-500" : "text-muted-foreground/30")}
                        />
                        <Receipt
                          className={cn("h-3.5 w-3.5", o.features.facturacion ? "text-emerald-500" : "text-muted-foreground/30")}
                        />
                        <Repeat
                          className={cn(
                            "h-3.5 w-3.5",
                            o.features.seguimientos_30d > 0 ? "text-emerald-500" : "text-muted-foreground/30"
                          )}
                        />
                        {o.features.plugins.length > 0 && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            {o.features.plugins.length} plugin
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                      {o.mrr > 0 ? fmt(o.mrr) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        WhatsApp · Facturación · Seguimientos — verde = conectado/en uso. Generado{" "}
        {new Date(data.generated_at).toLocaleString("es-PE")}.
      </p>
    </div>
  );
}

function PulseCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}
