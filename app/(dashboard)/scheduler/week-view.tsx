"use client";

import { format, addDays, startOfWeek, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, Office, ScheduleBlock } from "@/types/admin";
import { APPOINTMENT_STATUS_COLORS } from "@/types/admin";
import { cn } from "@/lib/utils";
import { Plus, Coffee, Lock, CheckCircle2, CircleDollarSign, Video } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { loadSchedulerConfig, fetchSchedulerConfig, generateTimeSlots, getActiveInterval, DEFAULT_SCHEDULER_CONFIG } from "@/lib/scheduler-config";

interface WeekViewProps {
  currentDate: Date;
  appointments: AppointmentWithRelations[];
  offices: Office[];
  blocks: ScheduleBlock[];
  paymentTotals?: Record<string, number>;
  selectedAppointmentId?: string;
  /** When set, appointments from other doctors are shown desaturated and non-interactive */
  currentDoctorId?: string | null;
  onSlotClick: (date: Date, time: string, officeId: string) => void;
  onAppointmentClick: (appointment: AppointmentWithRelations) => void;
}

/** Create a light pastel by blending a hex color with white. */
function hexToPastel(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const bg = 255; // white
  return `rgb(${Math.round(r * alpha + bg * (1 - alpha))}, ${Math.round(g * alpha + bg * (1 - alpha))}, ${Math.round(b * alpha + bg * (1 - alpha))})`;
}

/** Create a darkened version of a hex color for text on pastel bg. */
function hexToDark(hex: string, factor = 0.45): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

function getBlockForDay(
  blocks: ScheduleBlock[],
  dateStr: string,
  slotTime: string
): ScheduleBlock | null {
  return (
    blocks.find((b) => {
      if (b.block_date !== dateStr) return false;
      if (b.all_day) return true;
      const start = b.start_time?.slice(0, 5) ?? "00:00";
      const end = b.end_time?.slice(0, 5) ?? "23:59";
      return slotTime >= start && slotTime < end;
    }) ?? null
  );
}


export function WeekView({
  currentDate,
  appointments,
  offices,
  blocks,
  paymentTotals = {},
  selectedAppointmentId,
  currentDoctorId,
  onSlotClick,
  onAppointmentClick,
}: WeekViewProps) {
  const { t } = useLanguage();
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Scheduler config — start with localStorage cache, then sync from DB
  const [schedulerConfig, setSchedulerConfig] = useState(DEFAULT_SCHEDULER_CONFIG);
  useEffect(() => {
    setSchedulerConfig(loadSchedulerConfig());
    fetchSchedulerConfig().then(setSchedulerConfig);
  }, []);
  const TIME_SLOTS = useMemo(
    () => generateTimeSlots(schedulerConfig.startHour, schedulerConfig.endHour, getActiveInterval(schedulerConfig)),
    [schedulerConfig]
  );

  const getAppointmentsForDay = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return appointments.filter((a) => a.appointment_date === dateStr);
  };

  return (
    <div className="min-w-[900px]">
      {/* Day headers */}
      <div className="sticky top-0 z-10 flex border-b border-border bg-card">
        <div className="w-16 shrink-0 border-r border-border" />
        {weekDays.map((day) => {
          const dayAppointments = getAppointmentsForDay(day);
          const today = isToday(day);
          const isDayDisabled = schedulerConfig.disabledWeekdays.includes(day.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6);

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex-1 border-r border-border px-2 py-2 text-center",
                today && !isDayDisabled && "bg-primary/5",
                isDayDisabled && "bg-muted/60 opacity-60"
              )}
            >
              <p className={cn("text-xs capitalize", isDayDisabled ? "text-muted-foreground/50" : "text-muted-foreground")}>
                {format(day, "EEE", { locale: es })}
              </p>
              <p
                className={cn(
                  "text-lg font-semibold",
                  isDayDisabled ? "text-muted-foreground/40" : today ? "text-primary" : ""
                )}
              >
                {format(day, "d")}
              </p>
              {isDayDisabled ? (
                <span className="inline-block mt-0.5 text-[10px] text-muted-foreground/40 font-medium">
                  {t("scheduler.closed") || "Cerrado"}
                </span>
              ) : dayAppointments.length > 0 ? (
                <span className="inline-block mt-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {dayAppointments.length}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="relative">
        {/* Column separator overlay — renders above cards (z-8 > z-5) so
            vertical lines are never hidden by overflowing appointment cards */}
        <div className="pointer-events-none absolute inset-0 z-[8] flex">
          <div className="w-16 shrink-0 border-r border-border" />
          {weekDays.map((day) => (
            <div key={day.toISOString()} className="flex-1 border-r border-border" />
          ))}
        </div>

        {TIME_SLOTS.map((time) => {
          const isHour = time.endsWith(":00");
          return (
            <div
              key={time}
              className={cn(
                "flex",
                isHour ? "border-t border-border" : "border-t border-border/30"
              )}
            >
              {/* Time label */}
              <div className="w-16 shrink-0 border-r border-border px-1 py-1 text-right">
                {isHour && (
                  <span className="text-xs text-muted-foreground">{time}</span>
                )}
              </div>

              {/* Day columns */}
              {weekDays.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const today = isToday(day);
                const isDayDisabled = schedulerConfig.disabledWeekdays.includes(day.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6);
                const block = getBlockForDay(blocks, dateStr, time);

                // ---- DISABLED day (closed) ----
                if (isDayDisabled) {
                  return (
                    <div
                      key={day.toISOString()}
                      className="relative flex-1 border-r border-border bg-muted/40"
                      style={{ height: "32px" }}
                    >
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(128,128,128,0.06) 6px, rgba(128,128,128,0.06) 12px)",
                        }}
                      />
                    </div>
                  );
                }

                // ---- BLOCKED slot ----
                if (block) {
                  const isBreakTime = block.reason === "__break_time__";
                  const stripeColor = isBreakTime
                    ? "rgba(59,130,246,0.15)"
                    : "rgba(107,114,128,0.12)";
                  const bgColor = isBreakTime
                    ? "rgba(59,130,246,0.05)"
                    : "rgba(107,114,128,0.06)";

                  return (
                    <div
                      key={day.toISOString()}
                      className="relative flex-1 border-r border-border"
                      style={{ height: "32px" }}
                    >
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{
                          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 4px, ${stripeColor} 4px, ${stripeColor} 8px)`,
                          backgroundColor: bgColor,
                        }}
                      >
                        {isHour && (
                          <span
                            className={`flex items-center gap-0.5 text-[9px] pointer-events-none ${
                              isBreakTime ? "text-blue-500/60" : "text-muted-foreground/50"
                            }`}
                          >
                            {isBreakTime ? (
                              <Coffee className="h-2.5 w-2.5" />
                            ) : (
                              <Lock className="h-2.5 w-2.5" />
                            )}
                            {isBreakTime ? "Break" : (block.reason ?? "Bloq.")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                // Find ALL appointments starting at this slot (exact match + non-aligned fallback)
                const interval = getActiveInterval(schedulerConfig);
                const [slH, slM] = time.split(":").map(Number);
                const slotEndMin = slH * 60 + slM + interval;
                const nextSlot = `${Math.floor(slotEndMin / 60).toString().padStart(2, "0")}:${(slotEndMin % 60).toString().padStart(2, "0")}`;
                const slotAppts = appointments.filter(
                  (a) =>
                    a.appointment_date === dateStr &&
                    (a.start_time.slice(0, 5) === time ||
                     (a.start_time.slice(0, 5) > time && a.start_time.slice(0, 5) < nextSlot))
                );
                const startAppt = slotAppts[0] ?? null;
                const extraCount = slotAppts.length - 1;

                // Check if slot is occupied by ongoing appointment
                const occupied = appointments.some((a) => {
                  if (a.appointment_date !== dateStr) return false;
                  const start = a.start_time.slice(0, 5);
                  const end = a.end_time.slice(0, 5);
                  return time > start && time < end;
                });

                if (startAppt) {
                  const startMinutes =
                    parseInt(startAppt.start_time.slice(0, 2)) * 60 +
                    parseInt(startAppt.start_time.slice(3, 5));
                  const endMinutes =
                    parseInt(startAppt.end_time.slice(0, 2)) * 60 +
                    parseInt(startAppt.end_time.slice(3, 5));
                  const durationSlots = (endMinutes - startMinutes) / getActiveInterval(schedulerConfig);
                  const doctorColor = startAppt.doctors?.color ?? "#9ca3af";

                  // Doctor role: other doctors' appointments are desaturated & non-interactive
                  const isOtherDoctorAppt = currentDoctorId != null && startAppt.doctor_id !== currentDoctorId;

                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "relative flex-1 border-r border-border p-0.5",
                        today && "bg-primary/5"
                      )}
                      style={{ height: "32px" }}
                    >
                      <button
                        onClick={() => onAppointmentClick(startAppt)}
                        className={cn(
                          "absolute inset-x-1.5 top-0.5 z-[5] rounded px-1 py-0.5 text-left transition-all overflow-hidden",
                          isOtherDoctorAppt
                            ? "cursor-default"
                            : "hover:shadow-md",
                          selectedAppointmentId === startAppt.id && !isOtherDoctorAppt && "ring-2 ring-primary shadow-lg z-[6]"
                        )}
                        style={{
                          height: `${durationSlots * 32 - 4}px`,
                          backgroundColor: hexToPastel(doctorColor, 0.18),
                          borderLeft: `4px solid ${doctorColor}`,
                          ...(isOtherDoctorAppt ? { filter: "saturate(0.5)", opacity: 0.6 } : {}),
                        }}
                      >
                        <div className="flex items-center gap-0.5">
                          <p className="text-[10px] font-semibold truncate flex-1" style={{ color: hexToDark(doctorColor) }}>
                            {startAppt.start_time.slice(0, 5)} {startAppt.patient_name}
                          </p>
                          {extraCount > 0 && (
                            <span className="shrink-0 rounded-full bg-primary px-1 text-[8px] font-bold text-primary-foreground leading-tight">
                              +{extraCount}
                            </span>
                          )}
                          {!isOtherDoctorAppt && (startAppt as any).meeting_url && (
                            <Video className="h-2.5 w-2.5 shrink-0 text-blue-500" />
                          )}
                          {!isOtherDoctorAppt && startAppt.price_snapshot != null && Number(startAppt.price_snapshot) > 0 && (
                            (paymentTotals[startAppt.id] ?? 0) >= Number(startAppt.price_snapshot) ? (
                              <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-emerald-600" />
                            ) : (paymentTotals[startAppt.id] ?? 0) > 0 ? (
                              <CircleDollarSign className="h-2.5 w-2.5 shrink-0 text-amber-600" />
                            ) : null
                          )}
                        </div>
                        {durationSlots > 1 && (
                          <p className="text-[10px] truncate font-medium" style={{ color: hexToDark(doctorColor, 0.6) }}>
                            {startAppt.services?.name ?? "—"}
                          </p>
                        )}
                        {durationSlots > 2 && (
                          <p className="text-[10px] truncate" style={{ color: hexToDark(doctorColor, 0.55) }}>
                            {startAppt.doctors?.full_name ?? "—"}
                          </p>
                        )}
                      </button>
                    </div>
                  );
                }

                if (occupied) {
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "flex-1 border-r border-border",
                        today && "bg-primary/5"
                      )}
                      style={{ height: "32px" }}
                    />
                  );
                }

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "group relative flex-1 cursor-pointer border-r border-border transition-colors hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10",
                      today && "bg-primary/5"
                    )}
                    style={{ height: "32px" }}
                    onClick={() =>
                      onSlotClick(day, time, offices[0]?.id ?? "")
                    }
                  >
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="h-3 w-3 text-emerald-500" />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
