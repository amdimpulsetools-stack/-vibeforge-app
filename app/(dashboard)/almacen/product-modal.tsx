"use client";

/**
 * Nuevo producto — solo owner/admin (la RLS de inventory_products deja
 * escribir únicamente a `is_org_admin`; el botón se oculta para el resto).
 *
 * Categoría: selector de las existentes + "Nueva categoría…" que revela el
 * campo de texto. Las categorías no son una tabla: son los valores distintos
 * de `inventory_products.category`, así cada rubro (dental, dermato, estética)
 * inventa su propio vocabulario sin migración ni pantalla de administración.
 *
 * Stock inicial + precio de compra: si se indican, al guardar se genera la
 * entrada `saldo_inicial` con el costo CONGELADO en el movimiento — el
 * producto nunca guarda costo (invariante del kardex, mig 209).
 *
 * El factor de conversión (`units_per_presentation`) vive colapsado en
 * "Avanzado": formaliza el "SE VENDE POR UNIDADES" del Excel (1 CAJA =
 * 30 UND) pero el 90% de los productos se maneja 1 a 1 y no merece un
 * campo permanente en la primera pantalla que ve la doctora.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { PRESENTATION_OPTIONS, UNIT_OPTIONS } from "./types";

export interface ProductPayload {
  name: string;
  category: string | null;
  presentation: string;
  base_unit: string;
  units_per_presentation: number;
  sale_price: number;
  min_stock: number;
  track_lots: boolean;
  /** Si > 0, la página crea la entrada `saldo_inicial` con este costo. */
  initial_stock: number;
  initial_cost: number | null;
  /**
   * Lote y vencimiento del stock inicial. Sin ellos, las unidades con las que
   * nace el producto quedaban fuera del control de caducidades: entraban al
   * kardex sin lote, así que la pestaña Vencimientos no las veía nunca.
   */
  initial_lot_code: string | null;
  /** "AAAA-MM" del selector de mes; la página lo lleva al último día. */
  initial_expiry_month: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  onSubmit: (payload: ProductPayload) => Promise<boolean>;
}

const NEW_CATEGORY = "__nueva__";

const labelCls =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";
const selectCls =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-base shadow-sm outline-none focus:ring-1 focus:ring-ring md:text-sm";

export function ProductModal({ open, onOpenChange, categories, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState(false);
  const [presentation, setPresentation] = useState("UND");
  const [baseUnit, setBaseUnit] = useState("UND");
  const [factor, setFactor] = useState("1");
  const [salePrice, setSalePrice] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [initialStock, setInitialStock] = useState("");
  const [initialLot, setInitialLot] = useState("");
  const [initialExpiry, setInitialExpiry] = useState("");
  const [minStock, setMinStock] = useState("");
  const [trackLots, setTrackLots] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setCategory("");
    setNewCategory(categories.length === 0);
    setPresentation("UND");
    setBaseUnit("UND");
    setFactor("1");
    setSalePrice("");
    setPurchaseCost("");
    setInitialStock("");
    setMinStock("");
    setTrackLots(true);
    setAdvanced(false);
    setError(null);
  }, [open, categories.length]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("El nombre no puede quedar vacío.");
    const f = Number(factor || "1");
    if (!Number.isFinite(f) || f <= 0)
      return setError("El factor de conversión tiene que ser mayor que cero.");

    const stock0 = Number(initialStock || "0");
    const cost0 = purchaseCost === "" ? null : Number(purchaseCost);
    if (stock0 > 0 && (cost0 == null || !Number.isFinite(cost0) || cost0 < 0)) {
      return setError(
        "Para cargar stock inicial necesitas el precio de compra: sin costo no hay entrada (regla del kardex)."
      );
    }

    setError(null);
    setSaving(true);
    const ok = await onSubmit({
      name: name.trim(),
      category: category.trim() || null,
      presentation: presentation.trim() || "UND",
      base_unit: baseUnit.trim() || "UND",
      units_per_presentation: f,
      sale_price: Number(salePrice || "0"),
      min_stock: Number(minStock || "0"),
      track_lots: trackLots,
      initial_stock: Math.max(0, stock0),
      initial_cost: cost0,
      // Solo tienen sentido si el producto nace con unidades.
      initial_lot_code: stock0 > 0 ? initialLot.trim() || null : null,
      initial_expiry_month: stock0 > 0 ? initialExpiry || null : null,
    });
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo producto</DialogTitle>
          <DialogDescription>
            Empieza por los que más rotan. Los demás los vas sumando sobre la marcha.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="prod-name">
              Nombre
            </label>
            <Input
              id="prod-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="PERGOVERIS 450"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="prod-cat">
                Categoría
              </label>
              {newCategory ? (
                <div className="flex gap-1.5">
                  <Input
                    id="prod-cat"
                    autoFocus={categories.length > 0}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Ortodoncia, Insumos…"
                  />
                  {categories.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewCategory(false);
                        setCategory("");
                      }}
                      className="shrink-0 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Elegir
                    </button>
                  )}
                </div>
              ) : (
                <select
                  id="prod-cat"
                  value={category}
                  onChange={(e) => {
                    if (e.target.value === NEW_CATEGORY) {
                      setNewCategory(true);
                      setCategory("");
                    } else {
                      setCategory(e.target.value);
                    }
                  }}
                  className={selectCls}
                >
                  <option value="">Sin categoría</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY}>➕ Nueva categoría…</option>
                </select>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="prod-pres">
                Presentación
              </label>
              <select
                id="prod-pres"
                value={presentation}
                onChange={(e) => setPresentation(e.target.value)}
                className={selectCls}
              >
                {PRESENTATION_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="prod-cost">
                Precio compra
              </label>
              <Input
                id="prod-cost"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={purchaseCost}
                onChange={(e) => setPurchaseCost(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="prod-price">
                Precio venta
              </label>
              <Input
                id="prod-price"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls} htmlFor="prod-initial">
                Stock inicial
              </label>
              <Input
                id="prod-initial"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0"
                value={initialStock}
                onChange={(e) => setInitialStock(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="prod-min">
                Stock mínimo
              </label>
              <Input
                id="prod-min"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="prod-unit">
                Unidad base
              </label>
              <select
                id="prod-unit"
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value)}
                className={selectCls}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {/* Lote y vencimiento del stock inicial. Aparecen al escribir una
              cantidad: sin ellos, las unidades con las que nace el producto
              entraban al kardex sin lote y quedaban fuera de Vencimientos. */}
          {Number(initialStock || "0") > 0 && trackLots && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="prod-lot">
                  Lote del stock inicial
                </label>
                <Input
                  id="prod-lot"
                  placeholder="Opcional"
                  value={initialLot}
                  onChange={(e) => setInitialLot(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="prod-exp">
                  Vence
                </label>
                {/* type="month" como en Entrada: MM/AAAA y un solo toque en
                    móvil. Se guarda el último día del mes. */}
                <Input
                  id="prod-exp"
                  type="month"
                  value={initialExpiry}
                  onChange={(e) => setInitialExpiry(e.target.value)}
                />
              </div>
            </div>
          )}

          <p className="!mt-1.5 text-[11px] text-muted-foreground">
            Con stock inicial y precio de compra se crea la primera entrada al
            kardex. El costo queda congelado en ese movimiento — las siguientes
            compras se registran con «Entrada».
          </p>

          <div className="rounded-xl border border-border/60">
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="flex w-full items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {advanced ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Avanzado
            </button>
            {advanced && (
              <div className="space-y-3 border-t border-border/60 p-3">
                <div>
                  <label className={labelCls} htmlFor="prod-factor">
                    Factor de conversión
                  </label>
                  <Input
                    id="prod-factor"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={factor}
                    onChange={(e) => setFactor(e.target.value)}
                    className="tabular-nums"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Cuántas {baseUnit} trae 1 {presentation}. Si no se fracciona,
                    déjalo en 1.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={trackLots}
                    onChange={(e) => setTrackLots(e.target.checked)}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  Controlar lotes y vencimiento
                </label>
              </div>
            )}
          </div>

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
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar producto
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
