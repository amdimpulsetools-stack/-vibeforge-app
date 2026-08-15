"use client";

/**
 * Ventas del día: qué se vendió, cuánto entró y qué hay que deshacer.
 *
 * El botón Anular llama a `pharmacy_void_sale`, que revierte stock Y
 * dinero en una sola transacción — o no revierte nada. Si no hay caja
 * abierta, el RPC lo rechaza con un mensaje que la cajera entiende; esta
 * pantalla se limita a mostrarlo. Deshacer media venta (el stock sí, el
 * dinero no) sería peor que no deshacerla.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown, Loader2, Ban } from "lucide-react";
import {
  fmtQty,
  fmtTime,
  formatPEN,
  saleLabel,
  type PharmacySale,
  type PharmacySaleItem,
} from "./types";

interface Props {
  sales: PharmacySale[];
  itemsBySale: Record<string, PharmacySaleItem[]>;
  patientNames: Record<string, string>;
  loading: boolean;
  onVoided: () => void;
}

export function DaySalesTab({
  sales,
  itemsBySale,
  patientNames,
  loading,
  onVoided,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);

  const live = sales.filter((s) => s.status !== "anulada");
  const total = live.reduce((acc, s) => acc + Number(s.total ?? 0), 0);

  async function voidSale(sale: PharmacySale) {
    const reason = window.prompt(
      `Anular ${saleLabel(sale.sale_number)} por ${formatPEN(sale.total)}.\n\n¿Motivo?`
    );
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("La anulación necesita un motivo.");
      return;
    }

    setVoiding(sale.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("pharmacy_void_sale", {
      p_sale_id: sale.id,
      p_reason: reason.trim(),
    });
    setVoiding(null);

    if (error) {
      toast.error("No se pudo anular", { description: error.message });
      return;
    }
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

  if (sales.length === 0) {
    return (
      <div className="grid h-40 place-items-center rounded-xl border border-dashed border-border">
        <p className="text-sm text-muted-foreground">
          Todavía no hay ventas hoy.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between rounded-xl border border-border bg-card px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {live.length} {live.length === 1 ? "venta" : "ventas"} hoy
        </span>
        <span className="text-lg font-bold tabular-nums text-primary">
          {formatPEN(total)}
        </span>
      </div>

      <ul className="space-y-1.5">
        {sales.map((sale) => {
          const items = itemsBySale[sale.id] ?? [];
          const isOpen = expanded === sale.id;
          const anulada = sale.status === "anulada";
          const customer =
            (sale.patient_id ? patientNames[sale.patient_id] : null) ??
            sale.customer_label?.trim() ??
            "Público general";

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
                    </span>

                    {anulada ? (
                      <span className="italic">
                        {sale.void_reason ? `Motivo: ${sale.void_reason}` : "Anulada"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={voiding === sale.id}
                        onClick={() => void voidSale(sale)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-40 dark:text-red-400"
                      >
                        {voiding === sale.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Ban className="h-3 w-3" />
                        )}
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
}
