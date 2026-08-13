"use client";

/**
 * Tab Movimientos — kardex con filtros, totales y reporte.
 *
 * Todo se filtra y agrega EN CLIENTE: los movimientos ya están en memoria
 * (tope 5,000, ver page.tsx). Cuando ese tope quede corto, esto pasa a un
 * RPC de agregados — el comentario de page.tsx ya lo anticipa.
 *
 * Control de seguridad: cada fila muestra QUIÉN la registró (created_by es
 * inviolable — la policy lo fuerza a auth.uid() y el trigger append-only
 * impide reescribirlo). Si la fecha de kardex difiere de la de digitación
 * en más de un día, se marca "digitado el X" — el patrón clásico de
 * encubrimiento es registrar con fecha retroactiva.
 *
 * El contra-asiento de un "Deshacer" aparece en gris junto al movimiento
 * que corrige: ambos quedan en el libro y netean a cero. Nada se borra.
 */

import { useMemo, useState } from "react";
import { Download, History, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { exportToCSV } from "@/lib/export";
import {
  MOVEMENT_TYPE_META,
  REASON_LABELS,
  fmtDate,
  fmtQty,
  fmtSigned,
  formatPEN,
  reversedPairIds,
  type InventoryMovement,
  type InventoryProduct,
  type MovementType,
} from "./types";

interface Props {
  movements: InventoryMovement[];
  products: InventoryProduct[];
  authors: Record<string, string>;
}

type TypeFilter = MovementType | "todos";

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "entrada", label: "Entradas" },
  { key: "salida", label: "Salidas" },
  { key: "merma", label: "Mermas" },
  { key: "ajuste", label: "Ajustes" },
];

const PAGE_SIZE = 50;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** true si la fecha de kardex difiere de la de digitación en >1 día. */
function isBackdated(m: InventoryMovement): boolean {
  const created = m.created_at.slice(0, 10);
  const kardex = m.movement_date.slice(0, 10);
  const diff =
    Math.abs(new Date(created).getTime() - new Date(kardex).getTime()) / 86_400_000;
  return diff > 1;
}

const inputCls =
  "h-9 rounded-lg border border-border bg-card px-2.5 text-xs outline-none focus:border-primary/50";

export function MovementList({ movements, products, authors }: Props) {
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const [from, setFrom] = useState(() => isoDaysAgo(30));
  const [to, setTo] = useState(() => isoDaysAgo(0));
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("todos");
  const [productFilter, setProductFilter] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Autores presentes en el kardex (para el filtro). created_by null = import.
  const authorOptions = useMemo(() => {
    const ids = new Set<string>();
    let hasSystem = false;
    for (const m of movements) {
      if (m.created_by) ids.add(m.created_by);
      else hasSystem = true;
    }
    const opts = [...ids].map((id) => ({
      id,
      label: authors[id] ?? "Usuario sin nombre",
    }));
    opts.sort((a, b) => a.label.localeCompare(b.label, "es"));
    if (hasSystem) opts.push({ id: "__system__", label: "Importación / sistema" });
    return opts;
  }, [movements, authors]);

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      const d = m.movement_date.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (typeFilter !== "todos" && m.movement_type !== typeFilter) return false;
      if (productFilter && m.product_id !== productFilter) return false;
      if (authorFilter === "__system__") {
        if (m.created_by) return false;
      } else if (authorFilter && m.created_by !== authorFilter) {
        return false;
      }
      return true;
    });
  }, [movements, from, to, typeFilter, productFilter, authorFilter]);

  // Un movimiento deshecho + su contra-asiento netean el stock pero NO deben
  // contar en los números del período (auditoría 13-ago). Siguen visibles en
  // la lista — son historia — pero fuera de KPIs y gráfica.
  const reversed = useMemo(() => reversedPairIds(movements), [movements]);

  // ── Totales del período filtrado ──────────────────────────────────────
  const totals = useMemo(() => {
    let inUnits = 0;
    let outUnits = 0;
    let mermaUnits = 0;
    let purchases = 0; // S/ a costo de las COMPRAS (saldo_inicial no es compra)
    let sales = 0; // S/ congelados en salidas con precio (ventas)
    let cogs = 0; // costo de lo vendido (congelado; fallback: último costo conocido)
    const lastCost = new Map<string, number>();
    // Fallback para salidas viejas sin costo estampado: el último costo de
    // compra CONOCIDO HOY (aproximación etiquetada "est." — las salidas
    // nuevas ya llevan su CPP congelado y no la necesitan).
    for (let i = movements.length - 1; i >= 0; i--) {
      const m = movements[i];
      if (m.movement_type === "entrada" && m.unit_cost != null) {
        lastCost.set(m.product_id, Number(m.unit_cost));
      }
    }
    for (const m of filtered) {
      if (reversed.has(m.id)) continue;
      const q = Number(m.quantity);
      if (m.movement_type === "entrada") {
        inUnits += q;
        if (m.reason_code !== "saldo_inicial") {
          purchases += Number(m.cost_total ?? 0);
        }
      } else if (m.movement_type === "salida") {
        outUnits += Math.abs(q);
        if (m.revenue_total != null) {
          sales += Number(m.revenue_total);
          const c = m.unit_cost != null ? Number(m.unit_cost) : (lastCost.get(m.product_id) ?? 0);
          cogs += Math.abs(q) * c;
        }
      } else if (m.movement_type === "merma") {
        mermaUnits += Math.abs(q);
      }
    }
    return { inUnits, outUnits, mermaUnits, purchases, sales, profit: sales - cogs };
  }, [filtered, movements, reversed]);

  // ── Gráfica: S/ por día (ventas vs compras), últimos N días del rango ──
  const chart = useMemo(() => {
    const byDay = new Map<string, { sales: number; purchases: number }>();
    for (const m of filtered) {
      if (reversed.has(m.id)) continue;
      const d = m.movement_date.slice(0, 10);
      const cur = byDay.get(d) ?? { sales: 0, purchases: 0 };
      if (m.movement_type === "salida" && m.revenue_total != null)
        cur.sales += Number(m.revenue_total);
      if (m.movement_type === "entrada" && m.reason_code !== "saldo_inicial")
        cur.purchases += Number(m.cost_total ?? 0);
      byDay.set(d, cur);
    }
    const days = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-31);
    const max = Math.max(1, ...days.map(([, v]) => Math.max(v.sales, v.purchases)));
    return { days, max };
  }, [filtered, reversed]);

  const rows = filtered.slice(0, visible);

  function authorLabel(m: InventoryMovement): string {
    if (!m.created_by) return "Importación / sistema";
    return authors[m.created_by] ?? "Usuario sin nombre";
  }

  function handleExport() {
    exportToCSV(
      [
        "Fecha",
        "Tipo",
        "Motivo",
        "Producto",
        "Cantidad",
        "Unidad",
        "Costo unit.",
        "Precio unit.",
        "Total costo S/",
        "Total venta S/",
        "Registrado por",
        "Digitado el",
        "Notas",
      ],
      filtered.map((m) => {
        const p = byId.get(m.product_id);
        return [
          m.movement_date.slice(0, 10),
          MOVEMENT_TYPE_META[m.movement_type].label,
          m.reason_code ? REASON_LABELS[m.reason_code] : "",
          p?.name ?? "",
          Number(m.quantity),
          p?.base_unit ?? "",
          m.unit_cost != null ? Number(m.unit_cost) : "",
          m.unit_sale_price != null ? Number(m.unit_sale_price) : "",
          m.cost_total != null ? Number(m.cost_total) : "",
          m.revenue_total != null ? Number(m.revenue_total) : "",
          authorLabel(m),
          m.created_at.slice(0, 10),
          m.notes ?? "",
        ];
      }),
      `almacen-movimientos-${from}-a-${to}.csv`
    );
  }

  if (movements.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-10 text-center">
        <History className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-semibold">Todavía no hay movimientos</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Cada entrada, salida, merma o ajuste queda acá con fecha, motivo y
          quién lo registró. El kardex no se edita ni se borra: se corrige con
          un contra-asiento.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" id="almacen-reporte">
      {/* ── Filtros (no se imprimen) ── */}
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Desde
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Hasta
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tipo
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as TypeFilter);
              setVisible(PAGE_SIZE);
            }}
            className={inputCls}
          >
            {TYPE_FILTERS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Producto
          <select
            value={productFilter}
            onChange={(e) => {
              setProductFilter(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            className={cn(inputCls, "max-w-44")}
          >
            <option value="">Todos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Usuario
          <select
            value={authorFilter}
            onChange={(e) => {
              setAuthorFilter(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            className={cn(inputCls, "max-w-40")}
          >
            <option value="">Todos</option>
            {authorOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
      </div>

      {/* ── Cabecera solo impresión ── */}
      <div className="hidden print:block">
        <p className="text-lg font-bold">Almacén — Reporte de movimientos</p>
        <p className="text-xs text-muted-foreground">
          Del {from} al {to}
          {typeFilter !== "todos"
            ? ` · ${TYPE_FILTERS.find((t) => t.key === typeFilter)?.label}`
            : ""}
          {productFilter ? ` · ${byId.get(productFilter)?.name ?? ""}` : ""}
        </p>
      </div>

      {/* ── Totales del período ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Entradas" value={`${fmtQty(totals.inUnits)} und`} />
        <Kpi label="Salidas" value={`${fmtQty(totals.outUnits)} und`} />
        <Kpi label="Mermas" value={`${fmtQty(totals.mermaUnits)} und`} tone={totals.mermaUnits > 0 ? "warn" : undefined} />
        <Kpi label="Compras" value={formatPEN(totals.purchases)} />
        <Kpi label="Ventas" value={formatPEN(totals.sales)} />
        <Kpi
          label="Ganancia est."
          value={formatPEN(totals.profit)}
          tone={totals.profit >= 0 ? "ok" : "crit"}
          hint="Ventas menos costo congelado (o último costo conocido) de lo vendido. No incluye aplicaciones sin cobro."
        />
      </div>

      {/* ── Gráfica: barras por día ── */}
      {chart.days.length > 1 && (
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="mb-2 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-primary" /> Ventas S/
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-sky-500/70" /> Compras S/
            </span>
          </div>
          <div className="flex h-24 items-end gap-[3px]">
            {chart.days.map(([day, v]) => (
              <div
                key={day}
                className="group relative flex min-w-0 flex-1 items-end gap-[2px]"
                title={`${fmtDate(day)}: ventas ${formatPEN(v.sales)} · compras ${formatPEN(v.purchases)}`}
              >
                <div
                  className="min-h-[2px] flex-1 rounded-t-sm bg-primary/80"
                  style={{ height: `${(v.sales / chart.max) * 100}%` }}
                />
                <div
                  className="min-h-[2px] flex-1 rounded-t-sm bg-sky-500/60"
                  style={{ height: `${(v.purchases / chart.max) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{fmtDate(chart.days[0][0])}</span>
            <span>{fmtDate(chart.days[chart.days.length - 1][0])}</span>
          </div>
        </div>
      )}

      {/* ── Kardex ── */}
      <div className="-mx-4 border-y border-border/60 bg-card sm:mx-0 sm:rounded-2xl sm:border">
        <h2 className="border-b border-border/60 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {filtered.length === 1
            ? "1 movimiento"
            : `${filtered.length} movimientos`}{" "}
          en el período
        </h2>
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nada con estos filtros. Amplía el rango de fechas.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {rows.map((m) => {
              const p = byId.get(m.product_id);
              const meta = MOVEMENT_TYPE_META[m.movement_type];
              const isReversal = m.reverses_movement_id !== null;
              const backdated = isBackdated(m);
              const amount =
                m.movement_type === "salida" && m.revenue_total != null
                  ? Number(m.revenue_total)
                  : m.movement_type === "entrada" && m.cost_total != null
                    ? Number(m.cost_total)
                    : null;
              return (
                <li
                  key={m.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-2",
                    isReversal && "opacity-60"
                  )}
                >
                  <span className="w-12 shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {fmtDate(m.movement_date)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p?.name ?? "Producto eliminado"}
                      {amount != null && (
                        <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">
                          {formatPEN(amount)}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      <span
                        className={cn(
                          "mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                          meta.cls
                        )}
                      >
                        {meta.label}
                      </span>
                      {m.reason_code ? REASON_LABELS[m.reason_code] : "—"}
                      <span className="font-medium text-foreground/80">
                        {" · "}
                        {authorLabel(m)}
                      </span>
                      {backdated && (
                        <span
                          title={`Registrado con fecha retroactiva: digitado el ${m.created_at.slice(0, 10)}`}
                          className="ml-1.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400"
                        >
                          digitado {fmtDate(m.created_at)}
                        </span>
                      )}
                      {m.notes ? ` · ${m.notes}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 pt-0.5 text-sm font-bold tabular-nums",
                      Number(m.quantity) > 0 ? "text-primary" : "text-foreground"
                    )}
                  >
                    {fmtSigned(Number(m.quantity))}
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                      {p?.base_unit.toLowerCase() ?? ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > visible && (
          <div className="border-t border-border/40 p-2 text-center print:hidden">
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
            >
              Mostrar {Math.min(PAGE_SIZE, filtered.length - visible)} más
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "crit";
  hint?: string;
}) {
  return (
    <div
      className="rounded-xl border border-border/60 bg-card px-3 py-2"
      title={hint}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-bold tabular-nums",
          tone === "ok" && "text-primary",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "crit" && "text-red-600 dark:text-red-400"
        )}
      >
        {value}
      </p>
    </div>
  );
}
