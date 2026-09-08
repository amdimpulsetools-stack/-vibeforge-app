"use client";

import { useMemo, useState } from "react";
import { X, Coffee, Check, Loader2 } from "lucide-react";
import { SCHEDULER_START_HOUR, SCHEDULER_END_HOUR } from "@/types/admin";
import {
  DEFAULT_BREAK_TIME_CONFIG,
  type BreakTimeConfig,
} from "@/lib/scheduler-config";

// Mig 254: la config del descanso ya no vive en localStorage por navegador
// sino en scheduler_settings.break_time (por org). El tipo y el default están
// en lib/scheduler-config para que el servidor (compartir horarios, reserva
// online) use exactamente la misma forma. Se re-exportan por compatibilidad.
export { DEFAULT_BREAK_TIME_CONFIG, type BreakTimeConfig };

// Ordered Mon→Sun for display
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS: Record<number, string> = {
  0: "Dom",
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
};

function generateTimeOptions(startMin: number, endMin: number): string[] {
  const opts: string[] = [];
  for (let mins = startMin; mins <= endMin; mins += 30) {
    opts.push(`${Math.floor(mins / 60).toString().padStart(2, "0")}:${(mins % 60).toString().padStart(2, "0")}`);
  }
  return opts;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

interface BreakTimeDialogProps {
  /** Config vigente de la org (scheduler_settings.break_time). */
  initial: BreakTimeConfig;
  /** Solo owner/admin pueden guardar (la config es de la org, como el resto
   *  de Configuración → Agenda). El resto la ve en modo lectura. */
  canEdit: boolean;
  /** Horario configurado de la agenda (Configuración → Agenda), como minutos
   *  desde medianoche (incluye offsets de mig 175). Fallback a las constantes
   *  de fábrica. */
  scheduleStartMinutes?: number;
  scheduleEndMinutes?: number;
  onClose: () => void;
  /** El padre persiste (PUT /api/scheduler-settings) y cierra. Devuelve false
   *  si falló, para que el diálogo siga abierto. */
  onSave: (config: BreakTimeConfig) => Promise<boolean>;
}

export function BreakTimeDialog({
  initial,
  canEdit,
  scheduleStartMinutes = SCHEDULER_START_HOUR * 60,
  scheduleEndMinutes = SCHEDULER_END_HOUR * 60,
  onClose,
  onSave,
}: BreakTimeDialogProps) {
  const timeOptions = useMemo(
    () => generateTimeOptions(scheduleStartMinutes, scheduleEndMinutes),
    [scheduleStartMinutes, scheduleEndMinutes],
  );
  const [config, setConfig] = useState<BreakTimeConfig>(initial);
  const [saving, setSaving] = useState(false);

  const durationMinutes =
    timeToMinutes(config.endTime) - timeToMinutes(config.startTime);

  const isValid =
    !config.enabled ||
    (config.days.length > 0 &&
      config.startTime < config.endTime &&
      durationMinutes >= 30);

  const toggleDay = (day: number) => {
    if (!canEdit) return;
    setConfig((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day],
    }));
  };

  const handleSave = async () => {
    if (!isValid || !canEdit || saving) return;
    setSaving(true);
    const ok = await onSave(config);
    setSaving(false);
    if (!ok) return;
  };

  return (
    /* Mismo tratamiento que reschedule-modal: sin max-h el bloque de días
       + horas + preview se cortaba en móvil y en landscape sin scroll
       posible. dvh porque 100vh incluye la barra de URL de iOS. */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-border px-4 sm:px-6 py-4">
          <div className="flex items-center gap-2">
            <Coffee className="h-5 w-5 text-blue-500" />
            <h3 className="text-lg font-semibold">Descanso</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">
          {!canEdit && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              El descanso es una configuración de la clínica: solo un
              administrador puede cambiarlo. Aquí lo ves tal como está activo
              para todo el equipo.
            </p>
          )}

          {/* Enable toggle */}
          <label className={`flex items-center justify-between select-none ${canEdit ? "cursor-pointer" : "cursor-default"}`}>
            <div>
              <p className="text-sm font-medium">Activar descanso</p>
              <p className="text-xs text-muted-foreground">
                Bloquea el horario de descanso para todo el equipo, en
                Compartir horarios y en la reserva online
              </p>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                checked={config.enabled}
                disabled={!canEdit}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, enabled: e.target.checked }))
                }
                className="sr-only peer"
              />
              <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-blue-500 transition-colors peer-disabled:opacity-60" />
              <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            </div>
          </label>

          {config.enabled && (
            <>
              {/* Days */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Días activos</label>
                <div className="flex gap-1.5">
                  {DAY_ORDER.map((day) => (
                    <button
                      key={day}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => toggleDay(day)}
                      className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors disabled:cursor-default ${
                        config.days.includes(day)
                          ? "bg-blue-500 text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {DAY_LABELS[day]}
                    </button>
                  ))}
                </div>
                {config.days.length === 0 && (
                  <p className="text-xs text-destructive">
                    Selecciona al menos un día
                  </p>
                )}
              </div>

              {/* Time range */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Hora inicio</label>
                  <select
                    value={config.startTime}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, startTime: e.target.value }))
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors disabled:opacity-70"
                  >
                    {timeOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Hora fin</label>
                  <select
                    value={config.endTime}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, endTime: e.target.value }))
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors disabled:opacity-70"
                  >
                    {timeOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Validation messages */}
              {config.startTime >= config.endTime && (
                <p className="text-xs text-destructive">
                  La hora fin debe ser mayor que la hora inicio
                </p>
              )}
              {config.startTime < config.endTime && durationMinutes < 30 && (
                <p className="text-xs text-destructive">
                  El tiempo mínimo del descanso es 30 minutos
                </p>
              )}

              {/* Preview */}
              {isValid && config.days.length > 0 && config.startTime < config.endTime && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-700 dark:text-blue-400">
                  <p className="font-medium mb-1">Configuración activa:</p>
                  <p>
                    ☕ {config.startTime} — {config.endTime}{" "}
                    <span className="text-blue-500/70">({durationMinutes} min)</span>
                  </p>
                  <p>
                    📅{" "}
                    {DAY_ORDER.filter((d) => config.days.includes(d))
                      .map((d) => DAY_LABELS[d])
                      .join(", ")}
                  </p>
                  <p className="mt-1 text-blue-600/60 dark:text-blue-500/60">
                    No se podrán reservar citas en este horario, ni desde la
                    agenda ni desde la reserva online
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-2 border-t border-border px-4 sm:px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            {canEdit ? "Cancelar" : "Cerrar"}
          </button>
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={!isValid || saving}
              className="flex items-center gap-2 rounded-lg bg-blue-500 px-6 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Guardar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
