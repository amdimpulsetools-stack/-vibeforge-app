"use client";

import { format, startOfWeek, addDays, isSameDay, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { BreakTime, CalendarAppointment } from "@/lib/clinic-data";

export type { CalendarAppointment };

const START_HOUR = 7;
const END_HOUR = 21;
const HOUR_HEIGHT = 64; // px por hora
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

interface WeekViewProps {
  currentDate: Date;
  appointments: CalendarAppointment[];
  breakTimes: BreakTime[];
  onAppointmentClick?: (appt: CalendarAppointment) => void;
  onSlotClick?: (date: string, time: string) => void;
}

export function WeekView({
  currentDate,
  appointments,
  breakTimes,
  onAppointmentClick,
  onSlotClick,
}: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Lunes
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);
  const today = new Date();

  function getBreaksForDay(day: Date): BreakTime[] {
    const dow = getDay(day) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    return breakTimes.filter(
      (b) =>
        b.is_active &&
        (b.day_of_week === null || b.day_of_week === dow)
    );
  }

  function getAppointmentsForDay(day: Date): CalendarAppointment[] {
    const dateStr = format(day, "yyyy-MM-dd");
    return appointments.filter((a) => a.date === dateStr);
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Encabezado de días */}
      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border bg-muted/30 sticky top-0 z-30">
        <div className="border-r border-border" />
        {weekDays.map((day, i) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={i}
              className={cn(
                "border-r border-border last:border-r-0 py-2 text-center",
                isToday && "bg-primary/5"
              )}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {format(day, "EEE", { locale: es })}
              </div>
              <div
                className={cn(
                  "mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold",
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground"
                )}
              >
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid de tiempo */}
      <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
        <div
          className="grid grid-cols-[56px_repeat(7,1fr)]"
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
                <span className="px-1 text-[10px] leading-none text-muted-foreground">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* Columnas de días */}
          {weekDays.map((day, dayIdx) => {
            const isToday = isSameDay(day, today);
            const dayBreaks = getBreaksForDay(day);
            const dayAppts = getAppointmentsForDay(day);
            const dateStr = format(day, "yyyy-MM-dd");

            return (
              <div
                key={dayIdx}
                className={cn(
                  "relative border-r border-border last:border-r-0 cursor-pointer",
                  isToday && "bg-primary/[0.02]"
                )}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    onSlotClick?.(dateStr, "09:00");
                  }
                }}
              >
                {/* Líneas de hora */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute w-full border-t border-border/30"
                    style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* ===== BREAK TIMES ===== */}
                {dayBreaks.map((brk) => {
                  const top = timeToPixels(brk.start_time);
                  const height = durationToPixels(brk.start_time, brk.end_time);
                  if (top < 0 || top >= TOTAL_HOURS * HOUR_HEIGHT) return null;

                  return (
                    <div
                      key={brk.id}
                      className="absolute left-0 right-0 z-10 mx-px overflow-hidden"
                      style={{ top: `${top}px`, height: `${Math.max(height, 14)}px` }}
                      title={`${brk.name} (${brk.start_time} - ${brk.end_time})`}
                    >
                      <div className="flex h-full items-center justify-center gap-1 bg-amber-100/90 dark:bg-amber-950/60 border-y border-amber-300/70 dark:border-amber-700/60 px-1">
                        <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        <span className="truncate text-[9px] font-semibold text-amber-700 dark:text-amber-400">
                          {brk.name}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* ===== CITAS ===== */}
                {dayAppts.map((appt) => {
                  const top = timeToPixels(appt.startTime);
                  const height = Math.max(durationToPixels(appt.startTime, appt.endTime), 20);
                  if (top < 0) return null;

                  return (
                    <div
                      key={appt.id}
                      className="absolute left-0 right-0 z-20 mx-px cursor-pointer overflow-hidden rounded transition-opacity hover:opacity-90 active:opacity-75"
                      style={{ top: `${top}px`, height: `${height}px` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppointmentClick?.(appt);
                      }}
                      title={`${appt.patientName} — ${appt.serviceName}`}
                    >
                      <div
                        className="h-full border-l-2 px-1 py-0.5"
                        style={{
                          backgroundColor: `${appt.serviceColor}22`,
                          borderColor: appt.serviceColor,
                        }}
                      >
                        <p
                          className="truncate text-[10px] font-bold leading-tight"
                          style={{ color: appt.serviceColor }}
                        >
                          {appt.patientName}
                        </p>
                        {height > 28 && (
                          <p className="truncate text-[9px] leading-tight text-muted-foreground">
                            {appt.serviceName}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
