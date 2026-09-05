"use client";

/**
 * /tratamientos — bandeja del módulo Tratamientos (Pack Fertilidad).
 *
 * Regla de dinero (CLAUDE.md): cada monto de esta pantalla viene tal cual
 * de la API (`kpis` del RPC get_treatments_overview y `item.money` de la
 * fórmula única de lib/treatments/money.ts). Aquí no se suma nada y todo se
 * rotula "Cobrado" / "Por cobrar" — nunca "Ingresos" ni "ganancia".
 *
 * Un doctor ve solo sus tratamientos (lo filtra la API por doctor_scope_id);
 * recepción ve todo pero sin honorarios (`sees_fees` = false).
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, startOfMonth, subDays } from "date-fns";
import { toast } from "sonner";
import {
  Baby,
  Clock,
  Coins,
  Loader2,
  RefreshCcw,
  Search,
  Stethoscope,
  Wallet,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NumberPopIn } from "@/components/ui/number-pop-in";
import { FertilityAddonGate } from "@/components/addons/fertility-addon-gate";
import { TreatmentCard } from "@/components/treatments/treatment-card";
import { TreatmentPaymentDialog } from "@/components/treatments/treatment-payment-dialog";
import { useOrganization } from "@/components/organization-provider";
import { useOrgToday } from "@/hooks/use-org-today";
import { cn, formatCurrency } from "@/lib/utils";
import type { TreatmentMoney } from "@/lib/treatments/money";
import type {
  TreatmentDetailResponse,
  TreatmentListItem,
  TreatmentPaymentConcept,
  TreatmentsOverview,
} from "@/types/treatments";

type TreatmentTab = "in_progress" | "closed";
type PeriodKey = "month" | "7d" | "today" | "range";

interface ListResponse {
  items: TreatmentListItem[];
  kpis: TreatmentsOverview;
}

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "month", label: "Mes actual" },
  { key: "7d", label: "7 días" },
  { key: "today", label: "Hoy" },
  { key: "range", label: "Rango" },
];

/** Datos que el diálogo de pago necesita y que la lista no trae (conceptos). */
interface PaymentTarget {
  item: TreatmentListItem;
  concepts: TreatmentPaymentConcept[];
  money: TreatmentMoney;
}

export default function TreatmentsPage() {
  return (
    <FertilityAddonGate
      loadingFallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
      fallback={
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Baby className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-base font-semibold">Requiere Pack Fertilidad</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Activa el addon Pack Fertilidad para llevar los tratamientos de
            reproducción asistida.
          </p>
        </div>
      }
    >
      <TreatmentsInbox />
    </FertilityAddonGate>
  );
}

function TreatmentsInbox() {
  // org_id explícito: sin él la API resuelve la primera membresía y un
  // usuario multi-clínica vería la bandeja de otra org.
  const { organizationId, loading: orgLoading } = useOrganization();
  const { today: orgToday } = useOrgToday();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TreatmentTab>("in_progress");
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null);
  const [loadingPaymentFor, setLoadingPaymentFor] = useState<string | null>(null);

  // El buscador no dispara un fetch por tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const today = orgToday();

  // Los KPIs son del período; el listado no cambia de tamaño con él.
  const { from, to } = useMemo(() => {
    if (period === "range") {
      return { from: customFrom || null, to: customTo || null };
    }
    const todayDate = parseISO(today);
    const start =
      period === "month"
        ? startOfMonth(todayDate)
        : period === "7d"
          ? subDays(todayDate, 6)
          : todayDate;
    return { from: format(start, "yyyy-MM-dd"), to: today };
  }, [period, customFrom, customTo, today]);

  const { data, isPending, isFetching } = useQuery({
    queryKey: [
      "treatments",
      "list",
      organizationId,
      tab,
      debouncedSearch,
      from,
      to,
    ],
    enabled: !!organizationId,
    queryFn: async (): Promise<ListResponse | null> => {
      const sp = new URLSearchParams();
      sp.set("org_id", organizationId as string);
      sp.set("status", tab);
      if (debouncedSearch) sp.set("q", debouncedSearch);
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      const res = await fetch(`/api/treatments?${sp.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 403) return null; // org sin addon: lo cuenta el gate
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? "No se pudieron cargar los tratamientos");
        return null;
      }
      return (await res.json()) as ListResponse;
    },
  });

  const items = data?.items ?? [];
  const kpis = data?.kpis;
  const loading = orgLoading || isPending;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["treatments"] });

  // El diálogo necesita el catálogo de conceptos, que el listado no trae:
  // se pide el detalle al hacer clic (un request, solo cuando hace falta).
  const openPayment = async (item: TreatmentListItem) => {
    setLoadingPaymentFor(item.id);
    try {
      const res = await fetch(`/api/treatments/${item.id}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? "No se pudo abrir el registro de pago");
        return;
      }
      const detail = (await res.json()) as TreatmentDetailResponse;
      setPaymentTarget({
        item,
        concepts: detail.concepts,
        money: detail.money,
      });
    } catch {
      toast.error("No se pudo abrir el registro de pago");
    } finally {
      setLoadingPaymentFor(null);
    }
  };

  const seesFees = kpis?.sees_fees ?? false;
  const showHonorariumSplit =
    kpis != null && kpis.honorarium_collected !== null;

  return (
    /* Full-bleed en ambos ejes, igual que Seguimientos: el marco flotante
       restaba ~32px de ancho útil a 390px. */
    <div className="-mx-4 -mt-4 flex flex-col md:-mx-7 md:-mb-7 md:-mt-7">
      <div className="border-b border-border bg-background px-4 py-3 md:px-6 md:py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">Tratamientos</h1>
            <p className="pr-2 text-[13px] text-muted-foreground md:pr-0 md:text-sm">
              Tratamientos de reproducción asistida en curso y cerrados
            </p>
          </div>
          <button
            onClick={refresh}
            className="flex h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-accent md:h-auto md:py-2"
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Actualizar
          </button>
        </div>

        {/* Selector de período — alimenta from/to de los KPIs. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cn(
                "h-11 rounded-lg border px-3 text-xs font-medium md:h-auto md:py-1.5",
                period === p.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-accent",
              )}
            >
              {p.label}
            </button>
          ))}
          {period === "range" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-11 rounded-lg border border-input bg-background px-2 text-xs md:h-auto md:py-1.5"
              />
              <span className="text-xs text-muted-foreground">a</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-11 rounded-lg border border-input bg-background px-2 text-xs md:h-auto md:py-1.5"
              />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 md:px-6">
        {/* KPIs del período */}
        <div
          className={cn(
            "grid grid-cols-2 gap-3",
            seesFees ? "lg:grid-cols-4" : "lg:grid-cols-3",
          )}
        >
          <KpiCard
            icon={<Coins className="h-4 w-4 text-emerald-500" />}
            label="Cobrado en tratamientos"
            value={kpis ? formatCurrency(kpis.collected_total) : "—"}
            subtitle={
              showHonorariumSplit && kpis
                ? // Los dos desgloses vienen del RPC; no se restan entre sí
                  // (no hay un "general_collected" en el overview y la regla
                  // prohíbe recomponer montos en cliente).
                  `Honorarios ${formatCurrency(kpis.honorarium_collected ?? 0)} · Terceros ${formatCurrency(kpis.third_party_collected ?? 0)}`
                : undefined
            }
            note="Incluido en Ingresos del dashboard"
          />
          {seesFees && (
            <KpiCard
              icon={<Stethoscope className="h-4 w-4 text-violet-500" />}
              label="Honorarios cobrados"
              value={
                kpis?.honorarium_collected !== null &&
                kpis?.honorarium_collected !== undefined
                  ? formatCurrency(kpis.honorarium_collected)
                  : "—"
              }
            />
          )}
          <KpiCard
            icon={<Wallet className="h-4 w-4 text-amber-500" />}
            label="Por cobrar (en curso)"
            value={kpis ? formatCurrency(kpis.pending_in_progress) : "—"}
            subtitle={
              kpis
                ? `${kpis.in_progress_count} tratamiento${kpis.in_progress_count === 1 ? "" : "s"}`
                : undefined
            }
          />
          <KpiCard
            icon={<Clock className="h-4 w-4 text-blue-500" />}
            label="En curso"
            value={kpis ? String(kpis.in_progress_count) : "—"}
            subtitle={
              kpis
                ? `+${kpis.started_in_period} iniciados · ${kpis.closed_in_period} cerrados en el período`
                : undefined
            }
          />
        </div>

        {/* Buscador por paciente */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por paciente…"
            className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TreatmentTab)}>
          <TabsList className="w-full md:w-auto">
            <TabsTrigger
              value="in_progress"
              className="min-w-0 flex-1 gap-1 px-1.5 text-xs md:flex-none md:gap-2 md:px-3 md:text-sm"
            >
              <span className="truncate">En curso</span>
              <CountBadge count={kpis?.in_progress_count ?? 0} />
            </TabsTrigger>
            <TabsTrigger
              value="closed"
              className="min-w-0 flex-1 gap-1 px-1.5 text-xs md:flex-none md:gap-2 md:px-3 md:text-sm"
            >
              <span className="truncate">Cerrados</span>
              <CountBadge count={kpis?.closed_in_period ?? 0} tone="muted" />
            </TabsTrigger>
          </TabsList>

          {(["in_progress", "closed"] as const).map((value) => (
            <TabsContent key={value} value={value}>
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <EmptyState tab={value} searching={debouncedSearch !== ""} />
              ) : (
                <div className="space-y-3 pb-10 md:space-y-2">
                  {items.map((item) => (
                    <TreatmentCard
                      key={item.id}
                      item={item}
                      today={today}
                      onAddPayment={
                        item.status === "in_progress"
                          ? openPayment
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}
              {loadingPaymentFor && (
                <p className="pb-6 text-center text-xs text-muted-foreground">
                  Abriendo registro de pago…
                </p>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {paymentTarget && (
        <TreatmentPaymentDialog
          open
          onOpenChange={(o) => {
            if (!o) setPaymentTarget(null);
          }}
          treatmentId={paymentTarget.item.id}
          treatmentTitle={paymentTarget.item.title}
          patientName={paymentTarget.item.patient_name}
          concepts={paymentTarget.concepts}
          money={paymentTarget.money}
          onSaved={() => {
            // El `money` del padre lo repone el refetch de la lista: los KPIs
            // del período también cambian con el cobro.
            refresh();
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  subtitle,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-2 text-xs font-medium text-muted-foreground md:items-center">
        <span className="mt-0.5 shrink-0 md:mt-0">{icon}</span>
        <span className="min-w-0">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold md:text-2xl">
        {/* key: al cambiar de período la cifra se re-anima. */}
        <NumberPopIn key={value} value={value} />
      </p>
      {subtitle && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
      )}
      {note && (
        <p className="mt-0.5 text-[10px] text-muted-foreground/70">{note}</p>
      )}
    </div>
  );
}

function CountBadge({
  count,
  tone = "primary",
}: {
  count: number;
  tone?: "primary" | "muted";
}) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "ml-1 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold md:ml-1.5 md:h-5 md:min-w-5 md:px-1.5 md:text-[11px]",
        tone === "primary"
          ? "bg-primary/15 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function EmptyState({
  tab,
  searching,
}: {
  tab: TreatmentTab;
  searching: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
      <Baby className="mb-2 h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium">
        {searching
          ? "Ninguna paciente coincide con la búsqueda"
          : tab === "in_progress"
            ? "No hay tratamientos en curso"
            : "Aún no hay tratamientos cerrados"}
      </p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        {searching
          ? "Prueba con otro nombre o limpia el buscador."
          : tab === "in_progress"
            ? "Un tratamiento nace al iniciar un presupuesto aceptado, desde Fertilidad → Presupuestos."
            : "Los tratamientos aparecen aquí cuando se cierran con su resultado."}
      </p>
    </div>
  );
}
