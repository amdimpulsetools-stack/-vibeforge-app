"use client";

/**
 * Bandeja "Fuera de turno": cobros que entraron sin caja abierta y que por
 * tanto no están en ningún arqueo hasta que se atribuyan a un turno.
 *
 * La usan dos pantallas: Historial (admin, todos los cobros sin turno desde
 * que el módulo está encendido) y Resumen (quien tiene su caja abierta,
 * mig 272: recepción pasa a SU caja los cobros de los últimos 7 días — el
 * caso real fue un cobro en efectivo registrado minutos antes de abrir).
 */

import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDateTime, formatPEN, patientName, type ShiftPayment } from "./types";

interface Props {
  orphanPayments: ShiftPayment[];
  /** Turno abierto al que se pueden atribuir; null si no hay ninguno. */
  openShiftId: string | null;
  attaching: string | null;
  onAttach: (paymentId: string) => void;
  /** Texto del botón y de la ayuda: "tu caja" en Resumen, "turno abierto" en Historial. */
  target?: "own" | "open";
}

export function OrphanTray({
  orphanPayments,
  openShiftId,
  attaching,
  onAttach,
  target = "open",
}: Props) {
  const action = target === "own" ? "Pasar a mi caja" : "Atribuir al turno abierto";
  return (
    <div className="rounded-2xl border border-border/60 bg-card">
      <div className="border-b border-border/40 px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Inbox className="h-4 w-4 text-muted-foreground" /> Fuera de turno
          {orphanPayments.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
              {orphanPayments.length}
            </span>
          )}
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {target === "own"
            ? "Cobros de los últimos 7 días que entraron sin caja abierta. Si esa plata está en tu cajón, pásalos a tu caja para que cuadre el arqueo."
            : "Cobros que entraron sin caja abierta. No están en ningún arqueo hasta que se atribuyan a un turno."}
        </p>
      </div>
      {orphanPayments.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
          Todos los cobros están dentro de un turno.
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {orphanPayments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{patientName(p) ?? "Cobro"}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {fmtDateTime(p.created_at)} · {p.payment_method?.trim() || "Sin método declarado"}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums">
                {formatPEN(Number(p.amount))}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 print:hidden"
                disabled={!openShiftId || attaching === p.id}
                onClick={() => onAttach(p.id)}
              >
                {attaching === p.id ? "Pasando…" : action}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {orphanPayments.length > 0 && !openShiftId && (
        <p className="border-t border-border/40 px-4 py-2.5 text-[11px] text-muted-foreground">
          Abre una caja para poder atribuirlos: un pago nunca se adjunta a un
          turno ya cerrado.
        </p>
      )}
    </div>
  );
}
