"use client";

/**
 * Vista rápida de los lotes de UN producto.
 *
 * La tabla solo muestra el lote que vence primero, y la pestaña Vencimientos
 * apila los de todos los productos por urgencia. Faltaba la pregunta del día a
 * día: "de ESTE medicamento, ¿qué tandas tengo y cuál se me vence antes?".
 *
 * Solo lee: recibe los lotes y los saldos ya calculados por la página, sin
 * consultas propias. El saldo por lote sale del mismo array de movimientos que
 * alimenta el kardex, así que no puede desincronizarse de él.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  expiryStatus,
  fmtQty,
  TONE_CLS,
  type InventoryLot,
  type InventoryProduct,
} from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: InventoryProduct | null;
  /** Lotes de este producto (la página ya los tiene cargados). */
  lots: InventoryLot[];
  /** Saldo por lote, derivado de los movimientos. */
  stockByLot: Record<string, number>;
  expiryAlertDays: number;
}

/** Vencimiento en dd/mm/aaaa — el formato de Perú, no el del navegador. */
function fmtExpiry(iso: string | null): string {
  if (!iso) return "Sin vencimiento";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function LotsModal({
  open,
  onOpenChange,
  product,
  lots,
  stockByLot,
  expiryAlertDays,
}: Props) {
  if (!product) return null;

  // Con unidades primero y, dentro, lo que vence antes. Los lotes agotados
  // bajan al final: siguen siendo historial, pero ya no son decisión.
  const rows = lots
    .map((lot) => ({
      lot,
      stock: stockByLot[lot.id] ?? 0,
      exp: expiryStatus(lot.expiry_date, expiryAlertDays),
    }))
    .sort((a, b) => {
      const aEmpty = a.stock <= 0;
      const bEmpty = b.stock <= 0;
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      if (!a.lot.expiry_date) return 1;
      if (!b.lot.expiry_date) return -1;
      return a.lot.expiry_date.localeCompare(b.lot.expiry_date);
    });

  const withStock = rows.filter((r) => r.stock > 0);
  const total = withStock.reduce((acc, r) => acc + r.stock, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8 leading-tight">{product.name}</DialogTitle>
          <DialogDescription>
            {withStock.length === 0
              ? "Sin lotes con unidades disponibles."
              : `${fmtQty(total)} ${product.base_unit.toLowerCase()} en ${
                  withStock.length === 1
                    ? "1 lote"
                    : `${withStock.length} lotes`
                }.`}
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Este producto no tiene lotes registrados. Al registrar una entrada
            puedes indicar el lote y su vencimiento.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map(({ lot, stock, exp }) => (
              <li
                key={lot.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5",
                  stock <= 0 && "opacity-55"
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {lot.lot_code === "SIN-LOTE" ? "Sin lote" : lot.lot_code}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fmtExpiry(lot.expiry_date)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {exp.chip && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        TONE_CLS[exp.tone]
                      )}
                    >
                      {exp.label}
                    </span>
                  )}
                  <span className="text-sm font-bold tabular-nums">
                    {stock <= 0 ? "Agotado" : fmtQty(stock)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
