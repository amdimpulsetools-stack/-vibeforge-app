"use client";

import { format } from "date-fns";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, Office, ScheduleBlock } from "@/types/admin";
import { APPOINTMENT_STATUS_COLORS } from "@/types/admin";
import { cn } from "@/lib/utils";
import { Plus, Lock, LockOpen, Coffee } from "lucide-react";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { loadSchedulerConfig, fetchSchedulerConfig, generateTimeSlots, getActiveInterval, DEFAULT_SCHEDULER_CONFIG, computeSlotHeight } from "@/lib/scheduler-config";
import { AppointmentCard } from "./appointment-card";
import { useNow } from "./now-provider";

/** Minimum px per slot in the day view. Raised 40 → 44 so single-slot
 * cards get ~40 px of content box (two text lines + pill breathe
 * comfortably). computeSlotHeight already grows rows for short
 * schedules, so this floor only affects 12 h+ schedules — the cost is
 * one extra scroll notch on a 24-row day. */
const DAY_BASE_SLOT_HEIGHT = 44;
/** Sticky office-name header rendered inside the scroll container (must be
 * subtracted from container height when distributing rows). py-3 + text-sm. */
const DAY_HEADER_HEIGHT = 44;

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
  /** Height of the scroll container the view lives in. When set, rows grow
   * to fill it for short schedules; falsy → falls back to base slot height. */
  containerHeight?: number;
  /** Live status (Part E) — receptionists can't end/reopen. */
  canEndReopen?: boolean;
  /** Refetch hook fired after a live-status transition. */
  onLiveChanged?: () => void;
}


// PERF: indices pre-built per render turn the per-cell lookup from O(N)
// to O(1). At 200 appointments × 50 slots × 5 offices the previous
// linear scans ran 50,000+ comparisons per render; now it's ~250 Map
// lookups. See buildAppointmentIndices below.
interface AppointmentIndices {
  /** Exact-start lookup by `${officeId}|${slotTime}`. */
  byExactStart: Map<string, AppointmentWithRelations>;
  /** "Is this slot occupied by ANY appointment (including continuation)" — keyed `${officeId}|${slotTime}`. */
  occupiedSlots: Set<string>;
  /** Appointments sorted by start_time, for range-fallback lookups. */
  sorted: AppointmentWithRelations[];
}

function buildAppointmentIndices(
  appointments: AppointmentWithRelations[],
  dateStr: string,
  slotMinutes: number
): AppointmentIndices {
  const byExactStart = new Map<string, AppointmentWithRelations>();
  const occupiedSlots = new Set<string>();
  const sorted: AppointmentWithRelations[] = [];

  for (const a of appointments) {
    if (a.appointment_date !== dateStr) continue;
    sorted.push(a);

    const start = a.start_time.slice(0, 5);
    byExactStart.set(`${a.office_id}|${start}`, a);

    // Mark every grid slot covered by this appointment as occupied.
    const [sh, sm] = a.start_time.slice(0, 5).split(":").map(Number);
    const [eh, em] = a.end_time.slice(0, 5).split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    for (let m = startMin; m < endMin; m += slotMinutes) {
      const hh = Math.floor(m / 60).toString().padStart(2, "0");
      const mm = (m % 60).toString().padStart(2, "0");
      occupiedSlots.add(`${a.office_id}|${hh}:${mm}`);
    }
  }

  sorted.sort((a, b) => a.start_time.localeCompare(b.start_time));
  return { byExactStart, occupiedSlots, sorted };
}

function getAppointmentForSlot(
  indices: AppointmentIndices,
  officeId: string,
  slotTime: string,
  intervalMinutes: number
): AppointmentWithRelations | null {
  const exact = indices.byExactStart.get(`${officeId}|${slotTime}`);
  if (exact) return exact;

  // Fallback for appointments whose start_time doesn't align with grid slots.
  // Rare; O(N) scan of pre-filtered sorted list is acceptable.
  const [sh, sm] = slotTime.split(":").map(Number);
  const slotStartMin = sh * 60 + sm;
  const slotEndMin = slotStartMin + intervalMinutes;
  const nextSlot = `${Math.floor(slotEndMin / 60).toString().padStart(2, "0")}:${(slotEndMin % 60).toString().padStart(2, "0")}`;

  return (
    indices.sorted.find(
      (a) =>
        a.office_id === officeId &&
        a.start_time.slice(0, 5) > slotTime &&
        a.start_time.slice(0, 5) < nextSlot
    ) ?? null
  );
}

function isSlotOccupied(
  indices: AppointmentIndices,
  officeId: string,
  slotTime: string
): boolean {
  return indices.occupiedSlots.has(`${officeId}|${slotTime}`);
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

// Color helpers (hexToPastel / hexToDark) moved to appointment-card.tsx
// together with the card markup they styled.

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
  containerHeight,
  canEndReopen = false,
  onLiveChanged,
}: DayViewProps) {
  const { t } = useLanguage();
  const dateStr = format(date, "yyyy-MM-dd");
  const currentDate = date;
  const dragApptId = useRef<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ time: string; officeId: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  // Scheduler config — instant from localStorage, DB sync in background (non-blocking)
  const [schedulerConfig, setSchedulerConfig] = useState(() => loadSchedulerConfig());
  useEffect(() => {
    fetchSchedulerConfig().then(setSchedulerConfig).catch(() => {});
  }, []);
  const TIME_SLOTS = useMemo(
    () => generateTimeSlots(schedulerConfig.startHour, schedulerConfig.endHour, getActiveInterval(schedulerConfig)),
    [schedulerConfig]
  );

  // Auto-size rows so short schedules (e.g. 7am–2pm) fill the viewport
  // instead of leaving a big blank gap below. Long schedules keep the base
  // height and scroll as before.
  const slotHeight = useMemo(
    () => computeSlotHeight(containerHeight ?? 0, TIME_SLOTS.length, DAY_BASE_SLOT_HEIGHT, DAY_HEADER_HEIGHT),
    [containerHeight, TIME_SLOTS.length]
  );

  // PERF: pre-built indices for O(1) per-cell appointment/occupied lookups.
  // Rebuilds only when appointments array, dateStr, or slot interval change.
  const activeInterval = getActiveInterval(schedulerConfig);
  const apptIndices = useMemo(
    () => buildAppointmentIndices(appointments, dateStr, activeInterval),
    [appointments, dateStr, activeInterval]
  );

  // Current time indicator — uses the shared NowProvider ticker.
  // The per-minute re-render this triggers on DayView is cheap now:
  // all AppointmentCards are memoized, so the tick only repaints the
  // time line, not the card subtrees.
  const now = useNow();
  const showTimeIndicator = schedulerConfig.timeIndicator;

  const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const gridStartMinutes = schedulerConfig.startHour * 60;
  const gridEndMinutes = schedulerConfig.endHour * 60;
  const timeLineVisible =
    showTimeIndicator && isToday && currentMinutes >= gridStartMinutes && currentMinutes < gridEndMinutes;
  const timeLineTop = ((currentMinutes - gridStartMinutes) / getActiveInterval(schedulerConfig)) * slotHeight;

  // Live status — stale detection, computed HERE (the view owns the
  // minute tick) so the memoized cards don't subscribe to the ticker.
  // A consultation is "stale" (visually faded) when it's been open
  // for >1h AND the doctor's NEXT cita of the day has already passed
  // its start time. The second condition is the lunch-break guard:
  // a long consultation right before a schedule gap stays green —
  // only when the doctor visibly moved on does the old card fade.
  const liveStatusEnabled = schedulerConfig.liveStatus;
  const staleApptIds = useMemo(() => {
    if (!liveStatusEnabled || !isToday) return new Set<string>();
    const out = new Set<string>();
    const nowMs = now.getTime();
    const nowHHMM = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    for (const a of appointments) {
      if (a.appointment_date !== dateStr) continue;
      if (!a.consultation_started_at || a.consultation_ended_at) continue;
      const openMs = nowMs - new Date(a.consultation_started_at).getTime();
      if (openMs <= 60 * 60 * 1000) continue;
      const hasNextAlreadyDue = appointments.some(
        (b) =>
          b.id !== a.id &&
          b.doctor_id === a.doctor_id &&
          b.appointment_date === dateStr &&
          b.start_time.slice(0, 5) > a.start_time.slice(0, 5) &&
          b.start_time.slice(0, 5) <= nowHHMM,
      );
      if (hasNextAlreadyDue) out.add(a.id);
    }
    return out;
  }, [liveStatusEnabled, isToday, appointments, dateStr, now]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  const isDayDisabled = schedulerConfig.disabledWeekdays.includes(currentDate.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6);

  return (
    <div className="min-w-[600px] relative" onClick={() => setContextMenu(null)}>
      {/* Disabled day overlay — blocks entire grid */}
      {isDayDisabled && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-[2px] rounded-lg">
          <div className="flex flex-col items-center gap-3 text-center p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-muted-foreground/70">
              Día cerrado
            </h3>
            <p className="text-sm text-muted-foreground/50 max-w-xs">
              Este día está deshabilitado en la configuración de agenda.
              Puedes cambiarlo en Ajustes → Agenda.
            </p>
          </div>
        </div>
      )}

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
        {/* NOTE: there used to be a full-height "column separator
            overlay" here (z-8, a parallel flex re-drawing border-r per
            column). It was redundant — cards are inset-x-1.5 and never
            reach the cell borders — and actively harmful: its flex
            columns rasterized independently from the row flexes, so
            sub-pixel width rounding made the two 1px borders land on
            adjacent device pixels → the "doubled/rolled" separator
            users saw whenever cards sat side by side. The per-cell
            border-r is now the single source of truth. */}
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
                const startAppt = getAppointmentForSlot(apptIndices, office.id, time, activeInterval);
                const occupied = isSlotOccupied(apptIndices, office.id, time);
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

                  // Visual offset for appointments not aligned with grid
                  const [slotH, slotM] = time.split(":").map(Number);
                  const slotStartMin = slotH * 60 + slotM;
                  const offsetMinutes = startMinutes - slotStartMin;
                  const offsetPx = (offsetMinutes / interval) * slotHeight;

                  // Doctor role: other doctors' appointments are desaturated & non-interactive
                  const isOtherDoctorAppt = currentDoctorId != null && startAppt.doctor_id !== currentDoctorId;

                  return (
                    <div
                      key={office.id}
                      className="relative flex-1 border-r border-border p-0.5"
                      style={{ height: `${slotHeight}px` }}
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
                      <AppointmentCard
                        appointment={startAppt}
                        topPx={offsetPx + 2}
                        heightPx={durationSlots * slotHeight - 4}
                        isSelected={selectedAppointmentId === startAppt.id}
                        isOtherDoctor={isOtherDoctorAppt}
                        paymentTotal={paymentTotals[startAppt.id] ?? 0}
                        onClick={() => onAppointmentClick(startAppt)}
                        onDragStartCard={(id) => {
                          dragApptId.current = id;
                        }}
                        onDragEndCard={() => {
                          dragApptId.current = null;
                          setDragOverSlot(null);
                        }}
                        liveStatusEnabled={liveStatusEnabled}
                        canEndReopen={canEndReopen}
                        isStale={staleApptIds.has(startAppt.id)}
                        onLiveChanged={onLiveChanged}
                      />
                    </div>
                  );
                }

                // ---- OCCUPIED (continuation) ----
                if (occupied) {
                  return (
                    <div
                      key={office.id}
                      className="flex-1 border-r border-border"
                      style={{ height: `${slotHeight}px` }}
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
                      style={{ height: `${slotHeight}px` }}
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
                            {isBreakTime ? "Descanso" : (block.reason ?? "Bloqueado")}
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
                            title={isBreakTime ? "Configurar descanso" : "Desbloquear horario"}
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
                    style={{ height: `${slotHeight}px` }}
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
              {contextMenu.reason === "__break_time__" ? "Descanso" : contextMenu.reason}
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
