"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Filter,
  Loader2,
  Plus,
  RefreshCcw,
  TrendingUp,
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrgAddons } from "@/hooks/use-org-addons";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
  type BudgetAcceptanceStatus,
  type BudgetRecord,
} from "@/types/fertility";
import { BudgetRecordModal } from "@/components/clinical/budget-record-modal";
import { BudgetCard } from "./budget-card";
import { BudgetFiltersSheet, type BudgetFilters } from "./budget-filters-sheet";

interface BudgetWithJoins extends BudgetRecord {
  patient?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
  followup?: { id: string; expected_by: string | null; status: string | null } | null;
  sent_by?: { id: string; full_name: string | null } | null;
}

interface ListResponse {
  items: BudgetWithJoins[];
  has_more: boolean;
  counts: { pending: number; accepted: number; rejected: number };
  kpis: {
    total_sent_30d: number;
    acceptance_rate_pct: number;
    rejection_rate_pct: number;
    avg_time_to_acceptance_days: number | null;
  };
}

const TAB_TO_BUCKET: Record<string, "pending" | "accepted" | "rejected"> = {
  pending: "pending",
  accepted: "accepted",
  rejected: "rejected",
};

const DEFAULT_FILTERS: BudgetFilters = {
  treatment_types: [],
  doctor_id: "all",
  date_from: null,
  date_to: null,
  q: "",
};

export default function BudgetsPage() {
  const { hasAnyAddon, loading: addonsLoading } = useOrgAddons();
  const fertilityActive = hasAnyAddon([FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY]);

  const [tab, setTab] = useState<"pending" | "accepted" | "rejected">("pending");
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filters, setFilters] = useState<BudgetFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<BudgetFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const buildQuery = useCallback(
    (bucket: "pending" | "accepted" | "rejected", f: BudgetFilters) => {
      const sp = new URLSearchParams();
      sp.set("bucket", bucket);
      sp.set("limit", "20");
      if (f.treatment_types.length === 1) sp.set("treatment_type", f.treatment_types[0]);
      if (f.doctor_id !== "all") sp.set("doctor_id", f.doctor_id);
      if (f.date_from) sp.set("from", f.date_from);
      if (f.date_to) sp.set("to", f.date_to);
      if (f.q.trim()) sp.set("q", f.q.trim());
      return sp.toString();
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!fertilityActive) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/budgets?${buildQuery(tab, filters)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "No se pudieron cargar los presupuestos");
        setData(null);
        return;
      }
      const json = (await res.json()) as ListResponse;

      // Client-side multi-treatment-type filter (the API only takes one).
      let items = json.items;
      if (filters.treatment_types.length > 1) {
        const set = new Set(filters.treatment_types);
        items = items.filter((b) => set.has(b.treatment_type));
      }

      setData({ ...json, items });
    } finally {
      setLoading(false);
    }
  }, [tab, filters, fertilityActive, buildQuery]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const counts = data?.counts ?? { pending: 0, accepted: 0, rejected: 0 };
  const kpis = data?.kpis;

  const onApplyFilters = (next: BudgetFilters) => {
    setFilters(next);
    setFiltersOpen(false);
  };

  const filtered = useMemo(() => data?.items ?? [], [data]);

  if (addonsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!fertilityActive) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <Wallet className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-base font-semibold">Pack Fertilidad requerido</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Activa el addon Pack Fertilidad para acceder al embudo de presupuestos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Presupuestos</h1>
          <p className="text-sm text-muted-foreground">
            Tracking de presupuestos enviados a pacientes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setDraftFilters(filters);
              setFiltersOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Filter className="h-4 w-4" />
            Filtros
          </button>
          <button
            onClick={() => refresh()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <RefreshCcw className="h-4 w-4" />
            Actualizar
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Registrar presupuesto
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={<Wallet className="h-4 w-4 text-emerald-500" />}
          label="Enviados (30d)"
          value={kpis ? String(kpis.total_sent_30d) : "—"}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
          label="Aceptados"
          value={kpis ? `${counts.accepted}` : "—"}
          subtitle={kpis ? `${kpis.acceptance_rate_pct}% conversión` : undefined}
        />
        <KpiCard
          icon={<XCircle className="h-4 w-4 text-rose-500" />}
          label="Rechazados"
          value={kpis ? `${counts.rejected}` : "—"}
          subtitle={kpis ? `${kpis.rejection_rate_pct}% rechazo` : undefined}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          label="Tiempo prom. aceptación"
          value={
            kpis?.avg_time_to_acceptance_days !== null &&
            kpis?.avg_time_to_acceptance_days !== undefined
              ? `${kpis.avg_time_to_acceptance_days} d`
              : "—"
          }
        />
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(TAB_TO_BUCKET[v] ?? "pending")}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="pending">
            <Clock className="mr-1.5 h-3.5 w-3.5" />
            Pendientes ({counts.pending})
          </TabsTrigger>
          <TabsTrigger value="accepted">
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Aceptados ({counts.accepted})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Rechazados ({counts.rejected})
          </TabsTrigger>
        </TabsList>

        {(["pending", "accepted", "rejected"] as const).map((b) => (
          <TabsContent key={b} value={b}>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No hay presupuestos en esta categoría.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((item) => (
                  <BudgetCard
                    key={item.id}
                    budget={item}
                    bucket={b as BudgetAcceptanceStatus}
                    onChanged={refresh}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <BudgetFiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        draft={draftFilters}
        onDraftChange={setDraftFilters}
        onApply={onApplyFilters}
        onReset={() => {
          setFilters(DEFAULT_FILTERS);
          setDraftFilters(DEFAULT_FILTERS);
          setFiltersOpen(false);
        }}
      />

      <BudgetRecordModal
        open={showCreate}
        onOpenChange={setShowCreate}
        onSaved={refresh}
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {subtitle && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
