"use client";

/**
 * "Anular pago erróneo" (mig 284). Botón pequeño para owner/admin junto a un
 * pago de la ficha de cita o de la paciente. Al pulsarlo pide el motivo en
 * línea (sin modal encima del panel) y llama a la RPC `patient_payment_void`,
 * que valida todo lo que no se puede anular (Farmacia, tratamiento, con
 * comprobante, con devolución, efectivo de turno cerrado) y deja rastro.
 *
 * Nunca calcula dinero: tras anular, el padre vuelve a cargar los pagos.
 */

import { useState } from "react";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

interface VoidPaymentButtonProps {
  paymentId: string;
  amount: number;
  /** Solo dirección ve el botón; la RPC lo vuelve a comprobar. */
  canVoid: boolean;
  onVoided: () => void;
  className?: string;
}

export function VoidPaymentButton({ paymentId, amount, canVoid, onVoided, className }: VoidPaymentButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!canVoid) return null;

  const submit = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      toast.error("Escribe el motivo de la anulación (mínimo 5 caracteres).");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("patient_payment_void", {
      p_payment_id: paymentId,
      p_reason: trimmed,
    });
    setBusy(false);
    if (error) {
      // Mig 284 sin aplicar: la RPC no existe.
      const msg = /patient_payment_void/i.test(error.message ?? "") && /not find|does not exist|schema cache/i.test(error.message ?? "")
        ? "Anular pagos aún no está disponible en esta base (falta la mig 284)."
        : error.message;
      toast.error(msg);
      return;
    }
    toast.success(`Pago de S/ ${amount.toFixed(2)} anulado`, {
      description: "Quedó anotado en la cita o en la ficha con tu motivo.",
    });
    setOpen(false);
    setReason("");
    onVoided();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Anular pago registrado por error (solo dirección)"
        aria-label="Anular pago"
        className={
          className ??
          "ml-1 shrink-0 rounded-md p-1 text-muted-foreground/70 hover:bg-red-500/10 hover:text-red-600 transition-colors"
        }
      >
        <Ban className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-red-500/30 bg-red-500/5 p-2 space-y-2">
      <p className="text-[11px] font-medium text-red-700 dark:text-red-400">
        Anular pago de S/ {amount.toFixed(2)}. El pago se elimina y queda una nota con tu motivo.
      </p>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (ej. anticipo registrado por error, nunca se cobró)"
        maxLength={200}
        autoFocus
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-500/40"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setReason(""); }}
          disabled={busy}
          className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || reason.trim().length < 5}
          className="flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Anular pago
        </button>
      </div>
    </div>
  );
}
