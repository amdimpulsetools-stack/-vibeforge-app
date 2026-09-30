"use client";

/**
 * Ajustes → Agenda → "Pre-reserva de horario" (mig 274).
 *
 * Color de las citas pre-reservadas en la grilla y plazo por defecto del
 * botón "Pre-reservar" del formulario. Autoguardado igual que el resto de la
 * pestaña; si la mig 274 aún no está aplicada, el PUT responde 409 y aquí se
 * avisa "actualiza la base" sin tocar nada más de la agenda.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRERESERVA_DEFAULT_COLOR,
  PRERESERVA_MAX_MINUTES,
  PRERESERVA_MIN_MINUTES,
  savePrereservaSettingsToDb,
  type SchedulerConfig,
} from "@/lib/scheduler-config";
import {
  PRERESERVA_DURATION_OPTIONS,
  formatHoldDuration,
} from "@/lib/appointments/prereserva";

// Copias locales de los helpers de appointment-card.tsx (mismo resultado)
// para no arrastrar la tarjeta de la agenda al bundle de Ajustes.
function hexToPastel(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c * alpha + 255 * (1 - alpha));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
function hexToDark(hex: string, factor = 0.45): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

const PALETTE = [
  "#8b5cf6", // violeta (default)
  "#6366f1", // índigo
  "#0ea5e9", // celeste
  "#14b8a6", // turquesa
  "#f59e0b", // ámbar
  "#f97316", // naranja
  "#ec4899", // rosa
  "#64748b", // pizarra
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

interface PrereservaSettingsSectionProps {
  color: string;
  defaultMinutes: number;
  organizationId: string | null | undefined;
  /** Se llama tras guardar OK (el padre actualiza su estado e invalida la query). */
  onSaved: (patch: Pick<Partial<SchedulerConfig>, "prereservaColor" | "prereservaDefaultMinutes">) => void;
}

export function PrereservaSettingsSection({
  color,
  defaultMinutes,
  organizationId,
  onSaved,
}: PrereservaSettingsSectionProps) {
  const [hexDraft, setHexDraft] = useState(color);
  const [customMinutes, setCustomMinutes] = useState(String(defaultMinutes));
  const [saving, setSaving] = useState(false);

  useEffect(() => setHexDraft(color), [color]);
  useEffect(() => setCustomMinutes(String(defaultMinutes)), [defaultMinutes]);

  const isPreset = PRERESERVA_DURATION_OPTIONS.some((o) => o.minutes === defaultMinutes);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  useEffect(() => {
    if (!PRERESERVA_DURATION_OPTIONS.some((o) => o.minutes === defaultMinutes)) setCustomOpen(true);
  }, [defaultMinutes]);

  const save = async (patch: Pick<Partial<SchedulerConfig>, "prereservaColor" | "prereservaDefaultMinutes">) => {
    setSaving(true);
    const res = await savePrereservaSettingsToDb(patch, organizationId);
    setSaving(false);
    if (res === "ok") {
      onSaved(patch);
      toast.success("Pre-reserva actualizada");
      return;
    }
    // Revertir los borradores al valor guardado.
    setHexDraft(color);
    setCustomMinutes(String(defaultMinutes));
    if (res === "unavailable") {
      toast.warning("Actualiza la base (mig 274) para configurar la pre-reserva.");
    } else if (res === "forbidden") {
      toast.error("Solo un administrador puede cambiar esta configuración.");
    } else {
      toast.error("No se pudo guardar la configuración de pre-reserva.");
    }
  };

  const commitHex = () => {
    const v = hexDraft.trim();
    const normalized = v.startsWith("#") ? v : `#${v}`;
    if (!HEX_RE.test(normalized)) {
      toast.error("Color inválido. Usa el formato #RRGGBB.");
      setHexDraft(color);
      return;
    }
    if (normalized.toLowerCase() === color.toLowerCase()) return;
    void save({ prereservaColor: normalized.toLowerCase() });
  };

  const commitCustomMinutes = () => {
    const n = Number(customMinutes);
    if (!Number.isInteger(n) || n < PRERESERVA_MIN_MINUTES || n > PRERESERVA_MAX_MINUTES) {
      toast.error(`El plazo debe estar entre ${PRERESERVA_MIN_MINUTES} y ${PRERESERVA_MAX_MINUTES} minutos.`);
      setCustomMinutes(String(defaultMinutes));
      return;
    }
    if (n === defaultMinutes) return;
    void save({ prereservaDefaultMinutes: n });
  };

  const previewColor = HEX_RE.test(hexDraft) ? hexDraft : color;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
      <div>
        <p className="text-sm font-semibold">Pre-reserva de horario</p>
        <p className="text-xs text-muted-foreground mt-1">
          Separa un horario mientras la paciente envía su pago. La cita ocupa el horario, se pinta con este color
          y se confirma sola al registrar el pago. Al vencer no se libera sola: se marca en rojo para que decidas.
        </p>
      </div>

      {/* Color */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Color en la agenda</p>
        <div className="flex flex-wrap items-center gap-2">
          {PALETTE.map((c) => {
            const active = c.toLowerCase() === color.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                disabled={saving}
                onClick={() => !active && void save({ prereservaColor: c })}
                aria-label={`Usar color ${c}`}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-105 disabled:opacity-60",
                  active ? "border-foreground" : "border-transparent"
                )}
                style={{ backgroundColor: c }}
              >
                {active && <Check className="h-4 w-4 text-white" />}
              </button>
            );
          })}
          <div className="flex items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1">
            <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: previewColor }} />
            <input
              value={hexDraft}
              onChange={(e) => setHexDraft(e.target.value)}
              onBlur={commitHex}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitHex();
                }
              }}
              maxLength={7}
              spellCheck={false}
              aria-label="Color hexadecimal"
              className="w-20 bg-transparent text-sm font-mono focus:outline-none"
              placeholder={PRERESERVA_DEFAULT_COLOR}
            />
          </div>
        </div>
        {/* Vista previa de la tarjeta */}
        <div
          className="mt-2 max-w-xs rounded-lg px-2 py-1.5"
          style={{
            backgroundColor: hexToPastel(previewColor, 0.18),
            borderLeft: `4px solid ${previewColor}`,
            outline: `1px dashed ${previewColor}`,
            outlineOffset: -1,
          }}
        >
          <p className="text-xs font-bold" style={{ color: hexToDark(previewColor) }}>
            María Pérez
          </p>
          <p className="flex items-center gap-1 text-[11px]" style={{ color: hexToDark(previewColor, 0.55) }}>
            <Clock className="h-3 w-3" /> Pre-reserva · vence 15:30
          </p>
        </div>
      </div>

      {/* Plazo por defecto */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Plazo por defecto</p>
        <div className="flex flex-wrap items-center gap-2">
          {PRERESERVA_DURATION_OPTIONS.map((o) => {
            const active = !customOpen && o.minutes === defaultMinutes;
            return (
              <button
                key={o.minutes}
                type="button"
                disabled={saving}
                onClick={() => {
                  setCustomOpen(false);
                  if (o.minutes !== defaultMinutes) void save({ prereservaDefaultMinutes: o.minutes });
                }}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
                  active
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                    : "border-border hover:bg-accent"
                )}
              >
                {o.label}
              </button>
            );
          })}
          <button
            type="button"
            disabled={saving}
            onClick={() => setCustomOpen(true)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
              customOpen ? "border-primary bg-primary/10 text-primary ring-1 ring-primary" : "border-border hover:bg-accent"
            )}
          >
            Otro
          </button>
          {customOpen && (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={PRERESERVA_MIN_MINUTES}
                max={PRERESERVA_MAX_MINUTES}
                step={5}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                onBlur={commitCustomMinutes}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitCustomMinutes();
                  }
                }}
                aria-label="Plazo en minutos"
                className="w-24 rounded-lg border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <span className="text-xs text-muted-foreground">minutos</span>
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Actual: {formatHoldDuration(defaultMinutes)}. Al pre-reservar se puede elegir otro plazo para esa cita.
        </p>
      </div>
    </div>
  );
}
