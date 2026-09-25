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
 * El costo del lote NO se edita: el real vive en los movimientos, y es el que
 * se muestra (`entryCostByLot`).
 *
 * "Sin lote asignado" (mig 270): stock = Σ lotes + sin lote. Si entraron
 * unidades con el campo Lote vacío, aparecen aquí con su fecha y autor y el
 * editor las ASIGNA a un lote existente o nuevo. Si salieron unidades sin
 * decir de qué lote (lotes inflados), el editor las DESCUENTA de un lote tras
 * el conteo físico. En ambos casos el RPC asienta un par de ajustes que netea
 * a cero: cambia de qué lote son las unidades, nunca cuántas hay ni su costo.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, History, Loader2, PackageOpen, Pencil, X } from "lucide-react";
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
  compareLotsFefo,
  expiryStatus,
  fmtQty,
  formatPEN,
  monthToLastDay,
  TONE_CLS,
  type InventoryLot,
  type InventoryMovement,
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

/** Fila de inventory_lot_assignments (mig 270). */
interface LotAssignment {
  id: string;
  lot_id: string;
  quantity: number;
  lot_created: boolean;
  reason: string;
  created_by: string | null;
  created_at: string;
}

type HistoryItem = { id: string; lot_id: string; text: string; by: string | null; at: string; reason: string | null };

const QUICK_REASONS = ["Error de digitación", "Dato del proveedor corregido"];
const ASSIGN_REASONS = ["Conteo físico", "Entrada registrada sin lote"];
const NEW_LOT = "__nuevo__";

const fieldCls =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30";
const labelCls = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: InventoryProduct | null;
  /** Lotes de este producto (la página ya los tiene cargados). */
  lots: InventoryLot[];
  /** Saldo por lote, derivado de los movimientos. */
  stockByLot: Record<string, number>;
  /** Stock total del producto (Σ movimientos). */
  stock: number;
  /** Σ movimientos sin lote de este producto (ver `unlottedByProduct`). */
  unlotted: number;
  /** Entradas sin lote de este producto, recientes primero. */
  unlottedEntries: InventoryMovement[];
  /** Costo de compra por lote según el kardex (`entryCostByLot`). */
  entryCostByLot: Record<string, number>;
  /** Nombre de quien registró cada movimiento (user_id → nombre). */
  authors: Record<string, string>;
  expiryAlertDays: number;
  /** Editor de almacén (mig 267): corrige lotes y asigna unidades sin lote. */
  canEdit?: boolean;
  /** La página reemplaza el lote en su estado tras una corrección. */
  onLotUpdated?: (lot: InventoryLot) => void;
  /** Tras una asignación la página recarga lotes y kardex. */
  onAssigned?: () => Promise<void> | void;
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

/** Fecha y hora local de un timestamptz: "22/09/2026 13:44". */
function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })} ${d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Día local de un timestamptz (no el día UTC del ISO). */
function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function describeChange(c: LotChange): string {
  return c.field === "expiry_date"
    ? `Vencimiento ${fmtMonth(c.old_value)} → ${fmtMonth(c.new_value)}`
    : `Código ${c.old_value ?? "—"} → ${c.new_value ?? "—"}`;
}

function describeAssignment(a: LotAssignment, unit: string): string {
  const q = fmtQty(Math.abs(Number(a.quantity)));
  return Number(a.quantity) > 0
    ? `${a.lot_created ? "Lote creado con" : "Recibió"} ${q} ${unit} que estaban sin lote`
    : `Se descontaron ${q} ${unit} que salieron sin lote`;
}

export function LotsModal({
  open,
  onOpenChange,
  product,
  lots,
  stockByLot,
  stock,
  unlotted,
  unlottedEntries,
  entryCostByLot,
  authors,
  expiryAlertDays,
  canEdit = false,
  onLotUpdated,
  onAssigned,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [codeDraft, setCodeDraft] = useState("");
  const [monthDraft, setMonthDraft] = useState("");
  const [reasonDraft, setReasonDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<LotChange[]>([]);
  const [assignments, setAssignments] = useState<LotAssignment[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  // Formulario "Asignar a lote" / "Descontar de un lote".
  const [assigning, setAssigning] = useState(false);
  const [asgLot, setAsgLot] = useState("");
  const [asgCode, setAsgCode] = useState("");
  const [asgMonth, setAsgMonth] = useState("");
  const [asgQty, setAsgQty] = useState("");
  const [asgReason, setAsgReason] = useState("");
  const [historyTick, setHistoryTick] = useState(0);

  const lotIdsKey = lots.map((l) => l.id).sort().join(",");
  const productId = product?.id ?? null;

  // Historial de ESTOS lotes: correcciones (mig 269) y asignaciones (mig
  // 270). Lectura para cualquier miembro de la org; los nombres salen de
  // user_profiles, visible entre pares (mig 071). Si la tabla de la 270
  // todavía no existe, el error se ignora y la ventana funciona igual.
  useEffect(() => {
    if (!open || !productId) {
      setChanges([]);
      setAssignments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [chRes, asgRes] = await Promise.all([
        lotIdsKey
          ? supabase
              .from("inventory_lot_changes")
              .select("id, lot_id, field, old_value, new_value, reason, changed_by, changed_at")
              .in("lot_id", lotIdsKey.split(","))
              .order("changed_at", { ascending: false })
          : Promise.resolve({ data: [] as LotChange[] }),
        supabase
          .from("inventory_lot_assignments")
          .select("id, lot_id, quantity, lot_created, reason, created_by, created_at")
          .eq("product_id", productId)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      const rows = (chRes.data ?? []) as LotChange[];
      const asg = ("error" in asgRes && asgRes.error ? [] : (asgRes.data ?? [])) as LotAssignment[];
      setChanges(rows);
      setAssignments(asg);
      const ids = [
        ...new Set(
          [...rows.map((r) => r.changed_by), ...asg.map((a) => a.created_by)].filter(
            (x): x is string => !!x
          )
        ),
      ];
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
  }, [open, lotIdsKey, productId, historyTick]);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setAssigning(false);
    }
  }, [open]);

  // Con unidades primero y, dentro, FEFO. Los agotados bajan al final:
  // siguen siendo historial, pero ya no son decisión.
  const rows = useMemo(
    () =>
      lots
        .map((lot) => ({
          lot,
          stock: stockByLot[lot.id] ?? 0,
          exp: expiryStatus(lot.expiry_date, expiryAlertDays),
        }))
        .sort((a, b) => {
          const aEmpty = a.stock <= 0;
          const bEmpty = b.stock <= 0;
          if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
          return compareLotsFefo(a.lot, b.lot);
        }),
    [lots, stockByLot, expiryAlertDays]
  );

  if (!product) return null;

  const unit = product.base_unit.toLowerCase();
  const withStock = rows.filter((r) => r.stock > 0);
  const inLots = rows.reduce((acc, r) => acc + r.stock, 0);
  const hasUnlotted = Math.abs(unlotted) >= 0.001;

  // Entradas sin lote que explican el saldo positivo (las más recientes
  // hasta cubrirlo): fecha, cantidad, autor y costo.
  const sources: InventoryMovement[] = [];
  if (unlotted > 0) {
    let covered = 0;
    for (const m of unlottedEntries) {
      if (covered >= unlotted) break;
      sources.push(m);
      covered += Number(m.quantity);
    }
  }

  const history: HistoryItem[] = [
    ...changes.map((c) => ({
      id: c.id,
      lot_id: c.lot_id,
      text: describeChange(c),
      by: c.changed_by,
      at: c.changed_at,
      reason: c.reason,
    })),
    ...assignments.map((a) => ({
      id: a.id,
      lot_id: a.lot_id,
      text: describeAssignment(a, unit),
      by: a.created_by,
      at: a.created_at,
      reason: a.reason,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const startEdit = (lot: InventoryLot) => {
    setAssigning(false);
    setEditingId(lot.id);
    setCodeDraft(lot.lot_code);
    setMonthDraft(lot.expiry_date ? lot.expiry_date.slice(0, 7) : "");
    setReasonDraft("");
  };

  const startAssign = () => {
    setEditingId(null);
    setAssigning(true);
    setAsgReason("");
    setAsgCode("");
    setAsgMonth("");
    if (unlotted > 0) {
      // Por defecto: el lote que vence primero con saldo; sin lotes, uno nuevo.
      setAsgLot(withStock[0]?.lot.id ?? (rows[0]?.lot.id || NEW_LOT));
      setAsgQty(String(Number(unlotted.toFixed(3))));
    } else {
      const first = withStock[0];
      setAsgLot(first?.lot.id ?? "");
      setAsgQty(
        first ? String(Number(Math.min(-unlotted, first.stock).toFixed(3))) : ""
      );
    }
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

  const saveAssign = async () => {
    const reason = asgReason.trim();
    const qty = Number(asgQty.replace(",", "."));
    const isNew = asgLot === NEW_LOT;
    const code = asgCode.trim();
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Indica cuántas unidades");
      return;
    }
    if (!asgLot) {
      toast.error("Elige el lote");
      return;
    }
    if (isNew && !code) {
      toast.error("Escribe el código del lote nuevo");
      return;
    }
    if (reason.length < 3) {
      toast.error("Escribe el motivo");
      return;
    }
    const expiry = isNew && asgMonth ? monthToLastDay(asgMonth) : null;
    if (isNew && asgMonth && !expiry) {
      toast.error("Fecha de vencimiento inválida");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("inventory_assign_unlotted", {
      p_product_id: product.id,
      p_quantity: unlotted > 0 ? qty : -qty,
      p_lot_id: isNew ? null : asgLot,
      p_new_lot_code: isNew ? code : null,
      p_new_expiry_date: expiry,
      p_reason: reason,
    });
    if (error) {
      setSaving(false);
      const missing = error.code === "42883" || error.code === "PGRST202";
      toast.error(
        missing
          ? "Falta aplicar la actualización de base de datos (mig 270)"
          : error.message.includes("forbidden")
            ? "No tienes permiso para corregir lotes"
            : error.message
      );
      return;
    }
    await onAssigned?.();
    setSaving(false);
    setAssigning(false);
    setHistoryTick((t) => t + 1);
    toast.success(
      unlotted > 0
        ? `${fmtQty(qty)} ${unit} asignadas al lote ${isNew ? code : (lots.find((l) => l.id === asgLot)?.lot_code ?? "")}`
        : `${fmtQty(qty)} ${unit} descontadas del lote ${lots.find((l) => l.id === asgLot)?.lot_code ?? ""}`,
      { description: "El stock no cambió: solo de qué lote son las unidades." }
    );
  };

  const header = !hasUnlotted
    ? withStock.length === 0
      ? "Sin lotes con unidades disponibles."
      : `${fmtQty(inLots)} ${unit} en ${withStock.length === 1 ? "1 lote" : `${withStock.length} lotes`}.`
    : unlotted > 0
      ? `${fmtQty(stock)} ${unit} · ${fmtQty(Math.max(inLots, 0))} en ${
          withStock.length === 1 ? "1 lote" : `${withStock.length} lotes`
        } · ${fmtQty(unlotted)} sin lote.`
      : `${fmtQty(stock)} ${unit} en stock, pero los lotes suman ${fmtQty(inLots)}: ${fmtQty(-unlotted)} de más.`;

  const assignForm = (
    <div className="w-full space-y-2">
      <div className="grid grid-cols-[1fr_88px] gap-2">
        <div>
          <label className={labelCls}>{unlotted > 0 ? "Asignar al lote" : "Descontar del lote"}</label>
          <select
            value={asgLot}
            onChange={(e) => setAsgLot(e.target.value)}
            className={fieldCls}
          >
            {unlotted < 0 && !asgLot && <option value="">Elige un lote…</option>}
            {(unlotted > 0 ? rows : withStock).map(({ lot, stock: s }) => (
              <option key={lot.id} value={lot.id}>
                {lot.lot_code === "SIN-LOTE" ? "Sin código" : lot.lot_code} · vence {fmtMonth(lot.expiry_date)} ·{" "}
                {s > 0 ? `${fmtQty(s)} ${unit}` : "agotado"}
              </option>
            ))}
            {unlotted > 0 && <option value={NEW_LOT}>Lote nuevo…</option>}
          </select>
        </div>
        <div>
          <label className={labelCls}>Cantidad</label>
          <input
            value={asgQty}
            onChange={(e) => setAsgQty(e.target.value)}
            inputMode="decimal"
            className={cn(fieldCls, "tabular-nums")}
          />
        </div>
      </div>
      {asgLot === NEW_LOT && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Código de lote</label>
            <input
              value={asgCode}
              onChange={(e) => setAsgCode(e.target.value)}
              maxLength={60}
              autoFocus
              placeholder="Como figura en la caja"
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>Vence</label>
            <input
              type="month"
              value={asgMonth}
              onChange={(e) => setAsgMonth(e.target.value)}
              className={fieldCls}
            />
          </div>
        </div>
      )}
      <div>
        <label className={labelCls}>Motivo (queda en el historial)</label>
        <input
          value={asgReason}
          onChange={(e) => setAsgReason(e.target.value)}
          maxLength={200}
          placeholder="Ej.: conteo físico"
          className={fieldCls}
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveAssign();
            if (e.key === "Escape") setAssigning(false);
          }}
        />
        <div className="mt-1 flex flex-wrap gap-1">
          {ASSIGN_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setAsgReason(r)}
              className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        El stock total no cambia: solo se registra de qué lote son estas
        unidades. Queda en el kardex como “Asignación de lote”.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setAssigning(false)}
          disabled={saving}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs hover:bg-accent disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" /> Cancelar
        </button>
        <button
          type="button"
          onClick={() => void saveAssign()}
          disabled={saving}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {unlotted > 0 ? "Asignar" : "Descontar"}
        </button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8 leading-tight">{product.name}</DialogTitle>
          <DialogDescription>{header}</DialogDescription>
        </DialogHeader>

        {/* Sin lote asignado / salidas sin lote (mig 270) */}
        {hasUnlotted && (
          <div
            className={cn(
              "rounded-xl border px-3 py-2.5",
              unlotted > 0
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-red-500/30 bg-red-500/5"
            )}
          >
            {assigning ? (
              assignForm
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      {unlotted > 0 ? (
                        <PackageOpen className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                      )}
                      {unlotted > 0 ? "Sin lote asignado" : "Salieron sin lote"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {unlotted > 0
                        ? "Entraron sin código de lote: no aparecen en Vencimientos."
                        : `Se vendieron o aplicaron sin indicar el lote, así que los lotes muestran ${fmtQty(-unlotted)} ${unit} que ya no están.`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {unlotted > 0 ? fmtQty(unlotted) : `−${fmtQty(-unlotted)}`}
                  </span>
                </div>
                {sources.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {sources.map((m) => (
                      <li key={m.id} className="text-[11px] text-muted-foreground">
                        +{fmtQty(Number(m.quantity))} el {fmtStamp(m.created_at)}
                        {m.created_by && authors[m.created_by] ? ` · ${authors[m.created_by]}` : ""}
                        {m.unit_cost != null ? ` · ${formatPEN(Number(m.unit_cost))} sin IGV` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {canEdit && (unlotted > 0 || withStock.length > 0) && (
                  <button
                    type="button"
                    onClick={startAssign}
                    className="mt-2 inline-flex h-8 items-center rounded-lg border border-border bg-background px-3 text-xs font-semibold hover:bg-accent"
                  >
                    {unlotted > 0 ? "Asignar a lote" : "Descontar de un lote"}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {rows.length === 0 ? (
          !hasUnlotted && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Este producto no tiene lotes registrados. Al registrar una entrada
              puedes indicar el lote y su vencimiento.
            </p>
          )
        ) : (
          <ul className="space-y-2">
            {rows.map(({ lot, stock: lotStock, exp }) => {
              const cost = entryCostByLot[lot.id] ?? (lot.unit_cost != null ? Number(lot.unit_cost) : null);
              const lotHistory = history.filter((h) => h.lot_id === lot.id);
              return (
              <li
                key={lot.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5",
                  lotStock <= 0 && "opacity-55"
                )}
              >
                {editingId === lot.id ? (
                  <div className="w-full space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Código de lote</label>
                        <input
                          value={codeDraft}
                          onChange={(e) => setCodeDraft(e.target.value)}
                          maxLength={60}
                          autoFocus
                          className={fieldCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Vence</label>
                        <input
                          type="month"
                          value={monthDraft}
                          onChange={(e) => setMonthDraft(e.target.value)}
                          className={fieldCls}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Motivo (queda en el historial)</label>
                      <input
                        value={reasonDraft}
                        onChange={(e) => setReasonDraft(e.target.value)}
                        maxLength={200}
                        placeholder="Ej.: error de digitación"
                        className={fieldCls}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void save(lot);
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
                        onClick={() => void save(lot)}
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
                    {lot.lot_code === "SIN-LOTE" ? "Sin código" : lot.lot_code}
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
                  {/* Costo de compra SIN IGV según el kardex (la entrada
                      vigente del lote), no la copia informativa del lote. */}
                  {cost != null && (
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      Comprado a{" "}
                      <span className="font-medium text-foreground">
                        {formatPEN(cost)}
                      </span>{" "}
                      <span className="text-[10px]">sin IGV</span>
                      {lot.supplier ? ` · ${lot.supplier}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {exp.chip && lotStock > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        TONE_CLS[exp.tone]
                      )}
                    >
                      {exp.label}
                    </span>
                  )}
                  <span
                    className={cn(
                      "text-sm font-bold tabular-nums",
                      lotStock < 0 && "text-red-600 dark:text-red-400"
                    )}
                    title={lotStock < 0 ? "Salió más de lo que el lote tenía" : undefined}
                  >
                    {lotStock < 0
                      ? `Descuadre −${fmtQty(-lotStock)}`
                      : lotStock === 0
                        ? "Agotado"
                        : fmtQty(lotStock)}
                  </span>
                </div>
                </>
                )}
                {editingId !== lot.id && lotHistory.length > 0 && (
                  <ul className="w-full space-y-0.5 border-t border-border/50 pt-1.5">
                    {lotHistory.map((h) => (
                      <li key={h.id} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                        <History className="mt-px h-3 w-3 shrink-0" />
                        <span>
                          {h.text} · {fmtDay(h.at)}
                          {h.by && names[h.by] ? ` · ${names[h.by]}` : ""}
                          {h.reason ? ` — ${h.reason}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
