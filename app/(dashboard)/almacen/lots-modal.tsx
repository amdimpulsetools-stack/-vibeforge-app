"use client";

/**
 * Vista rápida de los lotes de UN producto.
 *
 * La tabla solo muestra el lote que vence primero, y la pestaña Vencimientos
 * apila los de todos los productos por urgencia. Faltaba la pregunta del día a
 * día: "de ESTE medicamento, ¿qué tandas tengo y cuál se me vence antes?".
 *
 * Recibe los lotes y los saldos ya calculados por la página. El saldo por lote
 * sale del mismo array de movimientos que alimenta el kardex, así que no puede
 * desincronizarse de él.
 *
 * Corregir (mig 269): el editor de almacén puede corregir el CÓDIGO y el
 * VENCIMIENTO de un lote mal digitado, con motivo obligatorio. Ninguno de los
 * dos entra en una cuenta (stock = Σ movimientos, costo congelado en cada
 * movimiento), así que corregirlos no mueve stock ni costos. Cada corrección
 * queda en `inventory_lot_changes` (la escribe un trigger) y se muestra aquí:
 * un vencimiento es un dato sanitario y "alargarlo" tiene que dejar rastro.
 * El costo del lote NO se edita: el real vive en los movimientos.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, History, Loader2, Pencil, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
  formatPEN,
  monthToLastDay,
  TONE_CLS,
  type InventoryLot,
  type InventoryProduct,
} from "./types";

/** Fila de inventory_lot_changes (mig 269). */
interface LotChange {
  id: string;
  lot_id: string;
  field: "lot_code" | "expiry_date";
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

const QUICK_REASONS = ["Error de digitación", "Dato del proveedor corregido"];

const fieldCls =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: InventoryProduct | null;
  /** Lotes de este producto (la página ya los tiene cargados). */
  lots: InventoryLot[];
  /** Saldo por lote, derivado de los movimientos. */
  stockByLot: Record<string, number>;
  expiryAlertDays: number;
  /** Editor de almacén (mig 267): puede corregir código y vencimiento. */
  canEdit?: boolean;
  /** La página reemplaza el lote en su estado tras una corrección. */
  onLotUpdated?: (lot: InventoryLot) => void;
}

/** Vencimiento en dd/mm/aaaa — el formato de Perú, no el del navegador. */
function fmtExpiry(iso: string | null): string {
  if (!iso) return "Sin vencimiento";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** "2027-03-31" → "03/2027": el vencimiento se maneja por mes, como en la caja. */
function fmtMonth(iso: string | null): string {
  if (!iso) return "sin vencimiento";
  const [y, m] = iso.slice(0, 10).split("-");
  return `${m}/${y}`;
}

function describeChange(c: LotChange): string {
  return c.field === "expiry_date"
    ? `Vencimiento ${fmtMonth(c.old_value)} → ${fmtMonth(c.new_value)}`
    : `Código ${c.old_value ?? "—"} → ${c.new_value ?? "—"}`;
}

export function LotsModal({
  open,
  onOpenChange,
  product,
  lots,
  stockByLot,
  expiryAlertDays,
  canEdit = false,
  onLotUpdated,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [codeDraft, setCodeDraft] = useState("");
  const [monthDraft, setMonthDraft] = useState("");
  const [reasonDraft, setReasonDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<LotChange[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const lotIdsKey = lots.map((l) => l.id).sort().join(",");

  // Historial de correcciones de ESTOS lotes (mig 269). Lectura para
  // cualquier miembro de la org; los nombres salen de user_profiles, visible
  // entre pares (mig 071).
  useEffect(() => {
    if (!open || !lotIdsKey) {
      setChanges([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("inventory_lot_changes")
        .select("id, lot_id, field, old_value, new_value, reason, changed_by, changed_at")
        .in("lot_id", lotIdsKey.split(","))
        .order("changed_at", { ascending: false });
      const rows = (data ?? []) as LotChange[];
      if (cancelled) return;
      setChanges(rows);
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
  }, [open, lotIdsKey]);

  useEffect(() => {
    if (!open) setEditingId(null);
  }, [open]);

  if (!product) return null;

  const startEdit = (lot: InventoryLot) => {
    setEditingId(lot.id);
    setCodeDraft(lot.lot_code);
    setMonthDraft(lot.expiry_date ? lot.expiry_date.slice(0, 7) : "");
    setReasonDraft("");
  };

  const save = async (lot: InventoryLot) => {
    const code = codeDraft.trim();
    const reason = reasonDraft.trim();
    if (!code) {
      toast.error("El código de lote no puede quedar vacío");
      return;
    }
    if (reason.length < 3) {
      toast.error("Escribe el motivo de la corrección");
      return;
    }
    // Se guarda el ÚLTIMO día del mes, igual que al registrar la entrada.
    const expiry = monthDraft ? monthToLastDay(monthDraft) : null;
    if (monthDraft && !expiry) {
      toast.error("Fecha de vencimiento inválida");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("inventory_update_lot", {
      p_lot_id: lot.id,
      p_lot_code: code,
      p_expiry_date: expiry,
      p_reason: reason,
    });
    setSaving(false);
    if (error || !data) {
      toast.error(
        error?.message?.includes("forbidden")
          ? "No tienes permiso para corregir lotes"
          : error?.message ?? "No se pudo corregir el lote"
      );
      return;
    }
    const updated = data as unknown as InventoryLot;
    onLotUpdated?.(updated);
    // Refleja la corrección en el historial sin volver a consultar.
    const now = new Date().toISOString();
    const local: LotChange[] = [];
    if (updated.lot_code !== lot.lot_code) {
      local.push({ id: `tmp-c-${lot.id}-${now}`, lot_id: lot.id, field: "lot_code", old_value: lot.lot_code, new_value: updated.lot_code, reason, changed_by: null, changed_at: now });
    }
    if ((updated.expiry_date ?? null) !== (lot.expiry_date ?? null)) {
      local.push({ id: `tmp-e-${lot.id}-${now}`, lot_id: lot.id, field: "expiry_date", old_value: lot.expiry_date, new_value: updated.expiry_date, reason, changed_by: null, changed_at: now });
    }
    setChanges((prev) => [...local, ...prev]);
    setEditingId(null);
    toast.success("Lote corregido");
  };

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
                  "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5",
                  stock <= 0 && "opacity-55"
                )}
              >
                {editingId === lot.id ? (
                  <div className="w-full space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Código de lote
                        </label>
                        <input
                          value={codeDraft}
                          onChange={(e) => setCodeDraft(e.target.value)}
                          maxLength={60}
                          autoFocus
                          className={fieldCls}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Vence
                        </label>
                        <input
                          type="month"
                          value={monthDraft}
                          onChange={(e) => setMonthDraft(e.target.value)}
                          className={fieldCls}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Motivo (queda en el historial)
                      </label>
                      <input
                        value={reasonDraft}
                        onChange={(e) => setReasonDraft(e.target.value)}
                        maxLength={200}
                        placeholder="Ej.: error de digitación"
                        className={fieldCls}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") save(lot);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <div className="mt-1 flex flex-wrap gap-1">
                        {QUICK_REASONS.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setReasonDraft(r)}
                            className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        disabled={saving}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs hover:bg-accent disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" /> Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => save(lot)}
                        disabled={saving}
                        className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                <>
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-sm font-semibold">
                    {lot.lot_code === "SIN-LOTE" ? "Sin lote" : lot.lot_code}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => startEdit(lot)}
                        aria-label="Corregir código o vencimiento del lote"
                        title="Corregir código o vencimiento"
                        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fmtExpiry(lot.expiry_date)}
                  </p>
                  {/* Costo del lote: la compra se digita SIN IGV (regla del
                      kardex). Antes estaba guardado pero no se veía. */}
                  {lot.unit_cost != null && (
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      Comprado a{" "}
                      <span className="font-medium text-foreground">
                        {formatPEN(Number(lot.unit_cost))}
                      </span>{" "}
                      <span className="text-[10px]">sin IGV</span>
                      {lot.supplier ? ` · ${lot.supplier}` : ""}
                    </p>
                  )}
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
                </>
                )}
                {editingId !== lot.id && changes.some((c) => c.lot_id === lot.id) && (
                  <ul className="w-full space-y-0.5 border-t border-border/50 pt-1.5">
                    {changes
                      .filter((c) => c.lot_id === lot.id)
                      .map((c) => (
                        <li key={c.id} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                          <History className="mt-px h-3 w-3 shrink-0" />
                          <span>
                            {describeChange(c)} · {fmtExpiry(c.changed_at.slice(0, 10))}
                            {c.changed_by && names[c.changed_by] ? ` · ${names[c.changed_by]}` : ""}
                            {c.reason ? ` — ${c.reason}` : ""}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
