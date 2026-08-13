"use client";

/**
 * Tab Rentabilidad — la revelación del módulo: cuánto ganas DE VERDAD.
 *
 * El Excel de la piloto reportaba S/220,479 de ganancia ene–jul cuando la
 * real era S/40,999 (6.3× inflada), porque su fórmula nunca restaba el
 * costo de lo vendido. Este tab hace exactamente esa resta, producto por
 * producto: ventas congeladas en el movimiento − COGS (costo congelado en
 * la salida, o el último costo de compra conocido si la salida no lo
 * estampó — se etiqueta "estimada" por honestidad).
 *
 * También responde "¿cuánta plata tengo dormida?": stock valorizado al
 * costo, y qué parte no vendió ni una unidad en el período.
 *
 * Decisión comercial (12-ago): este tab es EL argumento de upgrade al plan
 * Clínica. Durante la beta oculta las 3 orgs con grant tienen nivel
 * completo, así que el candado por plan se implementa recién al vender el
 * addon públicamente (mismo lugar donde se voltea is_active).
 */

import { useMemo, useState } from "react";
import { Download, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { exportToCSV } from "@/lib/export";
import {
  fmtQty,
  formatPEN,
  type InventoryMovement,
  type InventoryProduct,
} from "./types";

type SortKey = "ganancia" | "rotacion";

interface Props {
  products: InventoryProduct[];
  movements: InventoryMovement[];
  stockByProduct: Record<string, number>;
  lastCosts: Record<string, number>;
}

const inputCls =
  "h-9 rounded-lg border border-border bg-card px-2.5 text-xs outline-none focus:border-primary/50";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function ProfitTab({ products, movements, stockByProduct, lastCosts }: Props) {
  const [from, setFrom] = useState(() => isoDaysAgo(30));
  const [to, setTo] = useState(() => isoDaysAgo(0));
  const [sortKey, setSortKey] = useState<SortKey>("ganancia");

  const report = useMemo(() => {
    interface Row {
      product: InventoryProduct;
      soldUnits: number;
      applications: number;
      revenue: number;
      cogs: number;
      profit: number;
      margin: number | null;
      estimated: boolean;
    }
    const byProduct = new Map<string, Row>();
    const ensure = (p: InventoryProduct): Row => {
      let r = byProduct.get(p.id);
      if (!r) {
        r = {
          product: p,
          soldUnits: 0,
          applications: 0,
          revenue: 0,
          cogs: 0,
          profit: 0,
          margin: null,
          estimated: false,
        };
        byProduct.set(p.id, r);
      }
      return r;
    };
    const prodById = new Map(products.map((p) => [p.id, p]));

    for (const m of movements) {
      const d = m.movement_date.slice(0, 10);
      if (d < from || d > to) continue;
      if (m.movement_type !== "salida") continue;
      const p = prodById.get(m.product_id);
      if (!p) continue;
      const qty = Math.abs(Number(m.quantity));
      const r = ensure(p);
      if (m.revenue_total != null) {
        // Venta: precio congelado en el movimiento.
        r.soldUnits += qty;
        r.revenue += Number(m.revenue_total);
        if (m.unit_cost != null) {
          r.cogs += qty * Number(m.unit_cost);
        } else {
          r.cogs += qty * (lastCosts[m.product_id] ?? 0);
          r.estimated = true;
        }
      } else {
        // Aplicación en consulta: todavía no sabemos si se cobró (F2).
        r.applications += qty;
      }
    }

    const rows = [...byProduct.values()].filter(
      (r) => r.soldUnits > 0 || r.applications > 0
    );
    for (const r of rows) {
      r.profit = r.revenue - r.cogs;
      r.margin = r.revenue > 0 ? (r.profit / r.revenue) * 100 : null;
    }
    // "Rotación" = unidades que SALIERON (vendidas + aplicadas): la pregunta
    // es qué se mueve, no qué deja plata — son rankings distintos a propósito.
    rows.sort((a, b) =>
      sortKey === "rotacion"
        ? b.soldUnits + b.applications - (a.soldUnits + a.applications) ||
          b.profit - a.profit
        : b.profit - a.profit
    );

    const totals = rows.reduce(
      (acc, r) => {
        acc.revenue += r.revenue;
        acc.cogs += r.cogs;
        acc.profit += r.profit;
        acc.estimated ||= r.estimated;
        return acc;
      },
      { revenue: 0, cogs: 0, profit: 0, estimated: false }
    );

    // Capital en anaquel, valorizado al último costo conocido, y cuánto de
    // eso no vendió ni una unidad en el período (plata dormida).
    let capital = 0;
    let dormant = 0;
    for (const p of products) {
      const stock = stockByProduct[p.id] ?? 0;
      if (stock <= 0) continue;
      const value = stock * (lastCosts[p.id] ?? 0);
      capital += value;
      const sold = byProduct.get(p.id);
      if (!sold || (sold.soldUnits === 0 && sold.applications === 0)) {
        dormant += value;
      }
    }

    return { rows, totals, capital, dormant };
  }, [products, movements, stockByProduct, lastCosts, from, to, sortKey]);

  const { rows, totals, capital, dormant } = report;
  const marginPct =
    totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Desde
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Hasta
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Ordenar
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className={inputCls}
          >
            <option value="ganancia">Mayor ganancia</option>
            <option value="rotacion">Más rotados</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() =>
            exportToCSV(
              [
                "Producto",
                "Vendido (und)",
                "Aplicado (und)",
                "Rotación (und)",
                "Ventas S/",
                "Costo S/",
                "Ganancia S/",
                "Margen %",
              ],
              rows.map((r) => [
                r.product.name,
                r.soldUnits,
                r.applications,
                r.soldUnits + r.applications,
                Math.round(r.revenue * 100) / 100,
                Math.round(r.cogs * 100) / 100,
                Math.round(r.profit * 100) / 100,
                r.margin === null ? "" : Math.round(r.margin * 10) / 10,
              ]),
              `almacen-rentabilidad-${from}-a-${to}.csv`
            )
          }
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
        {totals.estimated && (
          <p className="pb-1 text-[11px] text-muted-foreground">
            * Alguna venta sin costo estampado: se usó el último costo de
            compra conocido.
          </p>
        )}
      </div>

      {/* ── Los números que importan ── */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Kpi label="Ventas" value={formatPEN(totals.revenue)} />
        <Kpi label="Costo de lo vendido" value={formatPEN(totals.cogs)} />
        <Kpi
          label={totals.estimated ? "Ganancia real *" : "Ganancia real"}
          value={formatPEN(totals.profit)}
          tone={totals.profit >= 0 ? "ok" : "crit"}
        />
        <Kpi
          label="Margen"
          value={marginPct === null ? "—" : `${marginPct.toFixed(1)}%`}
          tone={
            marginPct === null ? undefined : marginPct >= 0 ? undefined : "crit"
          }
        />
        <Kpi
          label="Capital en stock"
          value={formatPEN(capital)}
          tone="warn"
          hint={`Valorizado al costo. Dormido (sin movimiento en el período): ${formatPEN(dormant)}`}
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-10 text-center">
          <TrendingUp className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
          <p className="text-sm font-semibold">Sin salidas en el período</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Cuando registres ventas verás acá la ganancia real de cada
            producto: lo cobrado menos lo que te costó — la resta que ningún
            Excel hace sola.
          </p>
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto border-y border-border/60 bg-card sm:mx-0 sm:rounded-2xl sm:border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Producto</th>
                <th className="px-4 py-2 text-right font-semibold">Vendido</th>
                <th className="px-4 py-2 text-right font-semibold">Ventas</th>
                <th className="px-4 py-2 text-right font-semibold">Costo</th>
                <th className="px-4 py-2 text-right font-semibold">Ganancia</th>
                <th className="px-4 py-2 text-right font-semibold">Margen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product.id} className="border-t border-border/40">
                  <td className="px-4 py-2">
                    <p className="font-medium">{r.product.name}</p>
                    {r.applications > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        + {fmtQty(r.applications)} aplicadas en consulta (sin
                        cobro registrado)
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {fmtQty(r.soldUnits)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatPEN(r.revenue)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {formatPEN(r.cogs)}
                    {r.estimated ? " *" : ""}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right font-bold tabular-nums",
                      r.profit >= 0
                        ? "text-primary"
                        : "text-red-600 dark:text-red-400"
                    )}
                  >
                    {formatPEN(r.profit)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right tabular-nums",
                      r.margin !== null && r.margin < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {r.margin === null ? "—" : `${r.margin.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/60 bg-muted/30 font-bold">
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {fmtQty(rows.reduce((a, r) => a + r.soldUnits, 0))}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatPEN(totals.revenue)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {formatPEN(totals.cogs)}
                </td>
                <td
                  className={cn(
                    "px-4 py-2 text-right tabular-nums",
                    totals.profit >= 0
                      ? "text-primary"
                      : "text-red-600 dark:text-red-400"
                  )}
                >
                  {formatPEN(totals.profit)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {marginPct === null ? "—" : `${marginPct.toFixed(1)}%`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
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
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2" title={hint}>
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
