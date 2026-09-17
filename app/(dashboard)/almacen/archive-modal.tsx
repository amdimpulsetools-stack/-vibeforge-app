"use client";

/**
 * Archivar un producto — o eliminarlo si está virgen (mig 264).
 *
 * Caso real: "Pergoveris 75 UI" quedó creado por la carga masiva sin un solo
 * movimiento y no había forma de sacarlo de la lista. La regla la decide el
 * RPC, no este modal: con historial (movimientos, lotes, ventas,
 * comprobantes) se ARCHIVA y se puede restaurar; sin nada de eso se ELIMINA
 * de verdad con auditoría. El modal solo anticipa qué va a pasar con los
 * datos que ya están en memoria y pide el motivo cuando toca.
 *
 * Mismo patrón que `price-modal.tsx`.
 */
import { useEffect, useState } from "react";
import { Archive, Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";
import { fillTemplate, fmtQty, type InventoryProduct } from "./types";

export interface ArchivePayload {
  product: InventoryProduct;
  reason: string | null;
}

/** Lo que la pantalla sabe del historial del producto (kardex en memoria). */
export interface ProductHistory {
  movements: number;
  lots: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: InventoryProduct | null;
  /**
   * null = no se puede saber (el kardex llegó al tope de carga): se muestra
   * "Archivar" y el RPC decide.
   */
  history: ProductHistory | null;
  /** Stock actual (SUM de movimientos). Con stock ≠ 0 el RPC rechaza archivar. */
  stock: number;
  onSubmit: (payload: ArchivePayload) => Promise<boolean>;
}

const labelCls =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";
const inputCls =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-base shadow-sm outline-none focus:ring-1 focus:ring-ring md:text-sm";

const REASON_MIN = 3;

export function ArchiveModal({ open, onOpenChange, product, history, stock, onSubmit }: Props) {
  const { t } = useLanguage();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setSaving(false);
  }, [open, product]);

  if (!product) return null;

  const willDelete = history !== null && history.movements === 0 && history.lots === 0;
  const stockBlocks = !willDelete && Math.abs(stock) > 0.0005;
  const trimmed = reason.trim();
  const reasonOk = willDelete || trimmed.length >= REASON_MIN;
  const canSubmit = reasonOk && !stockBlocks && !saving;

  const explanation =
    history === null
      ? t("almacen.archive.unknown_history")
      : willDelete
        ? t("almacen.archive.no_history")
        : fillTemplate(t("almacen.archive.has_history"), {
            movements: history.movements,
            lots: history.lots,
          });

  const handleSave = async () => {
    if (!canSubmit) return;
    setSaving(true);
    const ok = await onSubmit({ product, reason: trimmed || null });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {willDelete ? (
              <Trash2 className="h-4 w-4 text-destructive" />
            ) : (
              <Archive className="h-4 w-4 text-muted-foreground" />
            )}
            {willDelete ? t("almacen.archive.title_delete") : t("almacen.archive.title_archive")}
          </DialogTitle>
          <DialogDescription>
            {product.name}
            {product.presentation ? ` · ${product.presentation}` : ""}
          </DialogDescription>
        </DialogHeader>

        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-xs leading-snug",
            willDelete
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-border/60 bg-muted/40 text-muted-foreground"
          )}
        >
          {explanation}
        </p>

        {stockBlocks && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium leading-snug text-amber-700 dark:text-amber-400">
            {fillTemplate(t("almacen.archive.stock_blocks"), {
              stock: fmtQty(stock),
              unit: product.base_unit.toLowerCase(),
            })}
          </p>
        )}

        <div>
          <label htmlFor="archive-reason" className={labelCls}>
            {willDelete ? t("almacen.archive.reason_optional") : t("almacen.archive.reason_label")}
          </label>
          <input
            id="archive-reason"
            type="text"
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("almacen.archive.reason_placeholder")}
            className={inputCls}
            disabled={stockBlocks}
            autoFocus={!stockBlocks}
          />
          {!willDelete && !stockBlocks && trimmed.length > 0 && trimmed.length < REASON_MIN && (
            <p className="mt-1 text-[11px] text-destructive">{t("almacen.archive.reason_min")}</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("almacen.archive.cancel")}
          </Button>
          <Button
            variant={willDelete ? "destructive" : "default"}
            onClick={() => void handleSave()}
            disabled={!canSubmit}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {willDelete ? t("almacen.archive.confirm_delete") : t("almacen.archive.confirm_archive")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
