"use client";

import { useMemo, useState } from "react";
import { useOrgToday } from "@/hooks/use-org-today";
import { toast } from "sonner";
import type { Office } from "@/types/admin";
import { SCHEDULER_START_HOUR, SCHEDULER_END_HOUR, SCHEDULER_INTERVAL } from "@/types/admin";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { X, Loader2, Lock } from "lucide-react";

interface BlockDialogProps {
  defaultDate?: string;
  offices: Office[];
  organizationId: string;
  /** Horario configurado de la agenda (Configuración → Agenda), como minutos
   *  desde medianoche (incluye los offsets de minutos de mig 175). Las
   *  opciones de hora deben cubrir el mismo rango que la grilla — antes
   *  se usaban las constantes de fábrica (8-20) e ignoraban la config. */
  scheduleStartMinutes?: number;
  scheduleEndMinutes?: number;
  onClose: () => void;
  onSaved: () => void;
}

type ConflictAppt = { start_time: string; end_time: string; patient_name: string | null };

function formatMinutes(mins: number): string {
  return `${Math.floor(mins / 60).toString().padStart(2, "0")}:${(mins % 60).toString().padStart(2, "0")}`;
}

function generateTimeOptions(startMin: number, endMin: number) {
  const opts: string[] = [];
  for (let mins = startMin; mins <= endMin; mins += SCHEDULER_INTERVAL) {
    opts.push(formatMinutes(mins));
  }
  return opts;
}

export function BlockDialog({
  defaultDate,
  offices,
  organizationId,
  scheduleStartMinutes = SCHEDULER_START_HOUR * 60,
  scheduleEndMinutes = SCHEDULER_END_HOUR * 60,
  onClose,
  onSaved,
}: BlockDialogProps) {
  const timeOptions = useMemo(
    () => generateTimeOptions(scheduleStartMinutes, scheduleEndMinutes),
    [scheduleStartMinutes, scheduleEndMinutes],
  );
  // Fecha civil de la org (mig 240): con toISOString() (UTC) el mínimo del
  // picker era "mañana" tras las 19:00 Lima y no se podía bloquear hoy.
  const { today: orgToday } = useOrgToday();
  const today = orgToday();
  const [blockDate, setBlockDate] = useState(defaultDate ?? today);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState(formatMinutes(scheduleStartMinutes));
  const [endTime, setEndTime] = useState(
    formatMinutes(Math.min(scheduleStartMinutes + 60, scheduleEndMinutes)),
  );
  const [officeId, setOfficeId] = useState<string>("all");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  // Citas que impiden el bloqueo (409 del API). Se limpia al cambiar el rango.
  const [conflicts, setConflicts] = useState<ConflictAppt[] | null>(null);

  const isValid = blockDate && (allDay || startTime < endTime);

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    setConflicts(null);

    // Mig 254: pasa por el API para estampar quién bloqueó y dejar la fila
    // en el registro de auditoría (antes insertaba directo y created_by
    // quedaba NULL).
    let errorMessage: string | null = null;
    try {
      const res = await fetch("/api/scheduler/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: organizationId,
          block_date: blockDate,
          all_day: allDay,
          start_time: allDay ? null : startTime,
          end_time: allDay ? null : endTime,
          office_id: officeId === "all" ? null : officeId,
          reason: reason.trim() || null,
        }),
      });
      if (res.status === 409) {
        const j = (await res.json().catch(() => null)) as
          | { error?: string; conflicts?: ConflictAppt[] }
          | null;
        if (j?.error === "appointments_conflict" && j.conflicts?.length) {
          setConflicts(j.conflicts);
          setSaving(false);
          return;
        }
        errorMessage = j?.error ?? "Error 409";
      } else if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        errorMessage =
          res.status === 403
            ? "No tienes permiso para bloquear horarios en esta clínica"
            : j?.error ?? `Error ${res.status}`;
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : "Sin conexión";
    }

    setSaving(false);
    if (errorMessage) {
      toast.error("Error al crear bloqueo: " + errorMessage);
      return;
    }
    toast.success("Horario bloqueado correctamente");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-full max-w-md p-0 gap-0 [&>button]:hidden">
        <DialogDescription className="sr-only">Bloquear horario</DialogDescription>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-500" />
            <DialogTitle className="text-lg font-semibold">Bloquear Horario</DialogTitle>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Fecha *</label>
            <input
              type="date"
              value={blockDate}
              onChange={(e) => { setBlockDate(e.target.value); setConflicts(null); }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
          </div>

          {/* All day checkbox */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className="relative">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => { setAllDay(e.target.checked); setConflicts(null); }}
                className="sr-only peer"
              />
              <div className="h-5 w-9 rounded-full bg-muted peer-checked:bg-primary transition-colors" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm font-medium">Todo el día</span>
          </label>

          {/* Time range (hidden when allDay) */}
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora inicio *</label>
                <select
                  value={startTime}
                  onChange={(e) => { setStartTime(e.target.value); setConflicts(null); }}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                >
                  {timeOptions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora fin *</label>
                <select
                  value={endTime}
                  onChange={(e) => { setEndTime(e.target.value); setConflicts(null); }}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                >
                  {timeOptions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {startTime >= endTime && (
                <p className="col-span-2 text-xs text-destructive">
                  La hora fin debe ser mayor que la hora inicio
                </p>
              )}
            </div>
          )}

          {/* Office */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Consultorio</label>
            <select
              value={officeId}
              onChange={(e) => { setOfficeId(e.target.value); setConflicts(null); }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            >
              <option value="all">Todos los consultorios</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Motivo (opcional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              placeholder="Ej: Mantenimiento, Feriado, Capacitación..."
            />
          </div>

          {/* Citas que impiden bloquear (409 del API) */}
          {conflicts && conflicts.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <p className="mb-1 font-medium">
                No se puede bloquear: {conflicts.length === 1 ? "hay 1 cita" : `hay ${conflicts.length} citas`} en ese horario.
              </p>
              <ul className="mb-1 space-y-0.5">
                {conflicts.map((c, i) => (
                  <li key={`${c.start_time}-${i}`}>
                    {c.start_time}–{c.end_time} · {c.patient_name?.trim() || "Paciente sin nombre"}
                  </li>
                ))}
              </ul>
              <p>Reprográmalas o cancélalas primero, o elige otro horario o consultorio.</p>
            </div>
          )}

          {/* Preview */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <p className="font-medium mb-1">Vista previa del bloqueo:</p>
            <p>📅 {blockDate}</p>
            {allDay ? (
              <p>🕐 Todo el día</p>
            ) : (
              <p>🕐 {startTime} — {endTime}</p>
            )}
            <p>🏥 {officeId === "all" ? "Todos los consultorios" : offices.find((o) => o.id === officeId)?.name}</p>
            {reason && <p>📝 {reason}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isValid}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <Lock className="h-4 w-4" />
            Bloquear
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
