"use client";

import { format, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { BreakTime, CalendarAppointment } from "@/lib/clinic-data";

const START_HOUR = 7;
const END_HOUR = 21;
const HOUR_HEIGHT = 80; // px por hora (más alto para mejor legibilidad)
const TOTAL_HOURS = END_HOUR - START_HOUR;

function timeToPixels(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return ((h - START_HOUR) + m / 60) * HOUR_HEIGHT;
}

function durationToPixels(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return ((eh * 60 + em - (sh * 60 + sm)) / 60) * HOUR_HEIGHT;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  completed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

interface DayViewProps {
  currentDate: Date;
  appointments: CalendarAppointment[];
  breakTimes: BreakTime[];
  onAppointmentClick?: (appt: CalendarAppointment) => void;
  onSlotClick?: (date: string, time: string) => void;
}

export function DayView({
  currentDate,
  appointments,
  breakTimes,
  onAppointmentClick,
  onSlotClick,
}: DayViewProps) {
  const dayOfWeek = getDay(currentDate) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const dateStr = format(currentDate, "yyyy-MM-dd");

  const dayBreaks = breakTimes.filter(
    (b) =>
      b.is_active &&
      (b.day_of_week === null || b.day_of_week === dayOfWeek)
  );

  const dayAppointments = appointments.filter((a) => a.date === dateStr);
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Encabezado del día */}
      <div className="border-b border-border bg-muted/30 px-4 py-3 text-center">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {format(currentDate, "EEEE", { locale: es })}
        </div>
        <div className="mt-0.5 text-3xl font-bold text-foreground">
          {format(currentDate, "d")}
        </div>
        <div className="text-sm text-muted-foreground">
          {format(currentDate, "MMMM yyyy", { locale: es })}
        </div>

        {dayAppointments.length > 0 && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {dayAppointments.length} {dayAppointments.length === 1 ? "cita" : "citas"}
          </div>
        )}
      </div>

      {/* Grid de tiempo */}
      <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
        <div
          className="grid grid-cols-[72px_1fr]"
          style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
        >
          {/* Etiquetas de hora */}
          <div className="relative border-r border-border bg-card">
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute w-full border-t border-border/40"
                style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
              >
                <span className="px-2 text-xs font-medium leading-none text-muted-foreground">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* Columna principal */}
          <div className="relative">
            {/* Líneas de hora */}
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute w-full border-t border-border/30"
                style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
                onClick={() => {
                  const timeStr = `${String(hour).padStart(2, "0")}:00`;
                  onSlotClick?.(dateStr, timeStr);
                }}
              />
            ))}

            {/* ===== BREAK TIMES ===== */}
            {dayBreaks.map((brk) => {
              const top = timeToPixels(brk.start_time);
              const height = Math.max(durationToPixels(brk.start_time, brk.end_time), 24);
              if (top < 0 || top >= TOTAL_HOURS * HOUR_HEIGHT) return null;

              return (
                <div
                  key={brk.id}
                  className="absolute left-0 right-0 z-10 mx-2 overflow-hidden rounded-lg"
                  style={{ top: `${top}px`, height: `${height}px` }}
                >
                  <div className="flex h-full items-center gap-2 bg-amber-100/90 dark:bg-amber-950/60 border border-amber-300/70 dark:border-amber-700/60 px-3">
                    <div className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                      {brk.name}
                    </span>
                    {brk.doctor_id === null && (
                      <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-400">
                        Global
                      </span>
                    )}
                    <span className="ml-auto text-xs text-amber-600 dark:text-amber-500">
                      {brk.start_time} – {brk.end_time}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* ===== CITAS ===== */}
            {dayAppointments.map((appt) => {
              const top = timeToPixels(appt.startTime);
              const height = Math.max(durationToPixels(appt.startTime, appt.endTime), 48);
              if (top < 0) return null;

              return (
                <div
                  key={appt.id}
                  className="absolute left-0 right-0 z-20 mx-2 cursor-pointer overflow-hidden rounded-xl shadow-sm transition-all hover:shadow-md hover:-translate-y-px"
                  style={{ top: `${top}px`, height: `${height}px` }}
                  onClick={() => onAppointmentClick?.(appt)}
                >
                  <div
                    className="h-full border-l-4 bg-card px-3 py-2"
                    style={{ borderColor: appt.serviceColor }}
                  >
                    <div className="flex h-full flex-col justify-between">
                      <div>
                        {/* Nombre del paciente */}
                        <p className="text-sm font-bold leading-tight text-foreground">
                          {appt.patientName}
                        </p>

                        {/* ===== NOMBRE DEL SERVICIO (requisito #2) ===== */}
                        <p
                          className="mt-0.5 text-xs font-semibold leading-tight"
                          style={{ color: appt.serviceColor }}
                        >
                          {appt.serviceName}
                        </p>

                        {height > 65 && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {appt.doctorName}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {appt.startTime} – {appt.endTime}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                            STATUS_COLORS[appt.status] ?? STATUS_COLORS.pending
                          )}
                        >
                          {STATUS_LABELS[appt.status] ?? appt.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
