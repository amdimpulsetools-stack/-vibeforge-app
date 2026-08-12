"use client";

/**
 * Tab Movimientos — kardex simple, solo lectura.
 *
 * Los últimos 50 movimientos de la organización. El contra-asiento de un
 * "Deshacer" aparece en gris junto al movimiento que corrige: ambos quedan
 * en el libro y netean a cero. Nada se borra nunca.
 */

import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MOVEMENT_TYPE_META,
  REASON_LABELS,
  fmtDate,
  fmtSigned,
  type InventoryMovement,
  type InventoryProduct,
} from "./types";

interface Props {
  movements: InventoryMovement[];
  products: InventoryProduct[];
  authors: Record<string, string>;
}

export function MovementList({ movements, products, authors }: Props) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const recent = movements.slice(0, 50);

  if (recent.length === 0) {
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
    <div className="-mx-4 border-y border-border/60 bg-card sm:mx-0 sm:rounded-2xl sm:border">
      <h2 className="border-b border-border/60 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Últimos movimientos
      </h2>
      <ul className="divide-y divide-border/40">
        {recent.map((m) => {
          const p = byId.get(m.product_id);
          const meta = MOVEMENT_TYPE_META[m.movement_type];
          const isReversal = m.reverses_movement_id !== null;
          return (
            <li
              key={m.id}
              className={cn(
                "flex items-start gap-3 px-4 py-3",
                isReversal && "opacity-60"
              )}
            >
              <span className="w-12 shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {fmtDate(m.movement_date)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {p?.name ?? "Producto eliminado"}
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
                  {m.created_by && authors[m.created_by]
                    ? ` · ${authors[m.created_by]}`
                    : ""}
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
    </div>
  );
}
