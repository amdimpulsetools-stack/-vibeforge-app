"use client";

/**
 * Aplicar un producto del almacén a un TRATAMIENTO (mig 268).
 *
 * Tres toques en el caso frecuente: buscar el producto, la cantidad (1 ya
 * viene puesta) y "Aplicar". El lote solo aparece si el producto los lleva
 * y es opcional (el POS también lo permite sin lote).
 *
 * AQUÍ NO HAY DINERO. Lo que sale de esta pantalla es una salida del kardex
 * con el costo promedio congelado EN EL SERVIDOR (RPC treatment_apply_product):
 * no hay precio de venta, no se cobra nada y el tratamiento no cambia su
 * acordado ni su pendiente. Es un costo, y así lo muestra la ficha.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Minus, Plus, Search, Syringe } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { useOrgToday } from "@/hooks/use-org-today";
import { cn } from "@/lib/utils";
import type { TreatmentSupplyInput } from "@/types/treatments";

export interface TreatmentSupplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treatmentId: string;
  organizationId: string | null;
  patientName: string;
  /** Se llama tras una aplicación exitosa para que el padre refresque. */
  onApplied: () => void;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  presentation: string;
  base_unit: string;
  track_lots: boolean;
}

interface LotOption {
  id: string;
  lot_code: string;
  expiry_date: string | null;
}

interface ApplyResult {
  movement_id: string;
  unit_cost: number | null;
  cost_total: number | null;
  warnings: string[];
}

const QUICK_QTY = [1, 2, 3, 4];

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

export function TreatmentSupplyDialog({
  open,
  onOpenChange,
  treatmentId,
  organizationId,
  patientName,
  onApplied,
}: TreatmentSupplyDialogProps) {
  const { today: orgToday } = useOrgToday();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [lots, setLots] = useState<LotOption[]>([]);
  const [lotId, setLotId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [qtyText, setQtyText] = useState("1");
  const [date, setDate] = useState(() => orgToday());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setOptions([]);
    setProduct(null);
    setLots([]);
    setLotId("");
    setQty(1);
    setQtyText("1");
    setDate(orgToday());
    setNotes("");
    setSaving(false);
  }, [open, orgToday]);

  // Búsqueda por nombre o SKU, solo productos activos de la org. Con el
  // mismo criterio que el POS: dos letras bastan para empezar a buscar.
  useEffect(() => {
    if (!open || product || !organizationId) return;
    const q = query.trim();
    if (q.length < 2) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      const like = `%${q.replace(/[%_]/g, "")}%`;
      const { data } = await supabase
        .from("inventory_products")
        .select("id, name, sku, presentation, base_unit, track_lots")
        .eq("organization_id", organizationId)
        .eq("is_discontinued", false)
        .or(`name.ilike.${like},sku.ilike.${like}`)
        .order("name", { ascending: true })
        .limit(12);
      if (!cancelled) {
        setOptions((data ?? []) as ProductOption[]);
        setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query, product, organizationId]);

  // Lotes del producto elegido (solo si los lleva), los que vencen antes primero.
  useEffect(() => {
    if (!product?.track_lots) {
      setLots([]);
      setLotId("");
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("inventory_lots")
        .select("id, lot_code, expiry_date")
        .eq("product_id", product.id)
        .order("expiry_date", { ascending: true, nullsFirst: false });
      if (!cancelled) setLots((data ?? []) as LotOption[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [product]);

  const qtyValid = useMemo(() => Number.isFinite(qty) && qty > 0, [qty]);

  const setQuantity = (n: number) => {
    setQty(n);
    setQtyText(String(n));
  };

  const submit = async () => {
    if (!product || !qtyValid) return;
    setSaving(true);
    const body: TreatmentSupplyInput = {
      product_id: product.id,
      quantity: qty,
      lot_id: lotId || null,
      movement_date: date,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    try {
      const res = await fetch(`/api/treatments/${treatmentId}/supplies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: ApplyResult;
      };
      if (!res.ok) {
        toast.error(json.error ?? "No se pudo aplicar el producto");
        setSaving(false);
        return;
      }
      const warnings = json.data?.warnings ?? [];
      toast.success(`${product.name} aplicado a ${patientName}`, {
        description:
          warnings.length > 0
            ? warnings.join(" ")
            : json.data?.cost_total != null
              ? `Costo registrado: S/ ${json.data.cost_total.toFixed(2)}`
              : "Sin costo conocido: el producto no tiene entradas con costo.",
      });
      onApplied();
      onOpenChange(false);
    } catch {
      toast.error("No se pudo aplicar el producto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aplicar producto del almacén</DialogTitle>
          <DialogDescription>
            Sale del stock al costo, sin cobro. Queda en el kardex y en esta
            ficha como insumo del tratamiento de {patientName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Producto */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Producto
            </label>
            {product ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{product.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {product.presentation} · por {product.base_unit.toLowerCase()}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setProduct(null);
                    setQuery("");
                  }}
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre o código…"
                  aria-label="Buscar producto"
                  className={cn(inputClass, "pl-9")}
                />
                {(searching || options.length > 0 || query.trim().length >= 2) && (
                  <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-card">
                    {searching && options.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
                    ) : options.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        Ningún producto coincide.
                      </p>
                    ) : (
                      options.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setProduct(o)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{o.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {o.presentation}
                              {o.sku ? ` · ${o.sku}` : ""}
                            </span>
                          </span>
                          <Syringe className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lote (solo si el producto los lleva) */}
          {product?.track_lots && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Lote (opcional)
              </label>
              <select
                value={lotId}
                onChange={(e) => setLotId(e.target.value)}
                className={inputClass}
              >
                <option value="">Sin lote</option>
                {lots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lot_code}
                    {l.expiry_date ? ` · vence ${l.expiry_date}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Cantidad */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cantidad{product ? ` (${product.base_unit.toLowerCase()})` : ""}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {QUICK_QTY.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQuantity(n)}
                  className={cn(
                    "h-10 w-10 rounded-lg border text-sm font-semibold",
                    qty === n
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border hover:bg-accent",
                  )}
                >
                  {n}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Una menos"
                  onClick={() => setQuantity(Math.max(0.001, Math.round((qty - 1) * 1000) / 1000))}
                  className="h-10 w-10 rounded-lg border border-border hover:bg-accent"
                >
                  <Minus className="mx-auto h-4 w-4" />
                </button>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={qtyText}
                  onChange={(e) => {
                    setQtyText(e.target.value);
                    setQty(Number(e.target.value));
                  }}
                  aria-label="Cantidad"
                  className={cn(inputClass, "w-24 text-center")}
                />
                <button
                  type="button"
                  aria-label="Una más"
                  onClick={() => setQuantity(Math.round((qty + 1) * 1000) / 1000)}
                  className="h-10 w-10 rounded-lg border border-border hover:bg-accent"
                >
                  <Plus className="mx-auto h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Fecha
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nota (opcional)
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                placeholder="Día 5 de estimulación…"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-lg border border-border px-4 text-sm hover:bg-accent md:h-auto md:py-2"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !product || !qtyValid}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 md:h-auto md:py-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Aplicar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
