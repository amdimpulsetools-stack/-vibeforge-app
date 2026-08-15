"use client";

/**
 * Buscador y rejilla de frecuentes — la mitad izquierda del POS.
 *
 * El buscador tiene AUTOFOCO y confirma con Enter agregando el primer
 * resultado: eso lo hace compatible con un lector de código de barras,
 * que no es más que un teclado que escribe rápido y pulsa Enter. Por eso
 * la búsqueda cubre nombre Y SKU.
 *
 * La rejilla de frecuentes son los 12 productos más vendidos del mes
 * (movimientos con reason_code='venta'), porque en un mostrador el 80%
 * de las ventas son los mismos veinte productos. Sin historial cae a
 * orden alfabético: una clínica que estrena el módulo no puede
 * encontrarse una rejilla vacía.
 */

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { PackageSearch, Search } from "lucide-react";
import {
  fmtQty,
  formatPEN,
  stockStatus,
  TONE_CLS,
  type SellableProduct,
} from "./types";

interface Props {
  query: string;
  onQuery: (q: string) => void;
  /** Resultados de la búsqueda (vacío = se muestra la rejilla de frecuentes). */
  results: SellableProduct[];
  frequent: SellableProduct[];
  stockByProduct: Record<string, number>;
  onPick: (product: SellableProduct) => void;
}

export const ProductPicker = forwardRef<HTMLInputElement, Props>(
  function ProductPicker(
    { query, onQuery, results, frequent, stockByProduct, onPick },
    ref
  ) {
    const searching = query.trim().length > 0;
    const shown = searching ? results : frequent;

    return (
      <div className="flex h-full flex-col">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={ref}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter agrega el primer resultado: el gesto del lector de
              // código de barras y también el del teclado.
              if (e.key === "Enter" && results.length > 0) {
                e.preventDefault();
                onPick(results[0]);
                onQuery("");
              }
              if (e.key === "Escape" && query) {
                e.preventDefault();
                onQuery("");
              }
            }}
            placeholder="Buscar por nombre o código…"
            aria-label="Buscar producto"
            autoFocus
            className="h-12 w-full rounded-xl border border-border bg-card pl-10 pr-3 text-base outline-none focus:border-primary/50 md:text-sm"
          />
        </div>

        <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {searching
            ? `${results.length} ${results.length === 1 ? "resultado" : "resultados"}`
            : "Más vendidos del mes"}
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <div className="grid h-full min-h-[10rem] place-items-center rounded-xl border border-dashed border-border">
              <div className="px-6 text-center">
                <PackageSearch className="mx-auto h-7 w-7 text-muted-foreground/60" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {searching
                    ? "Ningún producto coincide."
                    : "Aún no hay productos para vender."}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((p) => {
                const stock = stockByProduct[p.id] ?? 0;
                const st = stockStatus(stock, p.min_stock);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onPick(p);
                      onQuery("");
                    }}
                    className="flex h-full flex-col rounded-xl border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 active:scale-[.98]"
                  >
                    <span className="line-clamp-2 text-xs font-semibold leading-snug">
                      {p.name}
                    </span>
                    <span className="mt-auto pt-2 text-sm font-bold tabular-nums text-primary">
                      {formatPEN(p.sale_price)}
                    </span>
                    <span
                      className={cn(
                        "mt-1 w-fit rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        st ? TONE_CLS[st.tone] : "text-muted-foreground"
                      )}
                    >
                      {st ? st.label : `${fmtQty(stock)} disp.`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }
);
