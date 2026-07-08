"use client";

import { format, addDays, startOfWeek, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, Office, ScheduleBlock } from "@/types/admin";
import { APPOINTMENT_STATUS_COLORS } from "@/types/admin";
import { cn } from "@/lib/utils";
import { Plus, Coffee, Lock, CheckCircle2, CircleDollarSign, Video } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { loadSchedulerConfig, fetchSchedulerConfig, generateTimeSlots, getActiveInterval, DEFAULT_SCHEDULER_CONFIG, computeSlotHeight } from "@/lib/scheduler-config";
// Color helpers shared with the day view — single source of truth in
// appointment-card.tsx so the palettes can't drift apart.
import { hexToPastel, hexToDark } from "./appointment-card";

/** Minimum px per slot in the week view (denser than day view). */
const WEEK_BASE_SLOT_HEIGHT = 32;
/** Sticky day-of-week header inside the scroll container. py-2 + 2 text rows + badge. */
const WEEK_HEADER_HEIGHT = 56;
import { RecurringDot } from "@/components/patients/recurring-badge";

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
  /** Height of the scroll container the view lives in. When set, rows grow
   * to fill it for short schedules; falsy → falls back to base slot height. */
  containerHeight?: number;
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
  containerHeight,
}: WeekViewProps) {
  const { t } = useLanguage();
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Scheduler config — instant from localStorage, DB sync in background
  const [schedulerConfig, setSchedulerConfig] = useState(() => loadSchedulerConfig());
  useEffect(() => {
    fetchSchedulerConfig().then(setSchedulerConfig).catch(() => {});
  }, []);
  const TIME_SLOTS = useMemo(
    () => generateTimeSlots(schedulerConfig.startHour, schedulerConfig.endHour, getActiveInterval(schedulerConfig)),
    [schedulerConfig]
  );

  // Auto-size rows so short schedules fill the viewport instead of leaving a
  // blank gap below. Long schedules keep base height + scroll.
  const slotHeight = useMemo(
    () => computeSlotHeight(containerHeight ?? 0, TIME_SLOTS.length, WEEK_BASE_SLOT_HEIGHT, WEEK_HEADER_HEIGHT),
    [containerHeight, TIME_SLOTS.length]
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
        {/* Column separators: ONE full-height layer behind content
            (z-0). Cells draw no vertical borders — see day-view.tsx
            for the full history of why (per-row borders fragment at
            fractional widths; the old z-8 overlay doubled lines). */}
        <div className="pointer-events-none absolute inset-0 z-0 flex">
          <div className="w-16 shrink-0 border-r border-border" />
          {weekDays.map((day) => (
            <div key={day.toISOString()} className="flex-1 border-r border-border" />
          ))}
        </div>

        {TIME_SLOTS.map((time, slotIndex) => {
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
              <div className="w-16 shrink-0 px-1 py-1 text-right">
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
                      className="relative flex-1 bg-muted/40"
                      style={{ height: `${slotHeight}px` }}
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
                      className="relative flex-1"
                      style={{ height: `${slotHeight}px` }}
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

                // Find ALL appointments whose start falls in this slot. The grid
                // resets to :00 each hour (interval 45 → …07:45, 08:00…), so the
                // next boundary is NOT always start+interval — read it from
                // TIME_SLOTS. Assuming 07:45+45=08:30 previously made row 07:45's
                // range swallow the 08:00 appointment while row 08:00 matched it
                // too, rendering the same card twice (one misplaced at 07:45).
                // Half-open [time, nextSlot) ⇒ every appointment lands in exactly
                // one slot.
                const interval = getActiveInterval(schedulerConfig);
                const [slH, slM] = time.split(":").map(Number);
                const slotEndMin = slH * 60 + slM + interval;
                const nextSlot =
                  slotIndex + 1 < TIME_SLOTS.length
                    ? TIME_SLOTS[slotIndex + 1]
                    : `${Math.floor(slotEndMin / 60).toString().padStart(2, "0")}:${(slotEndMin % 60).toString().padStart(2, "0")}`;
                const slotAppts = appointments.filter(
                  (a) =>
                    a.appointment_date === dateStr &&
                    a.start_time.slice(0, 5) >= time &&
                    a.start_time.slice(0, 5) < nextSlot
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
                        "relative flex-1 p-0.5",
                        today && "bg-primary/5"
                      )}
                      style={{ height: `${slotHeight}px` }}
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
                          height: `${durationSlots * slotHeight - 4}px`,
                          backgroundColor: hexToPastel(doctorColor, 0.18),
                          borderLeft: `4px solid ${doctorColor}`,
                          ...(isOtherDoctorAppt ? { filter: "saturate(0.5)", opacity: 0.6 } : {}),
                        }}
                      >
                        <div className="flex items-center gap-0.5">
                          {startAppt.patients?.is_recurring && (
                            <RecurringDot className="shrink-0" />
                          )}
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
                          {!isOtherDoctorAppt && startAppt.price_snapshot != null && Number(startAppt.price_snapshot) > 0 && (() => {
                            const gross = Number(startAppt.price_snapshot);
                            const discount = Number(
                              (startAppt as { discount_amount?: number | null }).discount_amount ?? 0
                            );
                            const effective = Math.max(0, gross - discount);
                            const paid = paymentTotals[startAppt.id] ?? 0;
                            if (effective === 0 || paid >= effective) {
                              return <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-emerald-600" />;
                            }
                            if (paid > 0) {
                              return <CircleDollarSign className="h-2.5 w-2.5 shrink-0 text-amber-600" />;
                            }
                            return null;
                          })()}
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
                        "flex-1",
                        today && "bg-primary/5"
                      )}
                      style={{ height: `${slotHeight}px` }}
                    />
                  );
                }

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "group relative flex-1 cursor-pointer transition-colors hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10",
                      today && "bg-primary/5"
                    )}
                    style={{ height: `${slotHeight}px` }}
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
