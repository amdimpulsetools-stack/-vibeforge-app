"use client";

/**
 * Editar un producto ya creado (mig 271).
 *
 * Caso real (25-sep): "se añade un producto y a los días nos damos cuenta [del
 * nombre mal escrito], y ahora es imposible cambiarlo". No era la base: no
 * existía esta pantalla. Tampoco se podía encender "Controlar lotes" después
 * de crear el producto, que es lo que hace que el POS y los tratamientos
 * descuenten del lote que vence primero.
 *
 * Qué se edita: nombre, categoría, presentación, stock mínimo y control de
 * lotes. El RPC `inventory_update_product` valida y guarda; un trigger deja
 * cada cambio en `inventory_product_changes`, que se muestra abajo.
 *
 * Qué NO se edita, a propósito:
 *   · afectación IGV — Rentabilidad netea TODAS las ventas pasadas con la
 *     afectación vigente; cambiarla reescribiría márgenes históricos;
 *   · unidad base — todo el kardex está expresado en ella;
 *   · precio de venta — tiene su propia ventana con historial (etiqueta).
 * Lo emitido no cambia: ventas confirmadas, comprobantes y recetas guardan
 * el nombre con el que salieron.
 */

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { History, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtQty, PRESENTATION_OPTIONS, type InventoryProduct } from "./types";

const schema = z.object({
  name: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(1, "El nombre no puede quedar vacío.")
        .max(120, "Máximo 120 caracteres.")
    ),
  category: z.string().max(60, "Máximo 60 caracteres."),
  presentation: z.string().trim().min(1, "Elige la presentación.").max(40),
  min_stock: z
    .string()
    .refine((v) => v.trim() === "" || (Number.isFinite(Number(v)) && Number(v) >= 0), {
      message: "Tiene que ser 0 o más.",
    }),
  track_lots: z.boolean(),
  reason: z.string().max(200),
});

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

export interface EditProductPayload {
  product: InventoryProduct;
  name: string;
  category: string | null;
  presentation: string;
  min_stock: number;
  track_lots: boolean;
  reason: string | null;
}

/** Fila de inventory_product_changes (mig 271). */
interface ProductChange {
  id: string;
  field: "name" | "category" | "presentation" | "min_stock" | "track_lots";
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

const FIELD_LABELS: Record<ProductChange["field"], string> = {
  name: "Nombre",
  category: "Categoría",
  presentation: "Presentación",
  min_stock: "Stock mínimo",
  track_lots: "Control de lotes",
};

function fmtValue(field: ProductChange["field"], v: string | null): string {
  if (v == null || v === "") return "—";
  if (field === "track_lots") return v === "true" ? "sí" : "no";
  if (field === "min_stock") return fmtQty(Number(v));
  return v;
}

const labelCls =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";
const selectCls =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-base shadow-sm outline-none focus:ring-1 focus:ring-ring md:text-sm";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: InventoryProduct | null;
  categories: string[];
  onSubmit: (payload: EditProductPayload) => Promise<boolean>;
}

export function EditProductModal({ open, onOpenChange, product, categories, onSubmit }: Props) {
  const [history, setHistory] = useState<ProductChange[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      category: "",
      presentation: "UND",
      min_stock: "0",
      track_lots: false,
      reason: "",
    },
  });
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = form;

  useEffect(() => {
    if (!open || !product) return;
    reset({
      name: product.name,
      category: product.category ?? "",
      presentation: product.presentation,
      min_stock: String(Number(product.min_stock ?? 0)),
      track_lots: product.track_lots,
      reason: "",
    });
  }, [open, product, reset]);

  // Historial de ediciones (mig 271). Si la tabla aún no existe, se omite.
  const productId = product?.id ?? null;
  useEffect(() => {
    if (!open || !productId) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("inventory_product_changes")
        .select("id, field, old_value, new_value, reason, changed_by, changed_at")
        .eq("product_id", productId)
        .order("changed_at", { ascending: false })
        .limit(30);
      if (cancelled || error) return;
      const rows = (data ?? []) as ProductChange[];
      setHistory(rows);
      const ids = [...new Set(rows.map((r) => r.changed_by).filter((x): x is string => !!x))];
      if (ids.length === 0) return;
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, full_name")
        .in("id", ids);
      if (cancelled) return;
      setNames(
        Object.fromEntries(
          ((profiles ?? []) as { id: string; full_name: string | null }[]).map((p) => [
            p.id,
            p.full_name ?? "",
          ])
        )
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, productId]);

  // La presentación actual puede no estar en la lista (productos importados).
  const presentationOptions = useMemo(() => {
    const cur = product?.presentation;
    return cur && !(PRESENTATION_OPTIONS as readonly string[]).includes(cur)
      ? [cur, ...PRESENTATION_OPTIONS]
      : [...PRESENTATION_OPTIONS];
  }, [product?.presentation]);

  if (!product) return null;

  const trackLots = watch("track_lots");
  const archived = product.is_discontinued;

  const submit = handleSubmit(async (v) => {
    const ok = await onSubmit({
      product,
      name: v.name,
      category: v.category.trim() || null,
      presentation: v.presentation,
      min_stock: v.min_stock.trim() === "" ? 0 : Number(v.min_stock),
      track_lots: v.track_lots,
      reason: v.reason.trim() || null,
    });
    if (ok) onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8 leading-tight">
            {archived ? "Renombrar producto archivado" : "Editar producto"}
          </DialogTitle>
          <DialogDescription>
            Las ventas, comprobantes y recetas ya emitidos conservan el nombre
            con el que salieron. El precio de venta se cambia desde la etiqueta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelCls} htmlFor="edit-name">
              Nombre
            </label>
            <Input id="edit-name" autoFocus {...register("name")} />
            {errors.name && (
              <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="edit-cat">
                Categoría
              </label>
              <Input
                id="edit-cat"
                list="edit-cat-options"
                placeholder="Sin categoría"
                {...register("category")}
              />
              <datalist id="edit-cat-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {errors.category && (
                <p className="mt-1 text-xs text-red-500">{errors.category.message}</p>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="edit-pres">
                Presentación
              </label>
              <select id="edit-pres" className={selectCls} {...register("presentation")}>
                {presentationOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="edit-min">
                Stock mínimo ({product.base_unit.toLowerCase()})
              </label>
              <Input
                id="edit-min"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                className="tabular-nums"
                {...register("min_stock")}
              />
              {errors.min_stock && (
                <p className="mt-1 text-xs text-red-500">{errors.min_stock.message}</p>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="edit-reason">
                Motivo (opcional)
              </label>
              <Input
                id="edit-reason"
                placeholder="Ej.: nombre mal escrito"
                maxLength={200}
                {...register("reason")}
              />
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-xl border border-border/60 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
              {...register("track_lots")}
            />
            <span>
              <span className="font-medium">Controlar lotes y vencimiento</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {trackLots
                  ? "El POS y los insumos de tratamientos descuentan del lote que vence primero (se puede cambiar en cada venta)."
                  : "Las ventas y los insumos bajan el stock pero no dicen de qué lote salieron: los lotes pueden quedar inflados."}
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </div>
        </form>

        {history.length > 0 && (
          <div className="border-t border-border/60 pt-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Historial
            </p>
            <ul className="space-y-1">
              {history.map((h) => (
                <li key={h.id} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <History className="mt-px h-3 w-3 shrink-0" />
                  <span>
                    {FIELD_LABELS[h.field]}: {fmtValue(h.field, h.old_value)} →{" "}
                    <span className="text-foreground">{fmtValue(h.field, h.new_value)}</span>
                    {" · "}
                    {new Date(h.changed_at).toLocaleDateString("es-PE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                    {h.changed_by && names[h.changed_by] ? ` · ${names[h.changed_by]}` : ""}
                    {h.reason ? ` — ${h.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
