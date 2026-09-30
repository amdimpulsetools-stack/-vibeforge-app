"use client";

/**
 * Banner "adelanto a cuenta" (mig 273, cobro-doble-sin-freno). En el sidebar
 * de una cita VIVA: si la paciente dejó pagos marcados "a cuenta de la
 * próxima cita" en una cita CANCELADA, se avisa antes de volver a cobrarle
 * y se ofrece trasladarlos a esta cita con un toque.
 *
 * No calcula ni reescribe ninguna fórmula: lista lo que devuelve
 * `fetchTransferableDeposits` (solo cancel_money='a_cuenta', plata clínica)
 * y el traslado lo hace la RPC `appointment_transfer_payments` con el
 * cliente del usuario. Silencioso si no hay nada o si la mig no está.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  fetchTransferableDeposits,
  transferDeposits,
  type TransferableDeposit,
} from "@/lib/appointments/deposits";

const fmt = (n: number) => `S/ ${n.toFixed(2)}`;
const ddmm = (ymd: string) => {
  const [, m, d] = ymd.split("-");
  return d && m ? `${d}/${m}` : ymd;
};

export function DepositBanner({
  appointmentId,
  patientId,
  canApply,
  onApplied,
}: {
  appointmentId: string;
  patientId: string;
  /** Sin permiso (doctor / solo lectura) el aviso se ve pero sin botón. */
  canApply: boolean;
  /** Se llama tras un traslado OK (el sidebar refresca sus pagos). */
  onApplied: () => void;
}) {
  const [deposits, setDeposits] = useState<TransferableDeposit[]>([]);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchTransferableDeposits(createClient(), patientId, {
        excludeAppointmentId: appointmentId,
      });
      return rows;
    } catch {
      return [];
    }
  }, [appointmentId, patientId]);

  useEffect(() => {
    let cancelled = false;
    setDeposits([]);
    void load().then((rows) => {
      if (!cancelled) setDeposits(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const apply = async (d: TransferableDeposit) => {
    if (applyingId) return;
    setApplyingId(d.appointmentId);
    try {
      const res = await transferDeposits(createClient(), d.appointmentId, appointmentId);
      if (!res.ok) {
        toast.warning("No se pudo aplicar el adelanto", {
          description: res.error ?? "Inténtalo de nuevo en un momento.",
        });
        return;
      }
      if (res.movedCount === 0) {
        toast.info("Ese adelanto ya no tiene pagos por trasladar");
      } else {
        toast.success(`${fmt(res.amount)} aplicados a esta cita`, {
          description:
            res.einvoicesMoved > 0
              ? "El comprobante del adelanto también pasó a esta cita."
              : undefined,
        });
        onApplied();
      }
      setDeposits(await load());
    } finally {
      setApplyingId(null);
    }
  };

  if (deposits.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {deposits.map((d) => (
        <div
          key={d.appointmentId}
          className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300"
        >
          <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p>
              Esta paciente tiene <strong>{fmt(d.amount)}</strong> a cuenta de la cita
              cancelada del {ddmm(d.appointmentDate)}
              {d.serviceName ? ` (${d.serviceName})` : ""}.
            </p>
            {canApply && (
              <button
                type="button"
                onClick={() => void apply(d)}
                disabled={applyingId !== null}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60 md:min-h-0"
              >
                {applyingId === d.appointmentId && <Loader2 className="h-3 w-3 animate-spin" />}
                Aplicar a esta cita
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
