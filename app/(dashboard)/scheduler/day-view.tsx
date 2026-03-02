"use client";

import { format } from "date-fns";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, Office, ScheduleBlock } from "@/types/admin";
import { APPOINTMENT_STATUS_COLORS } from "@/types/admin";
import { cn } from "@/lib/utils";
import { Plus, Lock, LockOpen, Coffee, CircleDollarSign, CheckCircle2 } from "lucide-react";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { loadSchedulerConfig, generateTimeSlots, getActiveInterval, DEFAULT_SCHEDULER_CONFIG } from "@/lib/scheduler-config";

interface DayViewProps {
  date: Date;
  appointments: AppointmentWithRelations[];
  offices: Office[];
  blocks: ScheduleBlock[];
  paymentTotals?: Record<string, number>;
  selectedAppointmentId?: string;
  /** When set, appointments from other doctors are shown desaturated and non-interactive */
  currentDoctorId?: string | null;
  onSlotClick: (date: Date, time: string, officeId: string) => void;
  onAppointmentClick: (appointment: AppointmentWithRelations) => void;
  onAppointmentDrop?: (appointmentId: string, date: Date, time: string, officeId: string) => void;
  onUnblock?: (blockId: string) => void;
}


function getAppointmentForSlot(
  appointments: AppointmentWithRelations[],
  dateStr: string,
  officeId: string,
  slotTime: string,
  intervalMinutes: number
): AppointmentWithRelations | null {
  // First try exact match (fast path)
  const exact = appointments.find(
    (a) =>
      a.appointment_date === dateStr &&
      a.office_id === officeId &&
      a.start_time.slice(0, 5) === slotTime
  );
  if (exact) return exact;

  // Fallback: find appointment starting within this slot's range [slotTime, nextSlotTime)
  // This handles appointments rescheduled to times that don't align with grid slots
  const [sh, sm] = slotTime.split(":").map(Number);
  const slotStartMin = sh * 60 + sm;
  const slotEndMin = slotStartMin + intervalMinutes;
  const nextSlot = `${Math.floor(slotEndMin / 60).toString().padStart(2, "0")}:${(slotEndMin % 60).toString().padStart(2, "0")}`;

  return (
    appointments.find(
      (a) =>
        a.appointment_date === dateStr &&
        a.office_id === officeId &&
        a.start_time.slice(0, 5) > slotTime &&
        a.start_time.slice(0, 5) < nextSlot
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

function getBlockForSlot(
  blocks: ScheduleBlock[],
  dateStr: string,
  officeId: string,
  slotTime: string
): ScheduleBlock | null {
  return (
    blocks.find((b) => {
      if (b.block_date !== dateStr) return false;
      if (b.office_id && b.office_id !== officeId) return false;
      if (b.all_day) return true;
      const start = b.start_time?.slice(0, 5) ?? "00:00";
      const end = b.end_time?.slice(0, 5) ?? "23:59";
      return slotTime >= start && slotTime < end;
    }) ?? null
  );
}

type ContextMenu = { x: number; y: number; blockId: string; reason?: string | null };

/** Blend a hex color at a given alpha with the dark card background,
 *  producing a fully opaque color that looks identical to rgba but
 *  doesn't let grid lines bleed through.                              */
function hexToSolid(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Dark card bg ≈ oklch(0.1 0.02 265) ≈ rgb(18,18,28)
  const bgR = 18, bgG = 18, bgB = 28;
  return `rgb(${Math.round(r * alpha + bgR * (1 - alpha))}, ${Math.round(g * alpha + bgG * (1 - alpha))}, ${Math.round(b * alpha + bgB * (1 - alpha))})`;
}

export function DayView({
  date,
  appointments,
  offices,
  blocks,
  paymentTotals = {},
  selectedAppointmentId,
  currentDoctorId,
  onSlotClick,
  onAppointmentClick,
  onAppointmentDrop,
  onUnblock,
}: DayViewProps) {
  const dateStr = format(date, "yyyy-MM-dd");
  const dragApptId = useRef<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ time: string; officeId: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  // Scheduler config — start with defaults, then load from localStorage after mount
  const [schedulerConfig, setSchedulerConfig] = useState(DEFAULT_SCHEDULER_CONFIG);
  useEffect(() => {
    setSchedulerConfig(loadSchedulerConfig());
  }, []);
  const TIME_SLOTS = useMemo(
    () => generateTimeSlots(schedulerConfig.startHour, schedulerConfig.endHour, getActiveInterval(schedulerConfig)),
    [schedulerConfig]
  );

  // Current time indicator
  const [now, setNow] = useState(() => new Date());
  const showTimeIndicator = schedulerConfig.timeIndicator;

  useEffect(() => {
    if (!showTimeIndicator) return;
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, [showTimeIndicator]);

  const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const gridStartMinutes = schedulerConfig.startHour * 60;
  const gridEndMinutes = schedulerConfig.endHour * 60;
  const timeLineVisible =
    showTimeIndicator && isToday && currentMinutes >= gridStartMinutes && currentMinutes < gridEndMinutes;
  // Each slot is 40px tall; interval defines minutes-per-slot
  const timeLineTop = ((currentMinutes - gridStartMinutes) / getActiveInterval(schedulerConfig)) * 40;

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  return (
    <div className="min-w-[600px]" onClick={() => setContextMenu(null)}>
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
      <div className="relative">
        {/* Column separator overlay — renders above cards (z-8 > z-5) so
            vertical lines are never hidden by overflowing appointment cards */}
        <div className="pointer-events-none absolute inset-0 z-[8] flex">
          <div className="w-20 shrink-0 border-r border-border" />
          {offices.map((office) => (
            <div key={office.id} className="flex-1 border-r border-border" />
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
              <div className="w-20 shrink-0 border-r border-border px-2 py-2 text-right">
                {isHour && (
                  <span className="text-xs text-muted-foreground">{time}</span>
                )}
              </div>

              {/* Office columns */}
              {offices.map((office) => {
                const startAppt = getAppointmentForSlot(appointments, dateStr, office.id, time, getActiveInterval(schedulerConfig));
                const occupied = isSlotOccupied(appointments, dateStr, office.id, time);
                const block = getBlockForSlot(blocks, dateStr, office.id, time);

                // ---- APPOINTMENT starting here ----
                if (startAppt) {
                  const interval = getActiveInterval(schedulerConfig);
                  const startMinutes =
                    parseInt(startAppt.start_time.slice(0, 2)) * 60 +
                    parseInt(startAppt.start_time.slice(3, 5));
                  const endMinutes =
                    parseInt(startAppt.end_time.slice(0, 2)) * 60 +
                    parseInt(startAppt.end_time.slice(3, 5));
                  const durationSlots = (endMinutes - startMinutes) / interval;
                  const doctorColor = startAppt.doctors?.color ?? "#9ca3af";

                  // Visual offset for appointments not aligned with grid
                  const [slotH, slotM] = time.split(":").map(Number);
                  const slotStartMin = slotH * 60 + slotM;
                  const offsetMinutes = startMinutes - slotStartMin;
                  const offsetPx = (offsetMinutes / interval) * 40;

                  // Doctor role: other doctors' appointments are desaturated & non-interactive
                  const isOtherDoctorAppt = currentDoctorId != null && startAppt.doctor_id !== currentDoctorId;

                  return (
                    <div
                      key={office.id}
                      className="relative flex-1 border-r border-border p-0.5"
                      style={{ height: `${40}px` }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverSlot({ time, officeId: office.id });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverSlot(null);
                        const apptId = dragApptId.current;
                        if (apptId && onAppointmentDrop) {
                          onAppointmentDrop(apptId, date, time, office.id);
                        }
                        dragApptId.current = null;
                      }}
                    >
                      <button
                        draggable={!isOtherDoctorAppt}
                        onDragStart={(e) => {
                          if (isOtherDoctorAppt) { e.preventDefault(); return; }
                          dragApptId.current = startAppt.id;
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => { dragApptId.current = null; setDragOverSlot(null); }}
                        onClick={() => onAppointmentClick(startAppt)}
                        className={cn(
                          "absolute inset-x-1.5 z-[5] rounded-lg px-2 py-0.5 text-left transition-all overflow-hidden flex flex-col justify-center",
                          isOtherDoctorAppt
                            ? "cursor-default"
                            : "cursor-grab active:cursor-grabbing hover:shadow-md",
                          selectedAppointmentId === startAppt.id && !isOtherDoctorAppt && "ring-2 ring-primary shadow-lg z-[6]"
                        )}
                        style={{
                          top: `${offsetPx + 2}px`,
                          height: `${durationSlots * 40 - 4}px`,
                          backgroundColor: hexToSolid(doctorColor, 0.15),
                          borderLeft: `4px solid ${doctorColor}`,
                          ...(isOtherDoctorAppt ? { filter: "saturate(0.5)", opacity: 0.6 } : {}),
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-bold truncate text-foreground leading-tight flex-1">
                            {startAppt.patient_name}
                          </p>
                          {/* Payment indicator */}
                          {!isOtherDoctorAppt && startAppt.price_snapshot != null && Number(startAppt.price_snapshot) > 0 && (
                            (paymentTotals[startAppt.id] ?? 0) >= Number(startAppt.price_snapshot) ? (
                              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                            ) : (paymentTotals[startAppt.id] ?? 0) > 0 ? (
                              <CircleDollarSign className="h-3 w-3 shrink-0 text-amber-500" />
                            ) : (
                              <CircleDollarSign className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                            )
                          )}
                        </div>
                        <p className="text-[11px] truncate text-muted-foreground leading-tight">
                          {startAppt.doctors?.full_name ?? "—"} · {startAppt.services?.name ?? "—"}
                        </p>
                      </button>
                    </div>
                  );
                }

                // ---- OCCUPIED (continuation) ----
                if (occupied) {
                  return (
                    <div
                      key={office.id}
                      className="flex-1 border-r border-border"
                      style={{ height: "40px" }}
                    />
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
                      key={office.id}
                      className="relative flex-1 border-r border-border"
                      style={{ height: "40px" }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, blockId: block.id, reason: block.reason });
                      }}
                    >
                      <div
                        className="absolute inset-0 flex items-center justify-between px-1.5"
                        style={{
                          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 4px, ${stripeColor} 4px, ${stripeColor} 8px)`,
                          backgroundColor: bgColor,
                        }}
                      >
                        {/* Label — only on :00 marks to avoid clutter */}
                        {time.endsWith(":00") ? (
                          <span
                            className={`flex items-center gap-1 text-[10px] pointer-events-none ${
                              isBreakTime
                                ? "text-blue-500/70"
                                : "text-muted-foreground/60"
                            }`}
                          >
                            {isBreakTime ? (
                              <Coffee className="h-3 w-3" />
                            ) : (
                              <Lock className="h-3 w-3" />
                            )}
                            {isBreakTime ? "Break Time" : (block.reason ?? "Bloqueado")}
                          </span>
                        ) : (
                          <span />
                        )}

                        {/* Unlock button — always visible on every slot */}
                        {onUnblock && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onUnblock(block.id);
                            }}
                            title={isBreakTime ? "Configurar Break Time" : "Desbloquear horario"}
                            className={`rounded p-0.5 transition-colors ${
                              isBreakTime
                                ? "text-blue-400/50 hover:bg-blue-500/20 hover:text-blue-500"
                                : "text-muted-foreground/40 hover:bg-background/70 hover:text-foreground"
                            }`}
                          >
                            <LockOpen className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                // ---- EMPTY slot (drop target + click to create) ----
                const isDropTarget =
                  dragOverSlot?.time === time && dragOverSlot?.officeId === office.id;

                return (
                  <div
                    key={office.id}
                    className={cn(
                      "group relative flex-1 cursor-pointer border-r border-border transition-colors",
                      isDropTarget
                        ? "bg-primary/20 ring-1 ring-inset ring-primary"
                        : "hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10"
                    )}
                    style={{ height: "40px" }}
                    onClick={() => onSlotClick(date, time, office.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverSlot({ time, officeId: office.id });
                    }}
                    onDragLeave={() => setDragOverSlot(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverSlot(null);
                      const apptId = dragApptId.current;
                      if (apptId && onAppointmentDrop) {
                        onAppointmentDrop(apptId, date, time, office.id);
                      }
                      dragApptId.current = null;
                    }}
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

        {/* Current time indicator line */}
        {timeLineVisible && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
            style={{ top: `${timeLineTop}px` }}
          >
            <div className="w-20 shrink-0 flex justify-end pr-1">
              <span className="rounded bg-red-500 px-1 py-0.5 text-[10px] font-bold text-white leading-none">
                {now.getHours().toString().padStart(2, "0")}:{now.getMinutes().toString().padStart(2, "0")}
              </span>
            </div>
            <div className="flex-1 h-0.5 bg-red-500 shadow-sm shadow-red-500/50" />
          </div>
        )}
      </div>

      {/* Context menu for unblocking (right-click on blocked slot) */}
      {contextMenu && onUnblock && (
        <div
          className="fixed z-50 rounded-lg border border-border bg-card shadow-lg py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.reason && (
            <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
              {contextMenu.reason === "__break_time__" ? "Break Time" : contextMenu.reason}
            </div>
          )}
          <button
            onClick={() => { onUnblock(contextMenu.blockId); setContextMenu(null); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LockOpen className="h-4 w-4" />
            Desbloquear
          </button>
        </div>
      )}
    </div>
  );
}
