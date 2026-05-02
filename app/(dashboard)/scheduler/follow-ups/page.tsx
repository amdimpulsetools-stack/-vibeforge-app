"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CalendarCheck,
  Filter,
  Loader2,
  RefreshCcw,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/supabase/client";
import type { Doctor } from "@/types/admin";
import { FollowupCard } from "./followup-card";
import type {
  FollowupCounts,
  FollowupFilters,
  FollowupRuleLite,
  FollowupVariant,
  FollowupWithDetails,
  RecoveredKpis,
} from "./types";

const PAGE_SIZE = 20;
const COUNTS_TTL_MS = 60_000;

const DEFAULT_FILTERS: FollowupFilters = {
  doctor_id: "all",
  origin: ["manual", "rule", "system"],
  rule_key: "all",
  date_from: null,
  date_to: null,
};

const TAB_TO_VARIANT: Record<string, FollowupVariant> = {
  pending: "pending",
  recovered: "recovered",
  no_response: "no_response",
};

interface ListResponse {
  items: FollowupWithDetails[];
  has_more: boolean;
}

export default function FollowUpsPage() {
  const [tab, setTab] = useState<"pending" | "recovered" | "no_response">(
    "pending"
  );
  const [counts, setCounts] = useState<FollowupCounts>({
    pending: 0,
    recovered: 0,
    no_response: 0,
  });
  const [countsAt, setCountsAt] = useState(0);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [rules, setRules] = useState<FollowupRuleLite[]>([]);
  const [filters, setFilters] = useState<FollowupFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<FollowupFilters>(
    DEFAULT_FILTERS
  );

  // Per-tab state — lazy load: only the active tab has data
  const [pending, setPending] = useState<TabState>(emptyTab());
  const [recovered, setRecovered] = useState<TabState>(emptyTab());
  const [noResponse, setNoResponse] = useState<TabState>(emptyTab());
  const [recoveredKpis, setRecoveredKpis] = useState<RecoveredKpis | null>(null);

  // Initial doctors + rules
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("doctors")
      .select("*")
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => setDoctors(data ?? []));
  }, []);

  useEffect(() => {
    fetch("/api/admin/fertility/rules", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { rules: [] }))
      .then((j: { rules?: FollowupRuleLite[] }) => setRules(j.rules ?? []))
      .catch(() => setRules([]));
  }, []);

  const refreshCounts = useCallback(async () => {
    if (Date.now() - countsAt < COUNTS_TTL_MS) return;
    try {
      const res = await fetch(
        `/api/clinical-followups/dashboard?${buildQuery(filters, "counts")}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        counts?: Partial<FollowupCounts> & {
          overdue?: number;
          this_week?: number;
          upcoming?: number;
          total?: number;
        };
      };
      if (json.counts) {
        // Support both the new shape (pending/recovered/no_response) and
        // the legacy shape (overdue/this_week/upcoming/total).
        const c = json.counts;
        setCounts({
          pending:
            c.pending ??
            ((c.overdue ?? 0) + (c.this_week ?? 0) + (c.upcoming ?? 0)),
          recovered: c.recovered ?? 0,
          no_response: c.no_response ?? 0,
        });
        setCountsAt(Date.now());
      }
    } catch {
      // soft fail
    }
  }, [countsAt, filters]);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  const fetchTab = useCallback(
    async (
      variant: FollowupVariant,
      filtersToUse: FollowupFilters,
      reset: boolean
    ) => {
      const setter =
        variant === "pending"
          ? setPending
          : variant === "recovered"
            ? setRecovered
            : setNoResponse;

      setter((prev) => ({ ...prev, loading: true }));
      const offset = reset
        ? 0
        : variant === "pending"
          ? pending.items.length
          : variant === "recovered"
            ? recovered.items.length
            : noResponse.items.length;

      try {
        const qs = buildQuery(filtersToUse, variant, offset, PAGE_SIZE);
        const res = await fetch(
          `/api/clinical-followups/dashboard?${qs}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          setter((prev) => ({ ...prev, loading: false, error: true }));
          return;
        }
        const json = (await res.json()) as Partial<ListResponse> & {
          kpis?: RecoveredKpis;
          data?: {
            overdue?: FollowupWithDetails[];
            this_week?: FollowupWithDetails[];
            upcoming?: FollowupWithDetails[];
          };
        };

        let items: FollowupWithDetails[];
        let hasMore: boolean;
        if (Array.isArray(json.items)) {
          items = json.items;
          hasMore = json.has_more ?? false;
        } else if (variant === "pending" && json.data) {
          // Legacy shape — flatten the three groups into a single pending list.
          items = [
            ...(json.data.overdue ?? []),
            ...(json.data.this_week ?? []),
            ...(json.data.upcoming ?? []),
          ];
          hasMore = false;
        } else {
          items = [];
          hasMore = false;
        }

        setter((prev) => ({
          loading: false,
          error: false,
          loaded: true,
          items: reset ? items : [...prev.items, ...items],
          hasMore,
        }));

        if (variant === "recovered" && json.kpis) {
          setRecoveredKpis(json.kpis);
        }
      } catch {
        setter((prev) => ({ ...prev, loading: false, error: true }));
      }
    },
    [pending.items.length, recovered.items.length, noResponse.items.length]
  );

  // Fetch the default tab on mount.
  useEffect(() => {
    fetchTab("pending", filters, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When tab changes, lazy-load if not loaded.
  useEffect(() => {
    const variant = TAB_TO_VARIANT[tab];
    const state =
      variant === "pending"
        ? pending
        : variant === "recovered"
          ? recovered
          : noResponse;
    if (!state.loaded && !state.loading) {
      fetchTab(variant, filters, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const applyFilters = (next: FollowupFilters) => {
    setFilters(next);
    setPending(emptyTab());
    setRecovered(emptyTab());
    setNoResponse(emptyTab());
    setCountsAt(0);
    fetchTab(TAB_TO_VARIANT[tab], next, true);
    setFiltersOpen(false);
  };

  const refresh = () => {
    setCountsAt(0);
    fetchTab(TAB_TO_VARIANT[tab], filters, true);
    refreshCounts();
  };

  // Action handlers — call PATCH subroute endpoints (owned by Agente 2).
  const patchAction = async (
    path: string,
    body: Record<string, unknown> | null,
    successMsg: string
  ): Promise<boolean> => {
    try {
      const res = await fetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast.success(successMsg);
      refresh();
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al actualizar el seguimiento"
      );
      return false;
    }
  };

  const onContact = (id: string) =>
    patchAction(
      `/api/clinical-followups/${id}/contact`,
      { type: "manual_contacted" },
      "Marcado como contactado"
    );

  const onSnooze = (id: string, days: number) =>
    patchAction(
      `/api/clinical-followups/${id}/snooze`,
      { days },
      `Pospuesto ${days} días`
    );

  const onMarkNoResponse = (id: string) =>
    patchAction(
      `/api/clinical-followups/${id}/close-no-response`,
      null,
      "Movido a sin respuesta"
    );

  const onCloseManual = (id: string, reason: string) =>
    patchAction(
      `/api/clinical-followups/${id}/close-manual`,
      { reason },
      "Caso cerrado"
    );

  const onReactivate = (id: string) =>
    patchAction(
      `/api/clinical-followups/${id}/reactivate`,
      null,
      "Seguimiento reactivado"
    );

  const activeTabState =
    tab === "pending" ? pending : tab === "recovered" ? recovered : noResponse;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">Seguimientos</h1>
            <p className="text-sm text-muted-foreground">
              Pacientes pendientes de contactar para agendar próxima cita
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
              aria-label="Recargar"
            >
              <RefreshCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Recargar</span>
            </button>
            <Sheet
              open={filtersOpen}
              onOpenChange={(o) => {
                setFiltersOpen(o);
                if (o) setDraftFilters(filters);
              }}
            >
              <SheetTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent">
                  <Filter className="h-4 w-4" />
                  Filtros
                </button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Filtros</SheetTitle>
                  <SheetDescription>
                    Acota qué seguimientos quieres ver en los tres tabs.
                  </SheetDescription>
                </SheetHeader>

                <FiltersBody
                  filters={draftFilters}
                  setFilters={setDraftFilters}
                  doctors={doctors}
                  rules={rules}
                />

                <SheetFooter>
                  <button
                    type="button"
                    onClick={() => setDraftFilters(DEFAULT_FILTERS)}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    Limpiar filtros
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFilters(draftFilters)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Aplicar
                  </button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4">
        <Tabs
          value={tab}
          onValueChange={(v) =>
            setTab(v as "pending" | "recovered" | "no_response")
          }
        >
          <TabsList>
            <TabsTrigger value="pending">
              Pendientes
              <CountBadge count={counts.pending} />
            </TabsTrigger>
            <TabsTrigger value="recovered">
              Recuperados
              <CountBadge count={counts.recovered} tone="emerald" />
            </TabsTrigger>
            <TabsTrigger value="no_response">
              Sin respuesta
              <CountBadge count={counts.no_response} tone="amber" />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <PendingTabContent
              state={pending}
              onContact={onContact}
              onSnooze={onSnooze}
              onMarkNoResponse={onMarkNoResponse}
              onCloseManual={onCloseManual}
              onLoadMore={() => fetchTab("pending", filters, false)}
            />
          </TabsContent>

          <TabsContent value="recovered">
            <RecoveredTabContent
              state={recovered}
              kpis={recoveredKpis}
              onLoadMore={() => fetchTab("recovered", filters, false)}
            />
          </TabsContent>

          <TabsContent value="no_response">
            <NoResponseTabContent
              state={noResponse}
              onCloseManual={onCloseManual}
              onReactivate={onReactivate}
              onLoadMore={() => fetchTab("no_response", filters, false)}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Loading shimmer for current tab if first load */}
      {!activeTabState.loaded && activeTabState.loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Tab content components
// ─────────────────────────────────────────────────────────────────────

interface TabState {
  loading: boolean;
  loaded: boolean;
  error: boolean;
  items: FollowupWithDetails[];
  hasMore: boolean;
}

function emptyTab(): TabState {
  return {
    loading: false,
    loaded: false,
    error: false,
    items: [],
    hasMore: false,
  };
}

function PendingTabContent({
  state,
  onContact,
  onSnooze,
  onMarkNoResponse,
  onCloseManual,
  onLoadMore,
}: {
  state: TabState;
  onContact: (id: string) => Promise<unknown>;
  onSnooze: (id: string, days: number) => Promise<unknown>;
  onMarkNoResponse: (id: string) => Promise<unknown>;
  onCloseManual: (id: string, reason: string) => Promise<unknown>;
  onLoadMore: () => void;
}) {
  if (!state.loaded) return null;
  if (state.items.length === 0) {
    return (
      <EmptyState
        title="Sin seguimientos pendientes ahora mismo"
        description="Cuando complete una primera consulta de fertilidad, aparecerá un seguimiento automático aquí."
      />
    );
  }
  return (
    <div className="space-y-2 pb-12">
      {state.items.map((f) => (
        <FollowupCard
          key={f.id}
          followup={f}
          variant="pending"
          onContact={() => onContact(f.id)}
          onSnooze={(days) => onSnooze(f.id, days)}
          onMarkNoResponse={() => onMarkNoResponse(f.id)}
          onCloseManual={(reason) => onCloseManual(f.id, reason)}
        />
      ))}
      {state.hasMore && (
        <LoadMoreButton onClick={onLoadMore} loading={state.loading} />
      )}
    </div>
  );
}

function RecoveredTabContent({
  state,
  kpis,
  onLoadMore,
}: {
  state: TabState;
  kpis: RecoveredKpis | null;
  onLoadMore: () => void;
}) {
  if (!state.loaded) return null;

  return (
    <div className="space-y-4 pb-12">
      {kpis && <RecoveredKpiHeader kpis={kpis} />}

      {state.items.length === 0 ? (
        <EmptyState
          title="Aún no hay recuperaciones"
          description="No se registraron recuperaciones en los últimos 30 días."
        />
      ) : (
        <div className="space-y-2">
          {state.items.map((f) => (
            <FollowupCard key={f.id} followup={f} variant="recovered" />
          ))}
        </div>
      )}

      {state.hasMore && (
        <LoadMoreButton onClick={onLoadMore} loading={state.loading} />
      )}

      <div className="pt-2 text-center">
        <span
          className="inline-flex items-center gap-1 text-xs text-muted-foreground/70"
          title="Próximamente"
        >
          Ver reporte completo (próximamente)
        </span>
      </div>
    </div>
  );
}

function NoResponseTabContent({
  state,
  onCloseManual,
  onReactivate,
  onLoadMore,
}: {
  state: TabState;
  onCloseManual: (id: string, reason: string) => Promise<unknown>;
  onReactivate: (id: string) => Promise<unknown>;
  onLoadMore: () => void;
}) {
  if (!state.loaded) return null;
  if (state.items.length === 0) {
    return (
      <EmptyState
        title="Sin casos cerrados"
        description="No hay casos cerrados sin respuesta en los últimos 60 días."
      />
    );
  }
  return (
    <div className="space-y-2 pb-12">
      {state.items.map((f) => (
        <FollowupCard
          key={f.id}
          followup={f}
          variant="no_response"
          onReactivate={() => onReactivate(f.id)}
          onCloseManual={(reason) => onCloseManual(f.id, reason)}
        />
      ))}
      {state.hasMore && (
        <LoadMoreButton onClick={onLoadMore} loading={state.loading} />
      )}
    </div>
  );
}

function RecoveredKpiHeader({ kpis }: { kpis: RecoveredKpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        icon={<Sparkles className="h-4 w-4" />}
        label="Recuperaciones atribuibles"
        value={String(kpis.recovered_attributable)}
        helper="últimos 30 días"
        tone="emerald"
      />
      <KpiCard
        icon={<Users className="h-4 w-4" />}
        label="Iniciativa propia"
        value={String(kpis.organic_initiative)}
        helper="últimos 30 días"
        tone="muted"
      />
      <KpiCard
        icon={<TrendingUp className="h-4 w-4" />}
        label="Tasa de recuperación"
        value={`${Math.round(kpis.recovery_rate_pct)}%`}
        helper="recuperados / cerrados"
        tone="emerald"
      />
      <KpiCard
        icon={<Wallet className="h-4 w-4" />}
        label="Revenue estimado atribuido"
        value={`S/ ${kpis.revenue_attributed.toLocaleString("es-PE")}`}
        helper="basado en LTV"
        tone="violet"
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
  tone: "emerald" | "violet" | "muted";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
      : tone === "violet"
        ? "border-violet-500/20 bg-violet-500/5 text-violet-600"
        : "border-border bg-card text-foreground";

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      <div className="text-[11px] opacity-70">{helper}</div>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
      <CalendarCheck className="mb-2 h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function LoadMoreButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex justify-center pt-3">
      <button
        onClick={onClick}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Cargar más
      </button>
    </div>
  );
}

function CountBadge({
  count,
  tone = "primary",
}: {
  count: number;
  tone?: "primary" | "emerald" | "amber";
}) {
  if (count === 0) return null;
  const cls =
    tone === "emerald"
      ? "bg-emerald-500/15 text-emerald-600"
      : tone === "amber"
        ? "bg-amber-500/15 text-amber-600"
        : "bg-primary/15 text-primary";
  return (
    <span
      className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${cls}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function FiltersBody({
  filters,
  setFilters,
  doctors,
  rules,
}: {
  filters: FollowupFilters;
  setFilters: (f: FollowupFilters) => void;
  doctors: Doctor[];
  rules: FollowupRuleLite[];
}) {
  const toggleOrigin = (origin: "manual" | "rule" | "system") => {
    const next = filters.origin.includes(origin)
      ? filters.origin.filter((o) => o !== origin)
      : [...filters.origin, origin];
    setFilters({ ...filters, origin: next });
  };

  return (
    <div className="space-y-5 overflow-y-auto py-2">
      <FilterField label="Origen del seguimiento">
        <div className="flex flex-col gap-2">
          {(
            [
              { key: "manual", label: "Manual" },
              { key: "rule", label: "Regla automática" },
              { key: "system", label: "Sistema" },
            ] as const
          ).map((opt) => (
            <label
              key={opt.key}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                checked={filters.origin.includes(opt.key)}
                onCheckedChange={() => toggleOrigin(opt.key)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </FilterField>

      <FilterField label="Regla específica">
        <select
          value={filters.rule_key}
          onChange={(e) =>
            setFilters({ ...filters, rule_key: e.target.value })
          }
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="all">Todas las reglas</option>
          {rules.map((r) => (
            <option key={r.rule_key} value={r.rule_key}>
              {r.display_name}
            </option>
          ))}
        </select>
      </FilterField>

      <FilterField label="Doctor">
        <select
          value={filters.doctor_id}
          onChange={(e) =>
            setFilters({ ...filters, doctor_id: e.target.value })
          }
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="all">Todos los doctores</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}
            </option>
          ))}
        </select>
      </FilterField>

      <FilterField label="Fecha">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={filters.date_from ?? ""}
            onChange={(e) =>
              setFilters({ ...filters, date_from: e.target.value || null })
            }
            className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <input
            type="date"
            value={filters.date_to ?? ""}
            onChange={(e) =>
              setFilters({ ...filters, date_to: e.target.value || null })
            }
            className="rounded-lg border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </FilterField>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function buildQuery(
  filters: FollowupFilters,
  bucket: FollowupVariant | "counts",
  offset = 0,
  limit = PAGE_SIZE
): string {
  const params = new URLSearchParams();
  params.set("bucket", bucket);
  if (filters.doctor_id !== "all") params.set("doctor_id", filters.doctor_id);
  if (filters.origin.length > 0 && filters.origin.length < 3) {
    for (const o of filters.origin) params.append("origin", o);
  }
  if (filters.rule_key !== "all") params.set("rule_key", filters.rule_key);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  if (bucket !== "counts") {
    params.set("offset", String(offset));
    params.set("limit", String(limit));
  }
  return params.toString();
}

