"use client";

/**
 * Movimiento de caja: la plata que entra o sale del cajón sin ser un cobro.
 *
 * Tres gestos, un solo formulario. El signo NO se pide: lo decide el tipo
 * (egreso y sangría salen, ingreso y reposición entran) y el CHECK
 * `cash_mov_sign_chk` de la 214 lo verifica en la base. La cajera escribe
 * "50" y el sistema sabe si son −50 o +50.
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
import { Loader2 } from "lucide-react";
import {
  MOVEMENT_LABEL,
  REASONS_BY_TYPE,
  REASON_LABEL,
  formatPEN,
  type MovementType,
} from "./types";

export interface MovementPayload {
  movementType: MovementType;
  /** Siempre positivo: el signo lo pone quien graba, según el tipo. */
  amount: number;
  reasonCode: string | null;
  notes: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null mientras el modal está cerrado. */
  movementType: MovementType | null;
  onSubmit: (payload: MovementPayload) => Promise<boolean>;
}

const labelCls =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

const HINT: Partial<Record<MovementType, string>> = {
  egreso: "Sale del cajón: compras, movilidad, servicios.",
  sangria: "Retiro a banco o bóveda. Sigue siendo tu responsabilidad hasta el cierre.",
  ingreso: "Entra al cajón sin ser un cobro a un paciente.",
  reposicion: "Devuelves al cajón un dinero que había salido.",
};

export function MovementModal({
  open,
  onOpenChange,
  movementType,
  onSubmit,
}: Props) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasons = useMemo(
    () => (movementType ? REASONS_BY_TYPE[movementType] : []),
    [movementType]
  );

  // El motivo es obligatorio para egreso (CHECK cash_mov_reason_chk). En los
  // demás tipos se ofrece igual porque un movimiento sin motivo es un
  // movimiento que nadie sabrá explicar en tres semanas.
  const reasonRequired = movementType === "egreso";

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setReason(movementType ? (REASONS_BY_TYPE[movementType][0] ?? "") : "");
    setNotes("");
    setError(null);
  }, [open, movementType]);

  if (!movementType) return null;

  const value = Number(amount.replace(",", "."));
  const valid = Number.isFinite(value) && value > 0 && (!reasonRequired || !!reason);
  const outflow = movementType === "egreso" || movementType === "sangria";

  async function submit() {
    if (!valid || saving || !movementType) return;
    setSaving(true);
    setError(null);
    const ok = await onSubmit({
      movementType,
      amount: value,
      reasonCode: reason || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (ok) onOpenChange(false);
    else setError("No se pudo registrar el movimiento. Intenta de nuevo.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{MOVEMENT_LABEL[movementType]}</DialogTitle>
          <DialogDescription>{HINT[movementType]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>Monto</label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">S/</span>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.10"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
            {value > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                El cajón {outflow ? "baja" : "sube"} {formatPEN(value)}.
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>
              Motivo{reasonRequired ? "" : " (opcional)"}
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {!reasonRequired && <option value="">Sin motivo</option>}
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABEL[r] ?? r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Notas (opcional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. taxi para muestra al laboratorio"
              maxLength={200}
            />
          </div>

          {error && (
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} disabled={!valid || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
