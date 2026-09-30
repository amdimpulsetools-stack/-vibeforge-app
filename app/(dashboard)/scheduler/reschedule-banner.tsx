"use client";

import { AlertTriangle, CalendarClock, X } from "lucide-react";
import {
  formatRescheduleWhen,
  formatSoles,
  type RescheduleContext,
} from "@/lib/appointments/reschedule-context";

/**
 * Franja ámbar fija bajo el header de la agenda mientras dura el "modo
 * reprogramar" (`/scheduler?reprogramar=<id cancelada>`). Recuerda a quién se
 * está reprogramando y con qué datos, y avisa si el doctor o el servicio de la
 * cita original ya no se pueden elegir (la precarga será parcial).
 */
export function RescheduleBanner({
  ctx,
  warnings,
  officeNotice,
  onExit,
}: {
  ctx: RescheduleContext;
  /** Avisos de precarga parcial (doctor / servicio ya no disponibles). */
  warnings: string[];
  /** "Mostrando Consultorio 2 por la reprogramación" (filtro de consultorios). */
  officeNotice?: string | null;
  onExit: () => void;
}) {
  const patientName = ctx.patient
    ? `${ctx.patient.first_name} ${ctx.patient.last_name}`.trim()
    : ctx.patientName || "Paciente";
  const parts = [
    ctx.serviceName,
    ctx.doctorName,
    `era el ${formatRescheduleWhen(ctx.appointmentDate, ctx.startTime)}`,
    formatSoles(ctx.billedAmount),
    ctx.deposit && ctx.deposit.amount > 0 ? `${formatSoles(ctx.deposit.amount)} a cuenta` : null,
  ].filter(Boolean);

  return (
    <div
      role="status"
      className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-200 md:px-4"
    >
      <div className="flex items-start gap-2">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="min-w-0 flex-1 text-xs leading-snug md:text-sm">
          <span className="font-semibold">Reprogramando a {patientName}</span>
          <span className="hidden sm:inline"> — {parts.join(" · ")}</span>
          <span className="sm:hidden"> · {ctx.serviceName ?? ""}</span>
          <span className="font-medium"> — toca un horario libre</span>
        </p>
        <button
          type="button"
          onClick={onExit}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
          aria-label="Salir de reprogramar"
          title="Salir de reprogramar (Esc)"
        >
          <X className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
      {(warnings.length > 0 || officeNotice) && (
        <ul className="mt-1 space-y-0.5 pl-6 text-[11px] md:text-xs">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-1 text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {w}
            </li>
          ))}
          {officeNotice && <li className="text-amber-800/80 dark:text-amber-300/80">{officeNotice}</li>}
        </ul>
      )}
    </div>
  );
}
