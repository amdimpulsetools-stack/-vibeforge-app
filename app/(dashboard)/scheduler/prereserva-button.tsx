"use client";

/**
 * Botón "Pre-reservar" del formulario de Nueva cita (mig 274).
 *
 * Secundario, junto a "Guardar". Abre un popover con el plazo (chips
 * 1 h / 2 h / 3 h / 24 h; preseleccionado el de Ajustes → Agenda) y la hora
 * límite resultante en la zona de la org. Confirmar llama a `onPrereserve`
 * con los minutos: el formulario guarda la cita igual que "Guardar" más
 * `hold_expires_at`.
 */

import { useEffect, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOrgToday } from "@/hooks/use-org-today";
import {
  PRERESERVA_DURATION_OPTIONS,
  computeHoldExpiry,
  describeHoldDeadline,
  formatHoldDuration,
} from "@/lib/appointments/prereserva";

interface PrereservaButtonProps {
  defaultMinutes: number;
  disabled?: boolean;
  /** Motivo por el que no se puede pre-reservar (tooltip + texto en el popover). */
  disabledReason?: string | null;
  saving?: boolean;
  onPrereserve: (minutes: number) => void;
}

export function PrereservaButton({
  defaultMinutes,
  disabled = false,
  disabledReason = null,
  saving = false,
  onPrereserve,
}: PrereservaButtonProps) {
  const { timezone } = useOrgToday();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(defaultMinutes);
  // El default puede llegar después (la config baja de la BD): mientras el
  // popover esté cerrado, seguirlo.
  useEffect(() => {
    if (!open) setMinutes(defaultMinutes);
  }, [defaultMinutes, open]);

  // Hora límite de referencia, recalculada al abrir y al cambiar el plazo.
  const [previewNow, setPreviewNow] = useState(() => Date.now());
  useEffect(() => {
    if (open) setPreviewNow(Date.now());
  }, [open, minutes]);
  const deadline = describeHoldDeadline(computeHoldExpiry(minutes, previewNow), timezone, new Date(previewNow));

  const options = PRERESERVA_DURATION_OPTIONS.some((o) => o.minutes === defaultMinutes)
    ? PRERESERVA_DURATION_OPTIONS
    : [...PRERESERVA_DURATION_OPTIONS, { minutes: defaultMinutes, label: formatHoldDuration(defaultMinutes) }].sort(
        (a, b) => a.minutes - b.minutes
      );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || saving}
          title={disabledReason ?? "Separa el horario mientras la paciente envía su pago"}
          className="flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors md:py-2"
        >
          <Clock className="hidden h-4 w-4 sm:block" />
          Pre-reservar
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-72 space-y-3">
        <div>
          <p className="text-sm font-semibold">Pre-reservar horario</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ocupa el horario mientras la paciente paga. Se confirma sola al registrar el pago; no se envía el correo
            de confirmación hasta entonces.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button
              key={o.minutes}
              type="button"
              onClick={() => setMinutes(o.minutes)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                o.minutes === minutes
                  ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                  : "border-border hover:bg-accent"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Vence{" "}
          <span className="font-semibold text-foreground">
            {deadline.day === "today" ? `hoy a las ${deadline.time}` : deadline.short}
          </span>
        </p>
        <button
          type="button"
          disabled={disabled || saving}
          onClick={() => {
            setOpen(false);
            onPrereserve(minutes);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Separar {formatHoldDuration(minutes)}
        </button>
        {disabledReason && <p className="text-[11px] text-amber-600 dark:text-amber-400">{disabledReason}</p>}
      </PopoverContent>
    </Popover>
  );
}
