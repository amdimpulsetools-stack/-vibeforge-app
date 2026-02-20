"use client";

import { format, addDays, startOfWeek, isToday, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, Office } from "@/types/admin";
import {
  SCHEDULER_START_HOUR,
  SCHEDULER_END_HOUR,
  SCHEDULER_INTERVAL,
  APPOINTMENT_STATUS_COLORS,
} from "@/types/admin";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

interface WeekViewProps {
  currentDate: Date;
  appointments: AppointmentWithRelations[];
  offices: Office[];
  onSlotClick: (date: Date, time: string, officeId: string) => void;
  onAppointmentClick: (appointment: AppointmentWithRelations) => void;
}

function generateTimeSlots() {
  const slots: string[] = [];
  for (let h = SCHEDULER_START_HOUR; h < SCHEDULER_END_HOUR; h++) {
    for (let m = 0; m < 60; m += SCHEDULER_INTERVAL) {
      slots.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

export function WeekView({
  currentDate,
  appointments,
  offices,
  onSlotClick,
  onAppointmentClick,
}: WeekViewProps) {
  const { t } = useLanguage();
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

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

                // Find appointment starting at this slot
                const startAppt = appointments.find(
                  (a) =>
                    a.appointment_date === dateStr &&
                    a.start_time.slice(0, 5) === time
                );

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
                  const durationSlots = (endMinutes - startMinutes) / SCHEDULER_INTERVAL;
                  const statusColor =
                    APPOINTMENT_STATUS_COLORS[startAppt.status] ?? "#9ca3af";

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
                        className="absolute inset-x-0.5 top-0.5 z-[5] rounded bg-emerald-100/90 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 px-1 py-0.5 text-left transition-all hover:shadow-md overflow-hidden"
                        style={{
                          height: `${durationSlots * 32 - 4}px`,
                          borderLeftWidth: "4px",
                          borderLeftColor: statusColor,
                        }}
                      >
                        <p className="text-[10px] font-semibold truncate text-foreground">
                          {startAppt.start_time.slice(0, 5)} {startAppt.patient_name}
                        </p>
                        {durationSlots > 1 && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {startAppt.doctors?.full_name}
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
