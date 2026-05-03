"use client";

import { useState } from "react";
import { X, Coffee, Check } from "lucide-react";
import { SCHEDULER_START_HOUR, SCHEDULER_END_HOUR } from "@/types/admin";

export interface BreakTimeConfig {
  enabled: boolean;
  days: number[]; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
}

export const DEFAULT_BREAK_TIME_CONFIG: BreakTimeConfig = {
  // Off por default. La clínica activa explícitamente su break time desde el
  // botón ☕ en el header del scheduler. Asumir 1-2pm como default era invasivo
  // para clínicas que no tienen ese horario o trabajan sin almuerzo fijo.
  enabled: false,
  days: [1, 2, 3, 4, 5], // Mon–Fri
  startTime: "13:00",
  endTime: "14:00",
};

const BREAK_TIME_KEY = "vibeforge_break_time_config";

export function loadBreakTimeConfig(): BreakTimeConfig {
  if (typeof window === "undefined") return DEFAULT_BREAK_TIME_CONFIG;
  try {
    const stored = localStorage.getItem(BREAK_TIME_KEY);
    if (stored) return { ...DEFAULT_BREAK_TIME_CONFIG, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return DEFAULT_BREAK_TIME_CONFIG;
}

export function saveBreakTimeConfig(config: BreakTimeConfig): void {
  localStorage.setItem(BREAK_TIME_KEY, JSON.stringify(config));
}

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

function generateTimeOptions(): string[] {
  const opts: string[] = [];
  for (let h = SCHEDULER_START_HOUR; h <= SCHEDULER_END_HOUR; h++) {
    for (let m = 0; m < 60; m += 30) {
      if (h === SCHEDULER_END_HOUR && m > 0) break;
      opts.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    }
  }
  return opts;
}

const TIME_OPTIONS = generateTimeOptions();

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

interface BreakTimeDialogProps {
  onClose: () => void;
  onSaved: (config: BreakTimeConfig) => void;
}

export function BreakTimeDialog({ onClose, onSaved }: BreakTimeDialogProps) {
  const [config, setConfig] = useState<BreakTimeConfig>(() => loadBreakTimeConfig());

  const durationMinutes =
    timeToMinutes(config.endTime) - timeToMinutes(config.startTime);

  const isValid =
    !config.enabled ||
    (config.days.length > 0 &&
      config.startTime < config.endTime &&
      durationMinutes >= 30);

  const toggleDay = (day: number) => {
    setConfig((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day],
    }));
  };

  const handleSave = () => {
    if (!isValid) return;
    saveBreakTimeConfig(config);
    onSaved(config);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
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

        <div className="px-6 py-4 space-y-5">
          {/* Enable toggle */}
          <label className="flex items-center justify-between cursor-pointer select-none">
            <div>
              <p className="text-sm font-medium">Activar descanso</p>
              <p className="text-xs text-muted-foreground">
                Bloquea automáticamente el horario de descanso
              </p>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, enabled: e.target.checked }))
                }
                className="sr-only peer"
              />
              <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-blue-500 transition-colors" />
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
                      onClick={() => toggleDay(day)}
                      className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
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
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, startTime: e.target.value }))
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
                  >
                    {TIME_OPTIONS.map((t) => (
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
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, endTime: e.target.value }))
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
                  >
                    {TIME_OPTIONS.map((t) => (
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
                    No se podrán reservar citas en este horario
                  </p>
                </div>
              )}
            </>
          )}
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
            disabled={!isValid}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-6 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            <Check className="h-4 w-4" />
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
