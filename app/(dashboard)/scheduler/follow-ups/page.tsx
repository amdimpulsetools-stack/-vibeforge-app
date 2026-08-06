"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  X,
} from "lucide-react";
import Link from "next/link";
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
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useFollowupCapabilities } from "@/hooks/use-followup-capabilities";
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

const PAGE_SIZE = 15;

const DEFAULT_FILTERS: FollowupFilters = {
  doctor_id: "all",
  origin: ["manual", "rule", "system"],
  rule_key: "all",
  date_from: null,
  date_to: null,
};

/**
 * Móvil: los 3 tabs reparten el ancho completo (`flex-1`) con tipografía
 * y gaps comprimidos para que "Recuperados 12" entre en ~103px; el
 * `truncate` es solo la red de seguridad para pantallas de 360px con
 * contadores de 3 dígitos. Desde `md:` se restauran exactamente los
 * valores del primitivo (px-3, text-sm, gap-2, ancho intrínseco).
 */
const TAB_TRIGGER_CLASS =
  "min-w-0 flex-1 gap-1 overflow-hidden px-1.5 text-xs md:flex-none md:gap-2 md:overflow-visible md:px-3 md:text-sm";

const TAB_TO_VARIANT: Record<string, FollowupVariant> = {
  pending: "pending",
  recovered: "recovered",
  no_response: "no_response",
};

type AdvanceAction = Parameters<
  NonNullable<Parameters<typeof FollowupCard>[0]["onAdvance"]>
>[0];

interface ListResponse {
  items: FollowupWithDetails[];
  has_more: boolean;
}

export default function FollowUpsPage() {
  // La bandeja manda su org activa a la API: sin ella el endpoint resuelve
  // la primera membresía, que para un usuario multi-org puede ser otra
  // clínica (bandeja vacía o con seguimientos que no son los suyos).
  const { organizationId, loading: orgLoading } = useOrganization();
  const {
    hasJourney,
    hasRevenueKpis,
    hasStepTemplates,
    loading: capabilitiesLoading,
  } = useFollowupCapabilities();
  // Deep-link desde el widget del dashboard del doctor:
  // `/scheduler/follow-ups?doctor=<id>`. Solo se lee en el montaje —
  // a partir de ahí manda el panel de filtros, así que cambiar el
  // filtro en la UI no tiene que pelearse con la URL.
  const searchParams = useSearchParams();
  const initialDoctorId = searchParams.get("doctor");
  const [tab, setTab] = useState<"pending" | "recovered" | "no_response">(
    "pending"
  );
  const [counts, setCounts] = useState<FollowupCounts>({
    pending: 0,
    recovered: 0,
    no_response: 0,
  });
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [rules, setRules] = useState<FollowupRuleLite[]>([]);
  const [filters, setFilters] = useState<FollowupFilters>(() =>
    initialDoctorId
      ? { ...DEFAULT_FILTERS, doctor_id: initialDoctorId }
      : DEFAULT_FILTERS
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<FollowupFilters>(filters);

  // Per-tab state — lazy load: only the active tab has data
  const [pending, setPending] = useState<TabState>(emptyTab());
  const [recovered, setRecovered] = useState<TabState>(emptyTab());
  const [noResponse, setNoResponse] = useState<TabState>(emptyTab());
  const [recoveredKpis, setRecoveredKpis] = useState<RecoveredKpis | null>(null);

  // Card recién contactada/reagendada: el bucket Pendientes es una cola de
  // trabajo, así que la card se va al fondo. El anillo temporal la vuelve
  // a hacer visible mientras siga dentro de las páginas cargadas.
  const [justMovedId, setJustMovedId] = useState<string | null>(null);
  const justMovedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markMoved = (id: string) => {
    if (justMovedTimer.current) clearTimeout(justMovedTimer.current);
    setJustMovedId(id);
    justMovedTimer.current = setTimeout(() => setJustMovedId(null), 5000);
  };
  useEffect(
    () => () => {
      if (justMovedTimer.current) clearTimeout(justMovedTimer.current);
    },
    []
  );

  // Initial doctors + rules
  useEffect(() => {
    const supabase = createClient();
    // We only need (id, full_name) for the doctor filter dropdown — avoid
    // pulling heavy fields like `bio` or `signature_url` that ship with `*`.
    supabase
      .from("doctors")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => setDoctors((data ?? []) as Doctor[]));
  }, []);

  // El catálogo de reglas es del Pack Fertilidad: una org core no tiene
  // ninguna, así que ni siquiera pedimos el endpoint.
  useEffect(() => {
    if (!hasStepTemplates) {
      setRules([]);
      return;
    }
    fetch("/api/admin/fertility/rules", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { rules: [] }))
      .then((j: { rules?: FollowupRuleLite[] }) => setRules(j.rules ?? []))
      .catch(() => setRules([]));
  }, [hasStepTemplates]);

  // Apply counts coming from any bucket response. Used by `fetchTab` so we
  // don't need a separate `bucket=counts` round-trip on mount or after
  // mutations — every list request already includes counts in its body.
  const applyCountsFromResponse = useCallback(
    (
      raw:
        | (Partial<FollowupCounts> & {
            overdue?: number;
            this_week?: number;
            upcoming?: number;
            total?: number;
          })
        | undefined,
    ) => {
      if (!raw) return;
      // Support both the new shape (pending/recovered/no_response) and
      // the legacy shape (overdue/this_week/upcoming/total).
      setCounts({
        pending:
          raw.pending ??
          ((raw.overdue ?? 0) + (raw.this_week ?? 0) + (raw.upcoming ?? 0)),
        recovered: raw.recovered ?? 0,
        no_response: raw.no_response ?? 0,
      });
    },
    [],
  );

  const fetchTab = useCallback(
    async (
      variant: FollowupVariant,
      filtersToUse: FollowupFilters,
      reset: boolean,
      /**
       * Tamaño de página solo para este fetch. Lo usa `refresh()` para
       * recargar de una sola vez todo lo que la asesora ya había traído
       * con "Cargar más" (si no, cada acción colapsaba la lista a 15).
       */
      limitOverride?: number
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
        const qs = buildQuery(
          filtersToUse,
          variant,
          offset,
          limitOverride ?? PAGE_SIZE,
          organizationId
        );
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
          counts?: Partial<FollowupCounts> & {
            overdue?: number;
            this_week?: number;
            upcoming?: number;
            total?: number;
          };
          data?: {
            overdue?: FollowupWithDetails[];
            this_week?: FollowupWithDetails[];
            upcoming?: FollowupWithDetails[];
          };
        };

        // The bucket endpoint always returns counts alongside items — use
        // them to update the tab badges so we never need a separate
        // `bucket=counts` round-trip on mount.
        applyCountsFromResponse(json.counts);

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
    [
      pending.items.length,
      recovered.items.length,
      noResponse.items.length,
      applyCountsFromResponse,
      organizationId,
    ]
  );

  // Fetch the default tab once the active org is known — pedirla antes
  // dejaría que la API eligiera la org por su cuenta.
  useEffect(() => {
    if (orgLoading) return;
    fetchTab("pending", filters, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgLoading, organizationId]);

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
    fetchTab(TAB_TO_VARIANT[tab], next, true);
    setFiltersOpen(false);
  };

  const refresh = () => {
    // No separate `bucket=counts` request — fetchTab returns fresh counts
    // alongside the listing in its response body.
    const variant = TAB_TO_VARIANT[tab];
    const loaded =
      variant === "pending"
        ? pending.items.length
        : variant === "recovered"
          ? recovered.items.length
          : noResponse.items.length;
    // Recargamos desde 0 pero pidiendo tantas filas como ya había en
    // pantalla: con el orden de cola de trabajo cada acción reubica una
    // card, y volver a PAGE_SIZE le borraría a la asesora todo lo que
    // había abierto con "Cargar más". El endpoint topa `limit` en 100.
    const keep = Math.min(100, Math.max(PAGE_SIZE, loaded));
    fetchTab(variant, filters, true, keep);
  };

  // Action handlers — call PATCH subroute endpoints (owned by Agente 2).
  const requestAction = async (
    path: string,
    method: "PATCH" | "POST",
    body: Record<string, unknown> | null,
    successMsg: string
  ): Promise<{ ok: boolean; payload: unknown }> => {
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const errMsg =
          (payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error: unknown }).error)
            : null) ?? `HTTP ${res.status}`;
        throw new Error(errMsg);
      }
      toast.success(successMsg);
      refresh();
      return { ok: true, payload };
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al actualizar el seguimiento"
      );
      return { ok: false, payload: null };
    }
  };

  const patchAction = async (
    path: string,
    body: Record<string, unknown> | null,
    successMsg: string
  ): Promise<boolean> => {
    const r = await requestAction(path, "PATCH", body, successMsg);
    return r.ok;
  };

  const onContact = async (id: string) => {
    const ok = await patchAction(
      `/api/clinical-followups/${id}/contact`,
      { type: "manual_contacted" },
      "Contactada — la movimos al final de tu cola"
    );
    if (ok) markMoved(id);
    return ok;
  };

  const onSnooze = async (id: string, days: number) => {
    const ok = await patchAction(
      `/api/clinical-followups/${id}/snooze`,
      { days },
      `Pospuesto ${days} días — vence en la nueva fecha`
    );
    if (ok) markMoved(id);
    return ok;
  };

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

  // Cascade advance — un solo endpoint POST cubre las 4 transiciones de
  // la cascada de 3 intentos del Pack Fertilidad. Si el endpoint cierra
  // automáticamente por overflow (intentaste posponer cuando ya no
  // quedan intentos), el response trae `auto_closed: true` y la UI lo
  // anuncia al obstetra.
  const onAdvance = async (id: string, action: AdvanceAction) => {
    const successMsg =
      action.kind === "agendado"
        ? "Marcado como agendado"
        : action.kind === "mark_contacted"
          ? "Contactada — la movimos al final de tu cola"
          : action.kind === "pospuesto"
            ? "Reagendado — la movimos al final de tu cola"
            : "Cerrado sin respuesta";
    const res = await requestAction(
      `/api/clinical-followups/${id}/advance`,
      "POST",
      action,
      successMsg
    );
    if (
      res.ok &&
      (action.kind === "mark_contacted" || action.kind === "pospuesto")
    ) {
      markMoved(id);
    }
    if (
      res.ok &&
      res.payload &&
      typeof res.payload === "object" &&
      "auto_closed" in res.payload &&
      (res.payload as { auto_closed?: boolean }).auto_closed
    ) {
      toast.info(
        "Cerrado automáticamente — alcanzó intento máximo",
        { duration: 5000 }
      );
    }
    return res.ok;
  };

  const activeTabState =
    tab === "pending" ? pending : tab === "recovered" ? recovered : noResponse;

  if (capabilitiesLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    /* Móvil: dvh (100vh en iOS incluye la barra de URL colapsable) y la
       resta calibrada al layout real de <md — topbar 4rem + el p-4 del
       main ×2 = 6rem. Desde md se conserva el valor anterior. */
    <div className="flex h-[calc(100dvh-6rem)] flex-col md:h-[calc(100vh-3.5rem)]">
      {/* Header */}
      {/* En móvil el `main` del layout ya aporta 16px por lado: con `px-6`
          aquí se acumulaban 40px (10% del viewport por lado). */}
      <div className="border-b border-border bg-card px-4 py-3 md:px-6 md:py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold">Seguimientos</h1>
            <p className="pr-2 text-[13px] text-muted-foreground md:pr-0 md:text-sm">
              {hasJourney
                ? "Pacientes pendientes de contactar para agendar próxima cita"
                : "Pacientes que esperan tu contacto para volver"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-accent md:h-auto md:py-2"
              aria-label="Recargar"
            >
              <RefreshCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Recargar</span>
            </button>
            {/* Chip del filtro de doctor: sin él, quien llega por el
                deep-link del dashboard ve una bandeja recortada sin
                pista de por qué. Con "Todos" volvemos al estado base. */}
            {filters.doctor_id !== "all" && (
              <span className="flex min-w-0 max-w-[45vw] items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary md:max-w-none">
                <span className="truncate">
                  {doctors.find((d) => d.id === filters.doctor_id)?.full_name ??
                    "Doctor"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    applyFilters({ ...filters, doctor_id: "all" })
                  }
                  className="rounded p-0.5 hover:bg-primary/20"
                  aria-label="Quitar filtro de doctor"
                >
                  <X className="h-3 w-3 shrink-0" />
                </button>
              </span>
            )}
            <Sheet
              open={filtersOpen}
              onOpenChange={(o) => {
                setFiltersOpen(o);
                if (o) setDraftFilters(filters);
              }}
            >
              <SheetTrigger asChild>
                <button className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-accent md:h-auto md:py-2">
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
                  showRuleFilter={hasStepTemplates}
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
      <div className="px-4 pt-3 md:px-6 md:pt-4">
        <Tabs
          value={tab}
          onValueChange={(v) =>
            setTab(v as "pending" | "recovered" | "no_response")
          }
        >
          {/* En móvil los 3 triggers reparten el ancho completo: el
              primitivo es `inline-flex` + `whitespace-nowrap`, así que sin
              esto el último tab quedaba cortado. */}
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="pending" className={TAB_TRIGGER_CLASS}>
              <span className="truncate">Pendientes</span>
              <CountBadge count={counts.pending} />
            </TabsTrigger>
            <TabsTrigger value="recovered" className={TAB_TRIGGER_CLASS}>
              <span className="truncate">Recuperados</span>
              <CountBadge count={counts.recovered} tone="success" />
            </TabsTrigger>
            <TabsTrigger value="no_response" className={TAB_TRIGGER_CLASS}>
              {/* Etiqueta corta solo en móvil: preferible a truncar. */}
              <span className="truncate md:hidden">Sin resp.</span>
              <span className="hidden truncate md:inline">Sin respuesta</span>
              <CountBadge count={counts.no_response} tone="amber" />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <PendingTabContent
              state={pending}
              hasJourney={hasJourney}
              onContact={onContact}
              onSnooze={onSnooze}
              onMarkNoResponse={onMarkNoResponse}
              onCloseManual={onCloseManual}
              onAdvance={onAdvance}
              onBudgetAssigned={refresh}
              onLoadMore={() => fetchTab("pending", filters, false)}
              justMovedId={justMovedId}
            />
          </TabsContent>

          <TabsContent value="recovered">
            <RecoveredTabContent
              state={recovered}
              kpis={recoveredKpis}
              hasRevenueKpis={hasRevenueKpis}
              onLoadMore={() => fetchTab("recovered", filters, false)}
            />
          </TabsContent>

          <TabsContent value="no_response">
            <NoResponseTabContent
              state={noResponse}
              onCloseManual={onCloseManual}
              onReactivate={onReactivate}
              onBudgetAssigned={refresh}
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
  hasJourney,
  onContact,
  onSnooze,
  onMarkNoResponse,
  onCloseManual,
  onAdvance,
  onBudgetAssigned,
  onLoadMore,
  justMovedId,
}: {
  state: TabState;
  hasJourney: boolean;
  onContact: (id: string) => Promise<unknown>;
  onSnooze: (id: string, days: number) => Promise<unknown>;
  onMarkNoResponse: (id: string) => Promise<unknown>;
  onCloseManual: (id: string, reason: string) => Promise<unknown>;
  onAdvance: (id: string, action: AdvanceAction) => Promise<unknown>;
  onBudgetAssigned: () => void;
  onLoadMore: () => void;
  justMovedId: string | null;
}) {
  if (!state.loaded) return null;
  if (state.items.length === 0) {
    return hasJourney ? (
      <EmptyState
        title="Sin seguimientos pendientes ahora mismo"
        description="Cuando complete una primera consulta de fertilidad, aparecerá un seguimiento automático aquí."
      />
    ) : (
      <EmptyState
        title="Aún no tienes seguimientos"
        description="Se crean solos cuando marcas “Requiere control” al completar una cita, o desde la historia clínica del paciente."
        action={
          <Link
            href="/admin/services"
            className="mt-3 inline-flex items-center rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
          >
            Configurar control por servicio
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-3 pb-12 md:space-y-2">
      {state.items.map((f) => (
        <FollowupCard
          key={f.id}
          followup={f}
          variant="pending"
          onContact={() => onContact(f.id)}
          onSnooze={(days) => onSnooze(f.id, days)}
          onMarkNoResponse={() => onMarkNoResponse(f.id)}
          onCloseManual={(reason) => onCloseManual(f.id, reason)}
          onAdvance={(action) => onAdvance(f.id, action)}
          onBudgetAssigned={onBudgetAssigned}
          justMoved={f.id === justMovedId}
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
  hasRevenueKpis,
  onLoadMore,
}: {
  state: TabState;
  kpis: RecoveredKpis | null;
  hasRevenueKpis: boolean;
  onLoadMore: () => void;
}) {
  if (!state.loaded) return null;

  return (
    <div className="space-y-4 pb-12">
      {kpis && (
        <RecoveredKpiHeader kpis={kpis} showRevenue={hasRevenueKpis} />
      )}

      {state.items.length === 0 ? (
        <EmptyState
          title="Aún no hay recuperaciones"
          description="No se registraron recuperaciones en los últimos 30 días."
        />
      ) : (
        <div className="space-y-3 md:space-y-2">
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
  onBudgetAssigned,
  onLoadMore,
}: {
  state: TabState;
  onCloseManual: (id: string, reason: string) => Promise<unknown>;
  onReactivate: (id: string) => Promise<unknown>;
  onBudgetAssigned: () => void;
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
    <div className="space-y-3 pb-12 md:space-y-2">
      {state.items.map((f) => (
        <FollowupCard
          key={f.id}
          followup={f}
          variant="no_response"
          onReactivate={() => onReactivate(f.id)}
          onCloseManual={(reason) => onCloseManual(f.id, reason)}
          onBudgetAssigned={onBudgetAssigned}
        />
      ))}
      {state.hasMore && (
        <LoadMoreButton onClick={onLoadMore} loading={state.loading} />
      )}
    </div>
  );
}

/**
 * El ingreso atribuido (LTV × recuperaciones) es de las pocas cosas que
 * hacen defendible el precio del addon: para una org core mostramos los
 * conteos, no los soles.
 */
function RecoveredKpiHeader({
  kpis,
  showRevenue,
}: {
  kpis: RecoveredKpis;
  showRevenue: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 md:gap-3",
        showRevenue ? "lg:grid-cols-4" : "lg:grid-cols-3"
      )}
    >
      <KpiCard
        icon={<Sparkles className="h-4 w-4" />}
        label="Recuperaciones atribuibles"
        value={String(kpis.recovered_attributable)}
        helper="últimos 30 días"
        tone="success"
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
        tone="success"
      />
      {showRevenue && (
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Revenue estimado atribuido"
          value={`S/ ${kpis.revenue_attributed.toLocaleString("es-PE")}`}
          helper="basado en LTV"
          tone="violet"
        />
      )}
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
  tone: "success" | "violet" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "border-success-500/20 bg-success-500/5 text-success-600"
      : tone === "violet"
        ? "border-violet-500/20 bg-violet-500/5 text-violet-600"
        : "border-border bg-card text-foreground";

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="flex items-start gap-2 text-xs font-medium uppercase tracking-wider opacity-80 md:items-center">
        <span className="mt-0.5 shrink-0 md:mt-0">{icon}</span>
        <span className="min-w-0">{label}</span>
      </div>
      <div className="mt-2 text-xl font-bold md:text-2xl">{value}</div>
      <div className="text-[11px] opacity-70">{helper}</div>
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
      <CalendarCheck className="mb-2 h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      {action}
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
        className="flex h-11 w-full max-w-xs items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm hover:bg-accent disabled:opacity-50 md:h-auto md:w-auto md:py-2"
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
  tone?: "primary" | "success" | "amber";
}) {
  if (count === 0) return null;
  const cls =
    tone === "success"
      ? "bg-success-500/15 text-success-600"
      : tone === "amber"
        ? "bg-amber-500/15 text-amber-600"
        : "bg-primary/15 text-primary";
  return (
    <span
      className={cn(
        "ml-1 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold md:ml-1.5 md:h-5 md:min-w-5 md:px-1.5 md:text-[11px]",
        cls
      )}
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
  showRuleFilter,
}: {
  filters: FollowupFilters;
  setFilters: (f: FollowupFilters) => void;
  doctors: Doctor[];
  rules: FollowupRuleLite[];
  /** El filtro por regla solo tiene sentido con el motor de reglas del addon. */
  showRuleFilter: boolean;
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

      {showRuleFilter && (
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
      )}

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
  limit = PAGE_SIZE,
  organizationId: string | null = null
): string {
  const params = new URLSearchParams();
  params.set("bucket", bucket);
  if (organizationId) params.set("org_id", organizationId);
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

