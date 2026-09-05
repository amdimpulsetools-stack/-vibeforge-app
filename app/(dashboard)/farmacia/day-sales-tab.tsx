"use client";

/**
 * Ventas: historial por fecha del hecho (sale_date, mig 232) + cierre
 * del día.
 *
 * El rango se filtra en el SERVIDOR (page.tsx consulta por sale_date);
 * aquí solo se agrupa, se busca y se anula. La barra de cierre sale de
 * `pharmacy_day_summary`, que agrega en base — incluido el desglose por
 * medio de pago, que vive en patient_payments y el listado no trae.
 *
 * El botón Anular llama a `pharmacy_void_sale`, que revierte stock Y
 * dinero en una sola transacción — o no revierte nada. Si no hay caja
 * abierta, el RPC lo rechaza con un mensaje que la cajera entiende; esta
 * pantalla se limita a mostrarlo. Deshacer media venta (el stock sí, el
 * dinero no) sería peor que no deshacerla.
 *
 * La devolución de una venta de un día pasado entra al turno de caja de
 * HOY (el dinero sale del cajón de hoy, no del arqueo ya cerrado); el
 * diálogo de anulación lo avisa antes de confirmar.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { exportToCSV } from "@/lib/export";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  Download,
  Loader2,
  Printer,
  Search,
} from "lucide-react";
import {
  fmtDayHeading,
  fmtQty,
  fmtTime,
  formatPEN,
  limaDateOf,
  limaToday,
  saleLabel,
  type DaySummary,
  type PharmacySale,
  type PharmacySaleItem,
} from "./types";

interface Props {
  sales: PharmacySale[];
  itemsBySale: Record<string, PharmacySaleItem[]>;
  patientNames: Record<string, string>;
  /** sale.id → etiqueta del método de pago ("Yape", "Efectivo"…). */
  paymentMethodBySale?: Record<string, string>;
  loading: boolean;
  range: { from: string; to: string };
  onRange: (range: { from: string; to: string }) => void;
  isOrgAdmin: boolean;
  organizationId: string | null;
  onVoided: () => void;
}

type Preset = "hoy" | "ayer" | "semana" | "mes" | "rango";

/** Suma días a un 'YYYY-MM-DD' sin pasar por el huso del navegador. */
function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const inputCls =
  "h-9 rounded-lg border border-border bg-card px-2.5 text-xs outline-none focus:border-primary/50";

export function DaySalesTab({
  sales,
  itemsBySale,
  patientNames,
  paymentMethodBySale = {},
  loading,
  range,
  onRange,
  isOrgAdmin,
  organizationId,
  onVoided,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>("hoy");
  const [query, setQuery] = useState("");

  // ── Anulación (diálogo, ya no window.prompt) ───────────────────────────
  const [voidTarget, setVoidTarget] = useState<PharmacySale | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  // ── Cierre del día (RPC agregada en base) ──────────────────────────────
  const [summary, setSummary] = useState<DaySummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Para el portal de impresión: document no existe en SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const today = limaToday();
  const singleDay = range.from === range.to;

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "hoy") onRange({ from: today, to: today });
    else if (p === "ayer") {
      const ayer = shiftIso(today, -1);
      onRange({ from: ayer, to: ayer });
    } else if (p === "semana") onRange({ from: shiftIso(today, -6), to: today });
    else if (p === "mes") onRange({ from: `${today.slice(0, 8)}01`, to: today });
    // "rango" no toca las fechas: deja las actuales para editarlas a mano.
  }

  // Se recarga con el rango y tras cada venta/anulación (sales cambia).
  // La org viaja explícita: un usuario en varias clínicas vería aquí la
  // mezcla de todas mientras la lista filtra por la activa.
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    const supabase = createClient();
    setSummaryLoading(true);
    void supabase
      .rpc("pharmacy_day_summary", {
        p_organization_id: organizationId,
        p_from: range.from,
        p_to: range.to,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        setSummaryLoading(false);
        if (error) return; // la barra simplemente no se muestra
        setSummary(((data ?? []) as unknown) as DaySummary[]);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, sales]);

  /** Agregado del rango completo (con un solo día es ese día). */
  const rangeTotals = useMemo(() => {
    return summary.reduce(
      (acc, d) => {
        acc.total += Number(d.total ?? 0);
        acc.efectivo += Number(d.by_tender?.efectivo ?? 0);
        acc.electronico += Number(d.by_tender?.electronico ?? 0);
        acc.otro += Number(d.by_tender?.otro ?? 0);
        acc.salesCount += Number(d.sales_count ?? 0);
        acc.itemsCount += Number(d.items_count ?? 0);
        acc.voidedCount += Number(d.voided_count ?? 0);
        return acc;
      },
      {
        total: 0,
        efectivo: 0,
        electronico: 0,
        otro: 0,
        salesCount: 0,
        itemsCount: 0,
        voidedCount: 0,
      }
    );
  }, [summary]);

  // ── Búsqueda en cliente: NV- y nombre ──────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter((s) => {
      const label = saleLabel(s.sale_number).toLowerCase();
      const customer = (
        (s.patient_id ? patientNames[s.patient_id] : null) ??
        s.customer_label ??
        "Público general"
      ).toLowerCase();
      return label.includes(q) || customer.includes(q);
    });
  }, [sales, query, patientNames]);

  /** Grupos por día, en el orden del servidor (sale_date desc). */
  const byDay = useMemo(() => {
    const groups: { day: string; rows: PharmacySale[] }[] = [];
    for (const s of filtered) {
      const last = groups[groups.length - 1];
      if (last && last.day === s.sale_date) last.rows.push(s);
      else groups.push({ day: s.sale_date, rows: [s] });
    }
    return groups;
  }, [filtered]);

  function dayStats(rows: PharmacySale[]) {
    let total = 0;
    let items = 0;
    let count = 0;
    for (const s of rows) {
      if (s.status === "anulada") continue;
      count += 1;
      total += Number(s.total ?? 0);
      for (const it of itemsBySale[s.id] ?? []) items += Number(it.quantity);
    }
    return { total, items, count };
  }

  function customerOf(sale: PharmacySale): string {
    return (
      (sale.patient_id ? patientNames[sale.patient_id] : null) ??
      sale.customer_label?.trim() ??
      "Público general"
    );
  }

  function exportCsv() {
    exportToCSV(
      ["Fecha", "Nota", "Hora registro", "Cliente", "Estado", "Subtotal S/", "IGV S/", "Total S/", "Motivo anulación"],
      filtered.map((s) => [
        s.sale_date,
        saleLabel(s.sale_number),
        fmtTime(s.confirmed_at),
        customerOf(s),
        s.status,
        Number(s.subtotal_taxed) + Number(s.subtotal_exempt) + Number(s.subtotal_unaffected),
        Number(s.igv_amount),
        Number(s.total),
        s.void_reason ?? "",
      ]),
      `farmacia-ventas-${range.from}-a-${range.to}.csv`
    );
  }

  async function confirmVoid() {
    const sale = voidTarget;
    if (!sale || voiding) return;
    const reason = voidReason.trim();
    if (!reason) {
      toast.error("La anulación necesita un motivo.");
      return;
    }

    setVoiding(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("pharmacy_void_sale", {
      p_sale_id: sale.id,
      p_reason: reason,
    });
    setVoiding(false);

    if (error) {
      toast.error("No se pudo anular", { description: error.message });
      return;
    }
    setVoidTarget(null);
    setVoidReason("");
    toast.success(`${saleLabel(sale.sale_number)} anulada`, {
      description: "Stock devuelto y devolución registrada en caja.",
    });
    onVoided();
  }

  if (loading) {
    return (
      <div className="grid h-40 place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1">
        {(
          [
            ["hoy", "Hoy"],
            ["ayer", "Ayer"],
            ["semana", "Semana"],
            ["mes", "Mes"],
            ["rango", "Rango"],
          ] as [Preset, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={preset === key}
            onClick={() => applyPreset(key)}
            className={cn(
              "h-9 rounded-lg border px-3 text-xs font-semibold transition-colors",
              preset === key
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {preset === "rango" && (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={range.from}
            max={range.to}
            onChange={(e) => e.target.value && onRange({ ...range, from: e.target.value })}
            className="h-9 w-[140px]"
          />
          <span className="text-xs text-muted-foreground">a</span>
          <Input
            type="date"
            value={range.to}
            min={range.from}
            onChange={(e) => e.target.value && onRange({ ...range, to: e.target.value })}
            className="h-9 w-[140px]"
          />
        </div>
      )}

      <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="NV- o cliente"
          className={cn(inputCls, "h-9 w-full pl-8")}
        />
      </div>

      <button
        type="button"
        onClick={exportCsv}
        disabled={filtered.length === 0}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
      >
        <Download className="h-3.5 w-3.5" /> CSV
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Printer className="h-3.5 w-3.5" /> Imprimir
      </button>
    </div>
  );

  // ── Barra de cierre (P2) ─────────────────────────────────────────────
  const closeBar = (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Chip label={singleDay ? "Total del día" : "Total del rango"} strong>
          {summaryLoading ? "…" : formatPEN(rangeTotals.total)}
        </Chip>
        <Chip label="Efectivo">{summaryLoading ? "…" : formatPEN(rangeTotals.efectivo)}</Chip>
        <Chip label="Electrónico">{summaryLoading ? "…" : formatPEN(rangeTotals.electronico)}</Chip>
        {rangeTotals.otro > 0 && (
          <Chip label="Otro">{formatPEN(rangeTotals.otro)}</Chip>
        )}
        <Chip label="Ventas">
          {summaryLoading ? "…" : rangeTotals.salesCount}
          {rangeTotals.voidedCount > 0 && (
            <span className="ml-1 text-[11px] font-normal text-muted-foreground">
              (+{rangeTotals.voidedCount} anul.)
            </span>
          )}
        </Chip>
        <Chip label="Ítems">{summaryLoading ? "…" : fmtQty(rangeTotals.itemsCount)}</Chip>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Esto no es el arqueo de caja — el conteo del cajón se cierra en{" "}
        <Link href="/caja" className="font-medium text-primary underline underline-offset-2">
          Caja
        </Link>
        .
      </p>
    </div>
  );

  return (
    <div className="space-y-3">
      {filterBar}
      {closeBar}

      {filtered.length === 0 ? (
        <div className="grid h-40 place-items-center rounded-xl border border-dashed border-border">
          <p className="text-sm text-muted-foreground">
            {sales.length === 0
              ? singleDay && range.from === today
                ? "Todavía no hay ventas hoy."
                : "No hay ventas en este rango."
              : "Ninguna venta coincide con la búsqueda."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {byDay.map(({ day, rows }) => {
            const stats = dayStats(rows);
            return (
              <div key={day}>
                {/* Con un solo día la barra de cierre ya lo dice todo. */}
                {!singleDay && (
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 px-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {fmtDayHeading(day)}
                      <span className="ml-2 font-normal normal-case tracking-normal">
                        {stats.count} {stats.count === 1 ? "venta" : "ventas"} ·{" "}
                        {fmtQty(stats.items)} ítems
                      </span>
                    </span>
                    <span className="text-sm font-bold tabular-nums text-primary">
                      {formatPEN(stats.total)}
                    </span>
                  </div>
                )}

                <ul className="space-y-1.5">
                  {rows.map((sale) => {
                    const items = itemsBySale[sale.id] ?? [];
                    const isOpen = expanded === sale.id;
                    const anulada = sale.status === "anulada";
                    const customer = customerOf(sale);
                    const confirmedDay = limaDateOf(sale.confirmed_at);
                    const backdated =
                      confirmedDay !== null && confirmedDay !== sale.sale_date;
                    // E1: la RPC solo deja anular otro día (de registro)
                    // a un admin — el botón lo refleja en vez de dejar
                    // que el error llegue desde el servidor.
                    const voidableToday = confirmedDay === today;

                    return (
                      <li
                        key={sale.id}
                        className={cn(
                          "rounded-xl border border-border bg-card",
                          anulada && "opacity-60"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : sale.id)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                        >
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                              isOpen && "rotate-180"
                            )}
                          />
                          <span className="w-24 shrink-0 text-sm font-bold tabular-nums">
                            {saleLabel(sale.sale_number)}
                          </span>
                          <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {fmtTime(sale.confirmed_at)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">{customer}</span>
                          {paymentMethodBySale[sale.id] && (
                            <span
                              className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground md:inline"
                              title="Método de pago"
                            >
                              {paymentMethodBySale[sale.id]}
                            </span>
                          )}
                          {backdated && (
                            <span
                              className="hidden shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 sm:inline"
                              title="Venta retroactiva: la fecha del hecho no coincide con el día en que se registró."
                            >
                              registrada el {fmtDayHeading(confirmedDay)}
                            </span>
                          )}
                          {anulada && (
                            <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
                              Anulada
                            </span>
                          )}
                          <span
                            className={cn(
                              "shrink-0 text-sm font-bold tabular-nums",
                              anulada && "line-through"
                            )}
                          >
                            {formatPEN(sale.total)}
                          </span>
                        </button>

                        {isOpen && (
                          <div className="border-t border-border px-3 py-2.5">
                            <ul className="space-y-1">
                              {items.map((it) => (
                                <li
                                  key={it.id}
                                  className="flex items-baseline justify-between gap-3 text-xs"
                                >
                                  <span className="min-w-0 truncate text-muted-foreground">
                                    {fmtQty(it.quantity)} × {it.description}
                                    {Number(it.line_discount) > 0
                                      ? ` (− ${formatPEN(it.line_discount)})`
                                      : ""}
                                  </span>
                                  <span className="shrink-0 tabular-nums">
                                    {formatPEN(it.line_total)}
                                  </span>
                                </li>
                              ))}
                            </ul>

                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
                              <span>
                                Subtotal {formatPEN(sale.subtotal_taxed + sale.subtotal_exempt + sale.subtotal_unaffected)}
                                {" · "}IGV {formatPEN(sale.igv_amount)}
                                {paymentMethodBySale[sale.id] && (
                                  <>
                                    {" · "}Pago:{" "}
                                    <span className="font-medium text-foreground">
                                      {paymentMethodBySale[sale.id]}
                                    </span>
                                  </>
                                )}
                              </span>

                              {anulada ? (
                                <span className="italic">
                                  {sale.void_reason ? `Motivo: ${sale.void_reason}` : "Anulada"}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!voidableToday && !isOrgAdmin}
                                  title={
                                    !voidableToday && !isOrgAdmin
                                      ? "Solo un administrador puede anular una venta de un día anterior."
                                      : undefined
                                  }
                                  onClick={() => {
                                    setVoidReason("");
                                    setVoidTarget(sale);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
                                >
                                  <Ban className="h-3 w-3" />
                                  Anular
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Diálogo de anulación (E2) ─────────────────────────────────── */}
      <Dialog
        open={voidTarget !== null}
        onOpenChange={(o) => {
          if (!o && !voiding) setVoidTarget(null);
        }}
      >
        <DialogContent aria-describedby={undefined} className="gap-0 p-5 sm:max-w-md sm:rounded-2xl">
          {voidTarget && (
            <>
              <DialogTitle className="text-base font-bold">
                Anular {saleLabel(voidTarget.sale_number)}
              </DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Devuelve el stock al kardex y registra la devolución del dinero.
              </p>

              <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">{customerOf(voidTarget)}</span>
                  <span className="shrink-0 font-bold tabular-nums">
                    {formatPEN(voidTarget.total)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Venta del {fmtDayHeading(voidTarget.sale_date)}
                </p>
              </div>

              {voidTarget.sale_date !== today && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Esta venta es de un día pasado: la devolución se registrará
                    en el turno de caja de <strong>HOY</strong>.
                  </span>
                </div>
              )}

              <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Motivo (obligatorio)
              </label>
              <Textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Ej.: el cliente devolvió el producto"
                rows={3}
                autoFocus
                className="mt-1"
              />

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={voiding}
                  onClick={() => setVoidTarget(null)}
                  className="h-11 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-accent disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={voiding || !voidReason.trim()}
                  onClick={() => void confirmVoid()}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-red-600 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-40"
                >
                  {voiding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Ban className="h-4 w-4" />
                  )}
                  Anular venta
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Versión imprimible ────────────────────────────────────────────
          El contenedor de la página lleva print:hidden, así que el bloque
          se portalea a <body> y usa la técnica de visibility del ticket. */}
      {mounted &&
        createPortal(
          <PrintReport
            range={range}
            byDay={byDay}
            summary={summary}
            totals={rangeTotals}
            customerOf={customerOf}
            dayStats={dayStats}
            paymentMethodBySale={paymentMethodBySale}
          />,
          document.body
        )}
    </div>
  );
}

function Chip({
  label,
  strong,
  children,
}: {
  label: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-bold tabular-nums",
          strong && "text-lg text-primary"
        )}
      >
        {children}
      </p>
    </div>
  );
}

interface PrintProps {
  range: { from: string; to: string };
  byDay: { day: string; rows: PharmacySale[] }[];
  summary: DaySummary[];
  totals: {
    total: number;
    efectivo: number;
    electronico: number;
    otro: number;
    salesCount: number;
    itemsCount: number;
    voidedCount: number;
  };
  customerOf: (sale: PharmacySale) => string;
  dayStats: (rows: PharmacySale[]) => { total: number; items: number; count: number };
  paymentMethodBySale: Record<string, string>;
}

/** Reporte del cierre para imprimir: mismo patrón visibility del ticket. */
function PrintReport({ range, byDay, totals, customerOf, dayStats, paymentMethodBySale }: PrintProps) {
  const singleDay = range.from === range.to;
  return (
    <>
      <style>{`
        @media print {
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .pharmacy-sales-print, .pharmacy-sales-print * { visibility: visible !important; }
          .pharmacy-sales-print {
            position: absolute !important;
            left: 0; top: 0;
            width: 100%;
            padding: 10mm;
            color: #000 !important;
            background: #fff !important;
          }
        }
      `}</style>

      <div className="pharmacy-sales-print hidden print:block" aria-hidden="true">
        <h1 style={{ fontSize: "16px", fontWeight: 700 }}>
          Farmacia — Cierre de ventas
        </h1>
        <p style={{ fontSize: "11px", marginTop: "1mm" }}>
          {singleDay ? fmtDayHeading(range.from) : `Del ${range.from} al ${range.to}`}
        </p>

        <table style={{ marginTop: "4mm", fontSize: "11px", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ paddingRight: "8mm", fontWeight: 700 }}>Total</td>
              <td style={{ paddingRight: "8mm" }}>Efectivo</td>
              <td style={{ paddingRight: "8mm" }}>Electrónico</td>
              {totals.otro > 0 && <td style={{ paddingRight: "8mm" }}>Otro</td>}
              <td style={{ paddingRight: "8mm" }}>Ventas</td>
              <td>Ítems</td>
            </tr>
            <tr style={{ fontWeight: 700, fontSize: "13px" }}>
              <td style={{ paddingRight: "8mm" }}>{formatPEN(totals.total)}</td>
              <td style={{ paddingRight: "8mm" }}>{formatPEN(totals.efectivo)}</td>
              <td style={{ paddingRight: "8mm" }}>{formatPEN(totals.electronico)}</td>
              {totals.otro > 0 && (
                <td style={{ paddingRight: "8mm" }}>{formatPEN(totals.otro)}</td>
              )}
              <td style={{ paddingRight: "8mm" }}>{totals.salesCount}</td>
              <td>{fmtQty(totals.itemsCount)}</td>
            </tr>
          </tbody>
        </table>

        {byDay.map(({ day, rows }) => {
          const stats = dayStats(rows);
          return (
            <div key={day} style={{ marginTop: "5mm" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderBottom: "1px solid #000",
                  paddingBottom: "1mm",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                <span>
                  {fmtDayHeading(day)} · {stats.count}{" "}
                  {stats.count === 1 ? "venta" : "ventas"} · {fmtQty(stats.items)} ítems
                </span>
                <span>{formatPEN(stats.total)}</span>
              </div>
              <table style={{ width: "100%", fontSize: "10px", borderCollapse: "collapse", marginTop: "1mm" }}>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td style={{ padding: "0.5mm 0", whiteSpace: "nowrap" }}>
                        {saleLabel(s.sale_number)}
                      </td>
                      <td style={{ padding: "0.5mm 2mm" }}>{fmtTime(s.confirmed_at)}</td>
                      <td style={{ padding: "0.5mm 2mm" }}>{customerOf(s)}</td>
                      <td style={{ padding: "0.5mm 2mm", whiteSpace: "nowrap" }}>
                        {paymentMethodBySale[s.id] ?? ""}
                      </td>
                      <td style={{ padding: "0.5mm 2mm" }}>
                        {s.status === "anulada" ? "ANULADA" : ""}
                      </td>
                      <td
                        style={{
                          padding: "0.5mm 0",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                          textDecoration: s.status === "anulada" ? "line-through" : undefined,
                        }}
                      >
                        {formatPEN(s.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        <p style={{ marginTop: "5mm", fontSize: "9px" }}>
          Documento interno de control. El arqueo del cajón se cierra en el módulo Caja.
        </p>
      </div>
    </>
  );
}
