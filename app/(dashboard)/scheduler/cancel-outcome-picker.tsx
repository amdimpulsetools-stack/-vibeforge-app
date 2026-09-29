"use client";

/**
 * Desenlace de una cancelación (mig 273) — un toque, visible JUNTO al botón
 * Cancelar, antes del clic (recepción cancela con un clic + Deshacer, así
 * que la decisión tiene que estar a la vista antes).
 *
 *  · "Reprogramará"            → la base crea la tarjeta "Por reprogramar".
 *  · "No vuelve"               → se avisa a la paciente como siempre; sin tarjeta.
 *  · "Fue un error de registro"→ ni email ni campanita, sin tarjeta.
 *
 * Solo se muestra en citas vivas sin atender (scheduled/confirmed). El
 * estado lo guarda el sidebar; este componente solo pinta y avisa.
 */

import { CalendarClock, CircleSlash, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";
import { CANCEL_OUTCOME_LABEL, type CancelOutcome } from "@/lib/followups/reschedule";

/** Una cita creada hace menos de esto se sugiere como "error de registro". */
export const CANCEL_ERROR_SUGGEST_MIN = 30;

/**
 * Minutos desde que se creó la cita (created_at del servidor). Comparar
 * contra Date.now() es correcto aquí: es una duración, no una fecha de
 * negocio. null si no hay created_at o no se puede leer.
 */
export function minutesSinceCreated(createdAt: string | null | undefined): number | null {
  if (!createdAt) return null;
  const ms = new Date(createdAt).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 60_000));
}

/** Desenlace por defecto: error si es recién creada; si no, reprogramar (o "no vuelve" sin ficha). */
export function defaultCancelOutcome(
  createdMinutesAgo: number | null,
  hasPatient: boolean,
): CancelOutcome {
  if (createdMinutesAgo !== null && createdMinutesAgo < CANCEL_ERROR_SUGGEST_MIN) {
    return "error_registro";
  }
  return hasPatient ? "reprogramar" : "no_vuelve";
}

const OPTIONS: Array<{ value: CancelOutcome; icon: typeof CalendarClock; hint: string }> = [
  { value: "reprogramar", icon: CalendarClock, hint: "Queda en Seguimientos → Por reprogramar." },
  { value: "no_vuelve", icon: CircleSlash, hint: "Se avisa a la paciente; sin seguimiento." },
  { value: "error_registro", icon: Eraser, hint: "No se avisa a la paciente ni se crea seguimiento." },
];

export function CancelOutcomePicker({
  value,
  onChange,
  hasPatient,
  createdMinutesAgo,
  disabled = false,
}: {
  value: CancelOutcome;
  onChange: (v: CancelOutcome) => void;
  hasPatient: boolean;
  createdMinutesAgo: number | null;
  disabled?: boolean;
}) {
  const recent =
    createdMinutesAgo !== null && createdMinutesAgo < CANCEL_ERROR_SUGGEST_MIN;
  const current = OPTIONS.find((o) => o.value === value);

  return (
    <div className="space-y-1">
      <p className="px-0.5 text-[11px] font-medium text-muted-foreground">Al cancelar:</p>
      <div role="radiogroup" aria-label="Desenlace de la cancelación" className="grid grid-cols-3 gap-1">
        {OPTIONS.map(({ value: v, icon: Icon }) => {
          const blocked = v === "reprogramar" && !hasPatient;
          const active = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled || blocked}
              title={blocked ? "Sin ficha de paciente" : undefined}
              onClick={() => onChange(v)}
              className={cn(
                "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1 text-center text-[10.5px] font-medium leading-tight transition-colors md:min-h-0",
                active
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                (disabled || blocked) && "cursor-not-allowed opacity-50 hover:bg-transparent",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {CANCEL_OUTCOME_LABEL[v]}
            </button>
          );
        })}
      </div>
      {recent && (
        <p className="px-0.5 text-[11px] text-amber-600 dark:text-amber-400">
          Creada hace {createdMinutesAgo} min — ¿fue un error de registro?
        </p>
      )}
      {!hasPatient && (
        <p className="px-0.5 text-[11px] text-muted-foreground">
          Sin ficha de paciente: no puede quedar por reprogramar.
        </p>
      )}
      {current && !recent && (
        <p className="px-0.5 text-[11px] text-muted-foreground">{current.hint}</p>
      )}
    </div>
  );
}
