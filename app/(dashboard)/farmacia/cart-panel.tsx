"use client";

/**
 * El carrito. En escritorio vive adherido a la derecha; en móvil es el
 * contenido del bottom-sheet.
 *
 * El chip de lote arranca en FEFO (`nearestLotByProduct`) —lo que vence
 * primero sale primero, que es la regla real de una farmacia— y se puede
 * cambiar en un popover que muestra saldo y días a vencer de cada lote.
 * El color sale de `expiryStatus`, el mismo semáforo de Almacén: un lote
 * a punto de vencer se ve igual aquí que allá.
 *
 * Los totales al pie son una VISTA PREVIA con `computeLineTax`. Lo que se
 * cobra lo recalcula el servidor (mig 217); coinciden porque comparten
 * fórmula, no porque este componente acierte.
 */

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Minus, Plus, Receipt, Tag, Trash2, X } from "lucide-react";
import {
  cartTotals,
  clampQty,
  expiryStatus,
  fmtQty,
  formatPEN,
  lineAmount,
  TONE_CLS,
  type CartLine,
  type InventoryLot,
} from "./types";

interface Props {
  lines: CartLine[];
  lots: InventoryLot[];
  stockByLot: Record<string, number>;
  expiryAlertDays: number;
  busy: boolean;
  onQty: (line: CartLine, quantity: number) => void;
  onDiscount: (line: CartLine, discount: number) => void;
  onLot: (line: CartLine, lotId: string | null) => void;
  onRemove: (line: CartLine) => void;
  onClear: () => void;
  onCheckout: () => void;
}

export function CartPanel({
  lines,
  lots,
  stockByLot,
  expiryAlertDays,
  busy,
  onQty,
  onDiscount,
  onLot,
  onRemove,
  onClear,
  onCheckout,
}: Props) {
  const totals = cartTotals(lines);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
        <h2 className="text-sm font-bold">
          Carrito{" "}
          <span className="text-muted-foreground">
            ({lines.length} {lines.length === 1 ? "ítem" : "ítems"})
          </span>
        </h2>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" /> Vaciar
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {lines.length === 0 ? (
          <div className="grid h-full min-h-[8rem] place-items-center rounded-xl border border-dashed border-border">
            <p className="px-4 text-center text-xs text-muted-foreground">
              Busca un producto o toca uno de los frecuentes para empezar.
            </p>
          </div>
        ) : (
          lines.map((line) => (
            <CartRow
              key={line.id}
              line={line}
              lots={lots.filter((l) => l.product_id === line.product.id)}
              stockByLot={stockByLot}
              expiryAlertDays={expiryAlertDays}
              busy={busy}
              onQty={onQty}
              onDiscount={onDiscount}
              onLot={onLot}
              onRemove={onRemove}
            />
          ))
        )}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <dl className="space-y-1 text-sm">
          {totals.discount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <dt>Descuentos</dt>
              <dd className="tabular-nums">− {formatPEN(totals.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatPEN(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <dt>IGV (18%)</dt>
            <dd className="tabular-nums">{formatPEN(totals.igv)}</dd>
          </div>
          <div className="flex items-baseline justify-between pt-1 text-base font-bold">
            <dt>Total</dt>
            <dd className="text-xl tabular-nums text-primary">
              {formatPEN(totals.total)}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          disabled={lines.length === 0 || busy}
          onClick={onCheckout}
          className="mt-3 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[.99] disabled:opacity-40"
        >
          <Receipt className="h-5 w-5" /> Cobrar
          <span className="hidden text-sm font-semibold opacity-80 sm:inline">
            · F9
          </span>
        </button>
      </div>
    </div>
  );
}

function CartRow({
  line,
  lots,
  stockByLot,
  expiryAlertDays,
  busy,
  onQty,
  onDiscount,
  onLot,
  onRemove,
}: {
  line: CartLine;
  lots: InventoryLot[];
  stockByLot: Record<string, number>;
  expiryAlertDays: number;
  busy: boolean;
  onQty: (line: CartLine, quantity: number) => void;
  onDiscount: (line: CartLine, discount: number) => void;
  onLot: (line: CartLine, lotId: string | null) => void;
  onRemove: (line: CartLine) => void;
}) {
  const [showDiscount, setShowDiscount] = useState(line.lineDiscount > 0);
  const lot = lots.find((l) => l.id === line.lotId) ?? null;
  const exp = expiryStatus(lot?.expiry_date, expiryAlertDays);
  const gross = Math.round(line.quantity * line.unitPrice * 100) / 100;

  return (
    <div className="rounded-xl border border-border bg-card p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{line.product.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatPEN(line.unitPrice)} · {line.product.base_unit.toLowerCase()}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(line)}
          disabled={busy}
          aria-label={`Quitar ${line.product.name}`}
          className="rounded-md p-1 text-muted-foreground hover:text-red-500 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        {/* Stepper */}
        <div className="inline-flex items-center rounded-lg border border-border">
          <button
            type="button"
            onClick={() => onQty(line, clampQty(line.quantity - 1))}
            disabled={busy}
            aria-label="Quitar una unidad"
            className="grid h-9 w-9 place-items-center rounded-l-lg text-muted-foreground hover:bg-accent disabled:opacity-40"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={line.quantity}
            onChange={(e) => onQty(line, clampQty(Number(e.target.value)))}
            aria-label={`Cantidad de ${line.product.name}`}
            className="h-9 w-14 border-x border-border bg-transparent text-center text-sm font-bold tabular-nums outline-none"
          />
          <button
            type="button"
            onClick={() => onQty(line, clampQty(line.quantity + 1))}
            disabled={busy}
            aria-label="Agregar una unidad"
            className="grid h-9 w-9 place-items-center rounded-r-lg text-muted-foreground hover:bg-accent disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <span className="text-sm font-bold tabular-nums">
          {formatPEN(lineAmount(line))}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {/* Chip de lote (solo productos con lotes) */}
        {line.product.track_lots && lots.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors hover:opacity-80",
                  exp.chip ? TONE_CLS[exp.tone] : "bg-muted text-muted-foreground"
                )}
              >
                <Tag className="h-3 w-3" />
                {lot ? lot.lot_code : "Sin lote"}
                {exp.days !== null && exp.chip ? ` · ${exp.label}` : ""}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-1.5">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Lote a descontar
              </p>
              <ul className="max-h-56 overflow-y-auto">
                {lots.map((l) => {
                  const e = expiryStatus(l.expiry_date, expiryAlertDays);
                  const saldo = stockByLot[l.id] ?? 0;
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => onLot(line, l.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent",
                          l.id === line.lotId && "bg-primary/10"
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium">
                            {l.lot_code}
                          </span>
                          <span
                            className={cn(
                              "block text-[10px]",
                              e.tone === "crit"
                                ? "text-red-600 dark:text-red-400"
                                : e.tone === "warn"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground"
                            )}
                          >
                            {e.label}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {fmtQty(saldo)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
        )}

        {/* Descuento por línea */}
        {showDiscount ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
            <span className="text-muted-foreground">Dscto S/</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={gross}
              step="any"
              value={line.lineDiscount || ""}
              placeholder="0"
              onChange={(e) => {
                // El tope es el importe de la línea: la mig 216 lo rechaza
                // con un CHECK y aquí se evita el viaje perdido.
                const raw = Math.max(0, Number(e.target.value) || 0);
                onDiscount(line, Math.min(Math.round(raw * 100) / 100, gross));
              }}
              aria-label={`Descuento de ${line.product.name}`}
              className="w-14 bg-transparent text-right font-semibold tabular-nums outline-none"
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setShowDiscount(true)}
            className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            + Descuento
          </button>
        )}
      </div>
    </div>
  );
}
