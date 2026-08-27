"use client";

/**
 * Diálogo "¿qué pasó con el dinero?" — aparece al cancelar una cita que
 * tiene pagos registrados. Hallazgo del founder (27-ago): cancelaba citas
 * con pagos y el ingreso seguía contando, sin que nadie preguntara si la
 * plata se devolvió.
 *
 * El diálogo NO toca dinero por sí mismo: devuelve la decisión al sidebar,
 * que primero cancela la cita y después (si aplica) registra la devolución
 * vía el RPC transaccional `appointment_cancel_refund` (mig 230):
 *   · org con Caja activa → movimiento 'devolucion' en el turno abierto
 *     (sin turno abierto el RPC rechaza con "Abre caja…")
 *   · org sin Caja → anulación de pagos con rastro
 * Nunca pagos negativos (línea roja de F3).
 */

import { useEffect, useState } from "react";
import { Banknote, CreditCard, Loader2, Undo2, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface CancelRefundDecision {
  /** null = el pago se queda (no se toca nada). */
  refund: { amount: number; tender: "efectivo" | "electronico" } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Total pagado de la cita (S/). */
  totalPaid: number;
  /** Deshabilita los controles mientras el sidebar procesa. */
  busy?: boolean;
  onConfirm: (decision: CancelRefundDecision) => void;
}

const fmt = (n: number) => `S/ ${n.toFixed(2)}`;

export function CancelRefundDialog({
  open,
  onOpenChange,
  totalPaid,
  busy = false,
  onConfirm,
}: Props) {
  const [mode, setMode] = useState<"keep" | "refund">("keep");
  const [amountStr, setAmountStr] = useState("");
  const [tender, setTender] = useState<"efectivo" | "electronico">("efectivo");

  // Cada apertura arranca limpia, con el total pre-cargado para la
  // devolución completa (el caso común).
  useEffect(() => {
    if (open) {
      setMode("keep");
      setAmountStr(totalPaid.toFixed(2));
      setTender("efectivo");
    }
  }, [open, totalPaid]);

  const amount = Number(amountStr);
  const amountValid =
    Number.isFinite(amount) && amount > 0 && amount <= totalPaid + 0.001;

  const confirm = () => {
    if (mode === "keep") {
      onConfirm({ refund: null });
    } else if (amountValid) {
      onConfirm({ refund: { amount: Math.round(amount * 100) / 100, tender } });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Esta cita tiene pagos registrados</DialogTitle>
          <DialogDescription>
            Hay <span className="font-semibold text-foreground">{fmt(totalPaid)}</span>{" "}
            cobrados en esta cita. Cancelarla no elimina el ingreso — dinos qué
            pasó con ese dinero.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("keep")}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
              mode === "keep"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-accent"
            )}
          >
            <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="block text-sm font-medium">El pago se queda</span>
              <span className="block text-xs text-muted-foreground">
                La clínica retiene el cobro (penalidad, a cuenta de otra cita…).
                El ingreso se mantiene tal cual.
              </span>
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("refund")}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
              mode === "refund"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-accent"
            )}
          >
            <Undo2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="block text-sm font-medium">
                Se devolvió al paciente
              </span>
              <span className="block text-xs text-muted-foreground">
                Se registra la devolución: en el turno de caja si tu clínica usa
                Caja, o anulando el pago si no.
              </span>
            </span>
          </button>

          {mode === "refund" && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Monto devuelto (máx. {fmt(totalPaid)})
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  max={totalPaid}
                  step="0.01"
                  value={amountStr}
                  disabled={busy}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                {!amountValid && amountStr !== "" && (
                  <p className="mt-1 text-xs text-destructive">
                    Debe ser mayor a 0 y no superar lo pagado.
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  ¿Cómo se devolvió?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setTender("efectivo")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                      tender === "efectivo"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <Banknote className="h-3.5 w-3.5" />
                    Efectivo
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setTender("electronico")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                      tender === "electronico"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Yape / tarjeta / transferencia
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
          >
            Volver
          </button>
          <button
            type="button"
            disabled={busy || (mode === "refund" && !amountValid)}
            onClick={confirm}
            className="flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "keep"
              ? "Cancelar cita (el pago se queda)"
              : "Cancelar cita y registrar devolución"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
