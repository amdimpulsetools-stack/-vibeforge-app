"use client";

import { format } from "date-fns";
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

interface DayViewProps {
  date: Date;
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

function getAppointmentForSlot(
  appointments: AppointmentWithRelations[],
  dateStr: string,
  officeId: string,
  slotTime: string
): AppointmentWithRelations | null {
  return (
    appointments.find(
      (a) =>
        a.appointment_date === dateStr &&
        a.office_id === officeId &&
        a.start_time.slice(0, 5) === slotTime
    ) ?? null
  );
}

function isSlotOccupied(
  appointments: AppointmentWithRelations[],
  dateStr: string,
  officeId: string,
  slotTime: string
): boolean {
  return appointments.some((a) => {
    if (a.appointment_date !== dateStr || a.office_id !== officeId) return false;
    const start = a.start_time.slice(0, 5);
    const end = a.end_time.slice(0, 5);
    return slotTime >= start && slotTime < end;
  });
}

export function DayView({
  date,
  appointments,
  offices,
  onSlotClick,
  onAppointmentClick,
}: DayViewProps) {
  const { t } = useLanguage();
  const dateStr = format(date, "yyyy-MM-dd");

  return (
    <div className="min-w-[600px]">
      {/* Column headers */}
      <div className="sticky top-0 z-10 flex border-b border-border bg-card">
        <div className="w-20 shrink-0 border-r border-border" />
        {offices.map((office) => (
          <div
            key={office.id}
            className="flex-1 border-r border-border px-4 py-3 text-center"
          >
            <h3 className="text-sm font-semibold">{office.name}</h3>
          </div>
        ))}
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
              <div className="w-20 shrink-0 border-r border-border px-2 py-2 text-right">
                <span className="text-xs text-muted-foreground">{time}</span>
              </div>

              {/* Office columns */}
              {offices.map((office) => {
                const startAppt = getAppointmentForSlot(
                  appointments,
                  dateStr,
                  office.id,
                  time
                );
                const occupied = isSlotOccupied(
                  appointments,
                  dateStr,
                  office.id,
                  time
                );

                if (startAppt) {
                  // Calculate height based on duration
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
                      key={office.id}
                      className="relative flex-1 border-r border-border p-0.5"
                      style={{ height: `${40}px` }}
                    >
                      <button
                        onClick={() => onAppointmentClick(startAppt)}
                        className="absolute inset-x-0.5 top-0.5 z-[5] rounded-lg bg-orange-100/90 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800/50 px-2 py-1 text-left transition-all hover:shadow-md overflow-hidden"
                        style={{
                          height: `${durationSlots * 40 - 4}px`,
                          borderLeftWidth: "5px",
                          borderLeftColor: statusColor,
                        }}
                      >
                        <p className="text-xs font-semibold truncate text-foreground">
                          {startAppt.start_time.slice(0, 5)} {startAppt.patient_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          <span
                            className="inline-block h-2 w-2 rounded-full mr-1"
                            style={{ backgroundColor: startAppt.doctors?.color }}
                          />
                          {startAppt.doctors?.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {startAppt.services?.name}
                        </p>
                      </button>
                    </div>
                  );
                }

                if (occupied) {
                  // Slot occupied by a multi-slot appointment (not the start)
                  return (
                    <div
                      key={office.id}
                      className="flex-1 border-r border-border"
                      style={{ height: "40px" }}
                    />
                  );
                }

                // Empty slot
                return (
                  <div
                    key={office.id}
                    className="group relative flex-1 cursor-pointer border-r border-border transition-colors hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10"
                    style={{ height: "40px" }}
                    onClick={() => onSlotClick(date, time, office.id)}
                  >
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="h-4 w-4 text-emerald-500" />
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
