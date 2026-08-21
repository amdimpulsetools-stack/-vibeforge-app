"use client";

import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw, X, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Confirmación al soltar una cita arrastrada en la agenda.
 *
 * Antes de este diálogo, soltar reprogramaba al instante — un arrastre
 * accidental movía la cita real sin preguntar. Además, los dos caminos de
 * reprogramación se contradecían: el modal "Reprogramar" SIEMPRE enviaba el
 * correo al paciente, y el drag & drop NUNCA lo enviaba. El checkbox hace
 * la notificación explícita e intencional: marcado por defecto (el paciente
 * debe enterarse en el caso normal), desmarcable para reacomodos internos.
 */
export interface PendingDrop {
  appointmentId: string;
  patientName: string;
  serviceName: string | null;
  /** yyyy-MM-dd */
  fromDate: string;
  /** HH:mm */
  fromTime: string;
  fromOfficeName: string | null;
  /** yyyy-MM-dd */
  toDate: string;
  /** HH:mm */
  toTime: string;
  toOfficeName: string | null;
}

function formatDmy(iso: string): string {
  return iso.split("-").reverse().join("/");
}

export function DropConfirmDialog({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingDrop;
  onConfirm: (notifyPatient: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [notifyPatient, setNotifyPatient] = useState(true);
  const [saving, setSaving] = useState(false);

  const sameDay = pending.fromDate === pending.toDate;
  const sameOffice = pending.fromOfficeName === pending.toOfficeName;

  // Escape cancela — el gesto pudo ser un error, la salida debe ser fácil.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm(notifyPatient);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold">Reprogramar cita</h3>
          </div>
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="text-sm font-semibold">{pending.patientName}</p>
            {pending.serviceName && (
              <p className="text-xs text-muted-foreground">{pending.serviceName}</p>
            )}
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium tabular-nums">
                {sameDay ? pending.fromTime : `${formatDmy(pending.fromDate)} · ${pending.fromTime}`}
              </p>
              {!sameOffice && pending.fromOfficeName && (
                <p className="truncate text-xs text-muted-foreground">{pending.fromOfficeName}</p>
              )}
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium tabular-nums">
                {sameDay ? pending.toTime : `${formatDmy(pending.toDate)} · ${pending.toTime}`}
              </p>
              {!sameOffice && pending.toOfficeName && (
                <p className="truncate text-xs text-muted-foreground">{pending.toOfficeName}</p>
              )}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5">
            <Checkbox
              checked={notifyPatient}
              onCheckedChange={(v) => setNotifyPatient(v === true)}
              className="mt-0.5"
            />
            <span className="text-sm">
              Notificar al paciente por correo
              <span className="block text-xs text-muted-foreground">
                Desmárcalo si es un reacomodo interno que no debe avisarse.
              </span>
            </span>
          </label>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Reprogramar
          </button>
        </div>
      </div>
    </div>
  );
}
