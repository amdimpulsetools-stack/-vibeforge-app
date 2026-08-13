"use client";

/**
 * Tab Vencimientos — los lotes ordenados por fecha, con el dinero que
 * representa cada uno. La pregunta que responde: "¿qué plata se me muere
 * en el anaquel y cuándo?" (el Excel de la piloto tenía S/8,620 venciendo
 * en 20 días y ninguna celda lo gritaba).
 *
 * El saldo de un lote es SUM(movements.quantity) filtrado por lot_id —
 * el mismo invariante que el stock del producto. Un lote consumido
 * (saldo 0) desaparece de esta vista: ya no es plata en riesgo.
 *
 * Todo client-side sobre los arrays ya en memoria (ver page.tsx).
 */

import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TONE_CLS,
  expiryStatus,
  fmtQty,
  formatPEN,
  type InventoryLot,
  type InventoryMovement,
  type InventoryProduct,
} from "./types";

interface Props {
  products: InventoryProduct[];
  lots: InventoryLot[];
  movements: InventoryMovement[];
  /** Último costo conocido por producto (fallback si el lote no tiene). */
  lastCosts: Record<string, number>;
  expiryAlertDays: number;
}

export function ExpiryList({
  products,
  lots,
  movements,
  lastCosts,
  expiryAlertDays,
}: Props) {
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Saldo por lote. Los movimientos sin lot_id no pertenecen a ningún lote
  // (p. ej. salidas rápidas sin selección): no restan de esta vista — el
  // saldo de producto sigue siendo la verdad en Productos.
  const stockByLot = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of movements) {
      if (!m.lot_id) continue;
      map[m.lot_id] = (map[m.lot_id] ?? 0) + Number(m.quantity);
    }
    return map;
  }, [movements]);

  const rows = useMemo(() => {
    const out = lots
      .map((lot) => {
        const stock = stockByLot[lot.id] ?? 0;
        const product = byId.get(lot.product_id);
        const unitCost =
          lot.unit_cost != null
            ? Number(lot.unit_cost)
            : (lastCosts[lot.product_id] ?? 0);
        return {
          lot,
          product,
          stock,
          capital: stock * unitCost,
          exp: expiryStatus(lot.expiry_date, expiryAlertDays),
        };
      })
      .filter((r) => r.stock > 0 && r.product && !r.product.is_discontinued);

    // Vencidos primero, luego por cercanía; sin fecha al final.
    out.sort((a, b) => {
      const av = a.exp.days ?? Number.POSITIVE_INFINITY;
      const bv = b.exp.days ?? Number.POSITIVE_INFINITY;
      return av - bv || (b.capital - a.capital);
    });
    return out;
  }, [lots, stockByLot, byId, lastCosts, expiryAlertDays]);

  const totals = useMemo(() => {
    let expired = 0;
    let critical = 0; // ≤ alertDays
    let warning = 0; // alertDays–2×
    let noDate = 0;
    for (const r of rows) {
      if (r.exp.days === null) noDate += r.capital;
      else if (r.exp.days < 0) expired += r.capital;
      else if (r.exp.days <= expiryAlertDays) critical += r.capital;
      else if (r.exp.days <= expiryAlertDays * 2) warning += r.capital;
    }
    return { expired, critical, warning, noDate };
  }, [rows, expiryAlertDays]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-10 text-center">
        <CalendarClock className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-semibold">Nada en riesgo</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Los lotes con saldo aparecen acá ordenados por fecha de vencimiento,
          con el capital que representa cada uno. Registra tus entradas con
          lote y fecha para verlos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Capital en riesgo, por franja ── */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <RiskKpi
          label="Vencido"
          value={totals.expired}
          tone={totals.expired > 0 ? "crit" : undefined}
        />
        <RiskKpi
          label={`Vence en ≤${expiryAlertDays} días`}
          value={totals.critical}
          tone={totals.critical > 0 ? "crit" : undefined}
        />
        <RiskKpi
          label={`${expiryAlertDays}–${expiryAlertDays * 2} días`}
          value={totals.warning}
          tone={totals.warning > 0 ? "warn" : undefined}
        />
        <RiskKpi
          label="Sin fecha registrada"
          value={totals.noDate}
          tone={totals.noDate > 0 ? "warn" : undefined}
          hint="Capital cuyo vencimiento nadie conoce. Regístralo con una entrada con lote."
        />
      </div>

      <div className="-mx-4 border-y border-border/60 bg-card sm:mx-0 sm:rounded-2xl sm:border">
        <ul className="divide-y divide-border/40">
          {rows.map((r) => (
            <li
              key={r.lot.id}
              className={cn(
                "flex items-center gap-3 px-4 py-2",
                r.exp.days !== null && r.exp.days < 0 && "bg-red-500/[.04]"
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.product!.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.lot.lot_code !== "SIN-LOTE" ? `Lote ${r.lot.lot_code} · ` : ""}
                  {fmtQty(r.stock)} {r.product!.base_unit.toLowerCase()}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                  r.exp.chip ? TONE_CLS[r.exp.tone] : "text-muted-foreground"
                )}
              >
                {r.exp.days === null ? "Sin fecha" : r.exp.label}
              </span>
              <span className="w-24 shrink-0 text-right text-sm font-bold tabular-nums">
                {formatPEN(r.capital)}
              </span>
            </li>
          ))}
        </ul>
        <div className="border-t border-border/40 px-4 py-2.5 text-[11px] text-muted-foreground">
          {rows.length} {rows.length === 1 ? "lote" : "lotes"} con saldo ·
          capital valorizado al costo del lote (o último costo conocido)
        </div>
      </div>
    </div>
  );
}

function RiskKpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone?: "warn" | "crit";
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
          tone === "crit" && "text-red-600 dark:text-red-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400"
        )}
      >
        {formatPEN(value)}
      </p>
    </div>
  );
}
