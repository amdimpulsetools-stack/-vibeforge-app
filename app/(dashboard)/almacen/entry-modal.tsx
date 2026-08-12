"use client";

/**
 * Entrada de mercadería.
 *
 * Pasa una o dos veces por semana, sin apuro, casi siempre desde escritorio
 * con la factura del proveedor al lado: puede darse el lujo de ser un
 * formulario — pero corto.
 *
 * El costo unitario es obligatorio: `inv_mov_entrada_cost_chk` prohíbe una
 * entrada sin costo, y ese constraint es la respuesta a las 1 392 unidades
 * que entraron al Excel sin registro. Cuando hay un último costo conocido,
 * el campo llega prellenado con él para que igual cueste cero tipeo.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus } from "lucide-react";
import { formatPEN, type InventoryProduct } from "./types";

export interface EntryPayload {
  productId: string;
  quantity: number;
  unitCost: number;
  lotCode: string | null;
  expiryDate: string | null;
  supplier: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: InventoryProduct[];
  preselectedProductId: string | null;
  lastCosts: Record<string, number>;
  onSubmit: (payload: EntryPayload) => Promise<boolean>;
}

const labelCls =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

export function EntryModal({
  open,
  onOpenChange,
  products,
  preselectedProductId,
  lastCosts,
  onSubmit,
}: Props) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [lotCode, setLotCode] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [supplier, setSupplier] = useState("");
  const [showSupplier, setShowSupplier] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const pid = preselectedProductId ?? products[0]?.id ?? "";
    setProductId(pid);
    setQuantity("");
    setUnitCost(lastCosts[pid] != null ? String(lastCosts[pid]) : "");
    setLotCode("");
    setExpiryMonth("");
    setSupplier("");
    setShowSupplier(false);
    setError(null);
  }, [open, preselectedProductId, products, lastCosts]);

  const product = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId]
  );
  const lastCost = productId ? lastCosts[productId] : undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(quantity);
    const cost = Number(unitCost);
    if (!productId) return setError("Elige un producto.");
    if (!Number.isFinite(qty) || qty <= 0)
      return setError("La cantidad tiene que ser mayor que cero.");
    if (!Number.isFinite(cost) || cost < 0)
      return setError("El costo unitario es obligatorio en una entrada.");

    setError(null);
    setSaving(true);
    const ok = await onSubmit({
      productId,
      quantity: qty,
      unitCost: cost,
      lotCode: lotCode.trim() || null,
      expiryDate: expiryMonth || null,
      supplier: supplier.trim() || null,
    });
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Entrada de mercadería</DialogTitle>
          <DialogDescription>Registra lo que llegó del proveedor.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="entry-product">
              Producto
            </label>
            <select
              id="entry-product"
              value={productId}
              onChange={(e) => {
                const pid = e.target.value;
                setProductId(pid);
                setUnitCost(lastCosts[pid] != null ? String(lastCosts[pid]) : "");
              }}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-base shadow-sm outline-none focus:ring-1 focus:ring-ring md:text-sm"
            >
              {products.length === 0 && <option value="">Sin productos aún</option>}
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.presentation && p.presentation !== "UND"
                    ? ` · ${p.presentation}`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="entry-qty">
                Cantidad ({product?.base_unit ?? "UND"})
              </label>
              <Input
                id="entry-qty"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                autoFocus
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="entry-cost">
                Costo unitario
              </label>
              <Input
                id="entry-cost"
                type="number"
                min="0"
                step="0.0001"
                inputMode="decimal"
                placeholder="S/ 0.00"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="tabular-nums"
              />
              {lastCost != null && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Último costo: {formatPEN(lastCost)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="entry-lot">
                Lote
              </label>
              <Input
                id="entry-lot"
                value={lotCode}
                onChange={(e) => setLotCode(e.target.value)}
                placeholder="L-2291"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Como figura en la caja
              </p>
            </div>
            <div>
              <label className={labelCls} htmlFor="entry-exp">
                Vence
              </label>
              {/* type="month": las cajas traen MM/AAAA y el selector nativo de
                  mes es un solo tap en iOS y Android. Se guarda el último día. */}
              <Input
                id="entry-exp"
                type="month"
                value={expiryMonth}
                onChange={(e) => setExpiryMonth(e.target.value)}
              />
            </div>
          </div>

          {showSupplier ? (
            <div>
              <label className={labelCls} htmlFor="entry-supplier">
                Proveedor
              </label>
              <Input
                id="entry-supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Droguería del Sur"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSupplier(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Proveedor (opcional)
            </button>
          )}

          {error && <p className="text-xs font-medium text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || products.length === 0}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar entrada
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
