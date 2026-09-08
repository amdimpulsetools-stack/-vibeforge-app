"use client";

/**
 * Cambiar el precio de venta de un producto SIN registrar una entrada.
 *
 * Caso real: el laboratorio sube la lista y todavía queda stock. Antes la
 * única vía era el campo opcional del modal de entrada, así que había que
 * inventar un lote para subir el precio. Aquí: precio actual → precio nuevo
 * + motivo, y debajo el historial que el trigger de la mig 209 ya venía
 * guardando desde el primer día (solo faltaba mostrarlo).
 *
 * El costo de compra NO se edita aquí, a propósito: lo que ya está en
 * almacén costó lo que costó (kardex append-only). Cuando el laboratorio
 * sube, lo que se ajusta es el precio de venta; el costo nuevo entra con el
 * siguiente lote.
 */
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPEN, netOfIgv, type InventoryProduct } from "./types";

export interface PricePayload {
  product: InventoryProduct;
  salePrice: number;
  reason: string | null;
}

interface PriceHistoryRow {
  id: string;
  old_price: number | null;
  new_price: number;
  effective_from: string;
  reason: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: InventoryProduct | null;
  /** Costo promedio o último costo conocido (sin IGV), para el margen estimado. */
  referenceCost: number | null;
  onSubmit: (payload: PricePayload) => Promise<boolean>;
}

const labelCls =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";
const inputCls =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-base shadow-sm outline-none focus:ring-1 focus:ring-ring md:text-sm";

/** dd/mm/aaaa — formato de Perú. */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function PriceModal({ open, onOpenChange, product, referenceCost, onSubmit }: Props) {
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PriceHistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!open || !product) return;
    setPrice(Number(product.sale_price).toFixed(2));
    setReason("");
    setSaving(false);

    let cancelled = false;
    setLoadingHistory(true);
    const supabase = createClient();
    supabase
      .from("inventory_price_history")
      .select("id, old_price, new_price, effective_from, reason, created_at")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (cancelled) return;
        setHistory((data as unknown as PriceHistoryRow[]) ?? []);
        setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, product]);

  const current = Number(product?.sale_price ?? 0);
  const next = Number(price.replace(",", "."));
  const valid = Number.isFinite(next) && next >= 0;
  const changed = valid && Math.abs(next - current) > 0.005;

  // Margen neto estimado con el precio NUEVO, misma fórmula que la pestaña
  // Rentabilidad: ingreso ÷ 1,18 (si gravado) − costo. Solo si hay costo.
  const margin = useMemo(() => {
    if (!product || !valid || referenceCost == null || referenceCost <= 0) return null;
    const net = netOfIgv(next, product.igv_affectation);
    if (net <= 0) return null;
    const profit = net - referenceCost;
    return { net, profit, pct: (profit / net) * 100 };
  }, [product, valid, next, referenceCost]);

  if (!product) return null;

  const handleSave = async () => {
    if (!changed) return;
    setSaving(true);
    const ok = await onSubmit({
      product,
      salePrice: Number(next.toFixed(2)),
      reason: reason.trim() || null,
    });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar precio de venta</DialogTitle>
          <DialogDescription>
            {product.name} · {product.presentation}. El cambio aplica de inmediato
            a todo el stock, sin registrar una entrada.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={labelCls}>Precio actual</span>
            <div className="flex h-10 items-center rounded-md border border-border/60 bg-muted/40 px-3 text-sm tabular-nums text-muted-foreground">
              {formatPEN(current)}
            </div>
          </div>
          <div>
            <label htmlFor="new-sale-price" className={labelCls}>
              Precio nuevo (con IGV)
            </label>
            <input
              id="new-sale-price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={cn(inputCls, changed && "border-primary/60 ring-1 ring-primary/30")}
              autoFocus
            />
          </div>
        </div>

        {margin && (
          <p className="text-[11px] leading-snug text-muted-foreground">
            Con el precio nuevo: ingreso neto {formatPEN(margin.net)} − costo{" "}
            {formatPEN(referenceCost!)} ={" "}
            <span className={cn("font-semibold", margin.profit >= 0 ? "text-success-600" : "text-destructive")}>
              {formatPEN(margin.profit)} ({margin.pct.toFixed(1)} %)
            </span>{" "}
            por unidad. Costo sin IGV, promedio de tus entradas.
          </p>
        )}

        <div>
          <label htmlFor="sale-price-reason" className={labelCls}>
            Motivo (opcional)
          </label>
          <input
            id="sale-price-reason"
            type="text"
            maxLength={120}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Subió el laboratorio, promoción, corrección…"
            className={inputCls}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} disabled={!changed || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar precio
          </Button>
        </div>

        <div className="border-t border-border/60 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Historial de precios
          </p>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              Sin cambios registrados todavía. El primer cambio aparecerá aquí.
            </p>
          ) : (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="tabular-nums">
                      {h.old_price != null ? (
                        <span className="text-muted-foreground line-through">{formatPEN(Number(h.old_price))}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}{" "}
                      → <span className="font-semibold">{formatPEN(Number(h.new_price))}</span>
                    </p>
                    {h.reason && (
                      <p className="mt-0.5 truncate text-muted-foreground" title={h.reason}>
                        {h.reason}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {fmtDate(h.effective_from)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
