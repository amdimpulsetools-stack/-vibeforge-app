"use client";

import { format, addDays, startOfWeek, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, Office, ScheduleBlock } from "@/types/admin";
import { APPOINTMENT_STATUS_COLORS } from "@/types/admin";
import { cn } from "@/lib/utils";
import { Plus, Coffee, Lock, CheckCircle2, CircleDollarSign } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { loadSchedulerConfig, generateTimeSlots, DEFAULT_SCHEDULER_CONFIG } from "@/lib/scheduler-config";

interface WeekViewProps {
  currentDate: Date;
  appointments: AppointmentWithRelations[];
  offices: Office[];
  blocks: ScheduleBlock[];
  paymentTotals?: Record<string, number>;
  selectedAppointmentId?: string;
  onSlotClick: (date: Date, time: string, officeId: string) => void;
  onAppointmentClick: (appointment: AppointmentWithRelations) => void;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  onSlotClick,
  onAppointmentClick,
}: WeekViewProps) {
  const { t } = useLanguage();
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Scheduler config — start with defaults, then load from localStorage after mount
  const [schedulerConfig, setSchedulerConfig] = useState(DEFAULT_SCHEDULER_CONFIG);
  useEffect(() => {
    setSchedulerConfig(loadSchedulerConfig());
  }, []);
  const TIME_SLOTS = useMemo(
    () => generateTimeSlots(schedulerConfig.startHour, schedulerConfig.endHour, schedulerConfig.interval),
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

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex-1 border-r border-border px-2 py-2 text-center",
                today && "bg-primary/5"
              )}
            >
              <p className="text-xs text-muted-foreground capitalize">
                {format(day, "EEE", { locale: es })}
              </p>
              <p
                className={cn(
                  "text-lg font-semibold",
                  today && "text-primary"
                )}
              >
                {format(day, "d")}
              </p>
              {dayAppointments.length > 0 && (
                <span className="inline-block mt-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {dayAppointments.length}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div>
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
                const block = getBlockForDay(blocks, dateStr, time);

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

                // Find ALL appointments starting at this slot
                const slotAppts = appointments.filter(
                  (a) =>
                    a.appointment_date === dateStr &&
                    a.start_time.slice(0, 5) === time
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
                  const durationSlots = (endMinutes - startMinutes) / schedulerConfig.interval;
                  const doctorColor = startAppt.doctors?.color ?? "#9ca3af";

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
                          "absolute inset-x-1.5 top-0.5 z-[5] rounded px-1 py-0.5 text-left transition-all hover:shadow-md overflow-hidden",
                          selectedAppointmentId === startAppt.id && "ring-2 ring-primary shadow-lg z-[6]"
                        )}
                        style={{
                          height: `${durationSlots * 32 - 4}px`,
                          backgroundColor: hexToRgba(doctorColor, 0.15),
                          borderLeft: `4px solid ${doctorColor}`,
                        }}
                      >
                        <div className="flex items-center gap-0.5">
                          <p className="text-[10px] font-semibold truncate text-foreground flex-1">
                            {startAppt.start_time.slice(0, 5)} {startAppt.patient_name}
                          </p>
                          {extraCount > 0 && (
                            <span className="shrink-0 rounded-full bg-primary px-1 text-[8px] font-bold text-primary-foreground leading-tight">
                              +{extraCount}
                            </span>
                          )}
                          {startAppt.price_snapshot != null && Number(startAppt.price_snapshot) > 0 && (
                            (paymentTotals[startAppt.id] ?? 0) >= Number(startAppt.price_snapshot) ? (
                              <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-emerald-500" />
                            ) : (paymentTotals[startAppt.id] ?? 0) > 0 ? (
                              <CircleDollarSign className="h-2.5 w-2.5 shrink-0 text-amber-500" />
                            ) : null
                          )}
                        </div>
                        {durationSlots > 1 && (
                          <p className="text-[10px] truncate font-medium" style={{ color: doctorColor }}>
                            {startAppt.services?.name ?? "—"}
                          </p>
                        )}
                        {durationSlots > 2 && (
                          <p className="text-[10px] text-muted-foreground truncate">
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
