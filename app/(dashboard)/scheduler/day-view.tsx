"use client";

import { format } from "date-fns";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, Office, ScheduleBlock } from "@/types/admin";
import { APPOINTMENT_STATUS_COLORS } from "@/types/admin";
import { cn } from "@/lib/utils";
import { Plus, Lock, LockOpen, Coffee } from "lucide-react";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadSchedulerConfig, fetchSchedulerConfig, generateTimeSlots, getActiveInterval, getScheduleStartMinutes, getScheduleEndMinutes, DEFAULT_SCHEDULER_CONFIG, computeSlotHeight } from "@/lib/scheduler-config";
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
  /** The appointment that renders its CARD at this slot, keyed `${officeId}|${slotTime}`.
   *  The anchor is the single grid slot whose half-open range contains the
   *  appointment's start time (last slot with slotStart ≤ apptStart < nextSlotStart).
   *  Exactly one slot per appointment, so a card can never render twice. */
  byAnchorSlot: Map<string, AppointmentWithRelations>;
  /** "Is this slot occupied by ANY appointment (start or continuation)" — keyed `${officeId}|${slotTime}`. */
  occupiedSlots: Set<string>;
}

function buildAppointmentIndices(
  appointments: AppointmentWithRelations[],
  dateStr: string,
  timeSlots: string[],
  slotMinutes: number
): AppointmentIndices {
  const byAnchorSlot = new Map<string, AppointmentWithRelations>();
  const occupiedSlots = new Set<string>();

  // Real grid boundaries in minutes. The grid is a uniform stride, but rows
  // do NOT generally fall on interval boundaries relative to an appointment:
  // with interval 45 the rows are 07:00, 07:45, 08:30, 09:15… so an 08:00
  // start lands INSIDE row 07:45's span, not on a row. The geometry reads
  // real boundaries from timeSlots (never slotStart + interval), so an
  // appointment anchors to exactly the one row whose half-open range holds
  // its start — never double-rendering across two rows.
  const slotMins = timeSlots.map((s) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  });

  for (const a of appointments) {
    if (a.appointment_date !== dateStr) continue;

    const [sh, sm] = a.start_time.slice(0, 5).split(":").map(Number);
    const [eh, em] = a.end_time.slice(0, 5).split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    let anchorIdx = -1;
    for (let i = 0; i < timeSlots.length; i++) {
      const cellStart = slotMins[i];
      const cellEnd = i + 1 < slotMins.length ? slotMins[i + 1] : cellStart + slotMinutes;
      // Anchor: the one slot whose half-open range [cellStart, cellEnd) holds
      // the start. Contiguous non-overlapping ranges ⇒ at most one match.
      if (cellStart <= startMin && startMin < cellEnd) anchorIdx = i;
      // Occupied: any slot whose range overlaps the appointment [startMin, endMin).
      if (cellStart < endMin && cellEnd > startMin) {
        occupiedSlots.add(`${a.office_id}|${timeSlots[i]}`);
      }
    }
    if (anchorIdx >= 0) {
      byAnchorSlot.set(`${a.office_id}|${timeSlots[anchorIdx]}`, a);
    }
  }

  return { byAnchorSlot, occupiedSlots };
}

function getAppointmentForSlot(
  indices: AppointmentIndices,
  officeId: string,
  slotTime: string
): AppointmentWithRelations | null {
  return indices.byAnchorSlot.get(`${officeId}|${slotTime}`) ?? null;
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

  // Scheduler config — pinta al instante desde localStorage (placeholder) y
  // sincroniza con la BD vía React Query. La key es compartida entre las
  // vistas día/semana: alternar de vista ya no repite el fetch de sync (una
  // sola query por staleTime para ambas).
  const { data: schedulerConfig = loadSchedulerConfig() } = useQuery({
    queryKey: ["scheduler-config"],
    queryFn: () => fetchSchedulerConfig(),
    placeholderData: () => loadSchedulerConfig(),
  });
  const TIME_SLOTS = useMemo(
    () => generateTimeSlots(getScheduleStartMinutes(schedulerConfig), getScheduleEndMinutes(schedulerConfig), getActiveInterval(schedulerConfig)),
    [schedulerConfig]
  );

  const activeInterval = getActiveInterval(schedulerConfig);
  // Rows label/border on :00 only when the stride divides 60 (15/30/60) AND the
  // window opens on a whole hour (startMinute 0). A :15/:30/:45 offset (mig 175)
  // means no row ever lands on :00, so we must label every row — same rule as a
  // non-divisor interval like 45 (see the row render below).
  const hourAligned = 60 % activeInterval === 0 && getScheduleStartMinutes(schedulerConfig) % 60 === 0;

  // Real per-row minute geometry. The grid is a UNIFORM STRIDE, but the last
  // row's real span can be shorter than one interval: with interval 45 the
  // rows are 07:00, 07:45, 08:30… and the final row (e.g. 19:45 for a 20:00
  // close) is clamped so the grid ends exactly at endHour. slotMins = each
  // row's start (minutes-since-midnight); spanMin = minutes until the next
  // row, with the last row clamped to endHour. slotUnits = Σ spanMin /
  // interval = the number of full intervals the grid spans (= row count when
  // the stride divides the day evenly). The geometry reads these REAL
  // boundaries, which is what keeps this uniform-stride change safe.
  const { slotMins, spanMin, slotUnits } = useMemo(() => {
    const endMin = getScheduleEndMinutes(schedulerConfig);
    const slotMins = TIME_SLOTS.map((s) => {
      const [h, m] = s.split(":").map(Number);
      return h * 60 + m;
    });
    const spanMin = slotMins.map((m, i) =>
      i + 1 < slotMins.length
        ? slotMins[i + 1] - m
        : Math.max(1, Math.min(activeInterval, endMin - m))
    );
    const totalMin = spanMin.reduce((a, b) => a + b, 0);
    return { slotMins, spanMin, slotUnits: totalMin / activeInterval };
  }, [TIME_SLOTS, activeInterval, schedulerConfig]);

  // Auto-size rows so short schedules (e.g. 7am–2pm) fill the viewport
  // instead of leaving a big blank gap below. Long schedules keep the base
  // height and scroll as before. slotHeight = pixels of ONE full interval.
  const slotHeight = useMemo(
    () => computeSlotHeight(containerHeight ?? 0, slotUnits, DAY_BASE_SLOT_HEIGHT, DAY_HEADER_HEIGHT),
    [containerHeight, slotUnits]
  );

  // Linear pixel↔minute mapping. Because slotHeight is "pixels of one full
  // interval", pxPerMin is constant across the whole grid; the compressed
  // 15-min rows simply get proportionally fewer pixels. Row heights/tops and
  // minutesToY() all derive from the real spanMin so the axis stays linear.
  const { pxPerMin, rowHeights, minutesToY } = useMemo(() => {
    const pxPerMin = slotHeight / activeInterval;
    const rowHeights = spanMin.map((s) => s * pxPerMin);
    const rowTop: number[] = [];
    let acc = 0;
    for (const h of rowHeights) {
      rowTop.push(acc);
      acc += h;
    }
    const totalHeight = acc;
    // Find the row containing `min` and return its top + the linear delta.
    // Clamp before the first row / after the last row.
    const minutesToY = (min: number): number => {
      if (slotMins.length === 0) return 0;
      if (min <= slotMins[0]) return 0;
      for (let i = 0; i < slotMins.length; i++) {
        const start = slotMins[i];
        const end = i + 1 < slotMins.length ? slotMins[i + 1] : start + spanMin[i];
        if (min < end) return rowTop[i] + (min - start) * pxPerMin;
      }
      return totalHeight;
    };
    return { pxPerMin, rowHeights, minutesToY };
  }, [slotHeight, activeInterval, spanMin, slotMins]);

  // PERF: pre-built indices for O(1) per-cell appointment/occupied lookups.
  // Rebuilds only when appointments array, dateStr, or slot interval change.
  const apptIndices = useMemo(
    () => buildAppointmentIndices(appointments, dateStr, TIME_SLOTS, activeInterval),
    [appointments, dateStr, TIME_SLOTS, activeInterval]
  );

  // Current time indicator — uses the shared NowProvider ticker.
  // The per-minute re-render this triggers on DayView is cheap now:
  // all AppointmentCards are memoized, so the tick only repaints the
  // time line, not the card subtrees.
  const now = useNow();
  const showTimeIndicator = schedulerConfig.timeIndicator;

  const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const gridStartMinutes = getScheduleStartMinutes(schedulerConfig);
  const gridEndMinutes = getScheduleEndMinutes(schedulerConfig);
  const timeLineVisible =
    showTimeIndicator && isToday && currentMinutes >= gridStartMinutes && currentMinutes < gridEndMinutes;
  // Non-uniform grid: a uniform (currentMinutes − gridStart) × pxPerMin stride
  // is WRONG (it ignores the compressed 15-min rows). minutesToY walks to the
  // row that actually contains the current minute, so the ticker lands inside
  // the correct (possibly short) row.
  const timeLineTop = minutesToY(currentMinutes);

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

  // Ancho mínimo del grid. Desktop se queda EXACTAMENTE como estaba
  // (600 px desde md). En móvil se reduce, y con un solo consultorio no
  // se fuerza scroll horizontal: 80 px de gutter + 1 columna caben en 390.
  const gridMinWidth =
    offices.length <= 1 ? "min-w-0 md:min-w-[600px]" : "min-w-[480px] md:min-w-[600px]";

  return (
    <div className={cn(gridMinWidth, "relative")} onClick={() => setContextMenu(null)}>
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
        {/* Gutter de horas: sticky a la izquierda para que la referencia
            horaria no se pierda al scrollear en horizontal (móvil). */}
        <div className="sticky left-0 z-[2] w-20 shrink-0 border-r border-border bg-card" />
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
        {/* ── Column separators: ONE full-height layer BEHIND content ──
            History: v1 drew border-r on every cell + a duplicate
            overlay ABOVE cards (z-8) → two flex trees rounding
            fractional column widths independently → doubled/offset
            lines (removed in #196). v2 (per-cell borders only) still
            fragmented: every ROW is its own flex tree, so adjacent
            rows could rasterize their border one device-pixel apart →
            broken/jagged lines beside cards.
            v3 (this): cells draw NO vertical borders at all. This
            single layer at z-0 draws each column line as ONE
            continuous element — structurally impossible to fragment —
            and sits BEHIND cards (z-5) so it never cuts their chrome.
            Verified in a chromium lab at DPR 1 / 1.25 / 4. */}
        <div className="pointer-events-none absolute inset-0 z-0 flex">
          <div className="sticky left-0 w-20 shrink-0 border-r border-border" />
          {offices.map((office) => (
            <div key={office.id} className="flex-1 border-r border-border" />
          ))}
        </div>

        {TIME_SLOTS.map((time, slotIndex) => {
          const isHour = time.endsWith(":00");
          // hourAligned (15/30/60): classic behavior — label + solid border on
          // :00 rows only, lighter border elsewhere. Non-divisor (45): no row
          // is :00, so label EVERY row and give every row one shared weight.
          const showLabel = hourAligned ? isHour : true;
          const rowBorder = hourAligned
            ? isHour
              ? "border-t border-border"
              : "border-t border-border/30"
            : "border-t border-border/60";
          // Proportional row height (linear axis): full-interval rows =
          // slotHeight; a clamped final row is proportionally shorter.
          const rowHeight = rowHeights[slotIndex];
          return (
            <div
              key={time}
              className={cn("flex", rowBorder)}
            >
              {/* Time label — sticky left para sobrevivir al scroll horizontal.
                  z-[7] queda por encima de las tarjetas (z-[5]/z-[6]).
                  border-r propio: su `bg-card` pinta ENCIMA de la capa de
                  separadores (z-0), así que sin este borde la línea que
                  separa el gutter del primer consultorio desaparecía. Mismo
                  ancho w-20 + border-box ⇒ cae exacto sobre la de z-0. */}
              <div className="sticky left-0 z-[7] w-20 shrink-0 border-r border-border bg-card px-2 py-2 text-right">
                {showLabel && (
                  <span className="text-xs text-muted-foreground">{time}</span>
                )}
              </div>

              {/* Office columns */}
              {offices.map((office) => {
                const startAppt = getAppointmentForSlot(apptIndices, office.id, time);
                const occupied = isSlotOccupied(apptIndices, office.id, time);
                const block = getBlockForSlot(blocks, dateStr, office.id, time);

                // ---- APPOINTMENT starting here ----
                if (startAppt) {
                  const startMinutes =
                    parseInt(startAppt.start_time.slice(0, 2)) * 60 +
                    parseInt(startAppt.start_time.slice(3, 5));
                  const endMinutes =
                    parseInt(startAppt.end_time.slice(0, 2)) * 60 +
                    parseInt(startAppt.end_time.slice(3, 5));

                  // Linear geometry: offset & height are pure minutes × pxPerMin,
                  // so a 45-min card is exactly slotHeight tall regardless of
                  // which (compressed or full) row it anchors to.
                  const [slotH, slotM] = time.split(":").map(Number);
                  const slotStartMin = slotH * 60 + slotM;
                  const offsetMinutes = startMinutes - slotStartMin;
                  const offsetPx = offsetMinutes * pxPerMin;
                  const heightPx = (endMinutes - startMinutes) * pxPerMin - 4;

                  // Doctor role: other doctors' appointments are desaturated & non-interactive
                  const isOtherDoctorAppt = currentDoctorId != null && startAppt.doctor_id !== currentDoctorId;

                  return (
                    <div
                      key={office.id}
                      className="relative flex-1 p-0.5"
                      style={{ height: `${rowHeight}px` }}
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
                        heightPx={heightPx}
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
                      className="flex-1"
                      style={{ height: `${rowHeight}px` }}
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
                      className="relative flex-1"
                      style={{ height: `${rowHeight}px` }}
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
                        {/* Label cadence matches the time gutter: :00-only
                            when hour-aligned, else every (blocked) row so the
                            label survives non-divisor intervals like 45. */}
                        {showLabel ? (
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
                            aria-label={isBreakTime ? "Configurar descanso" : "Desbloquear horario"}
                            /* Equivalente táctil del "click derecho → Desbloquear":
                               el icono sigue midiendo 16 px (densidad desktop
                               intacta) pero el pseudo-elemento extiende el área
                               tocable a 44 px en <md. */
                            className={`relative rounded p-0.5 transition-colors before:absolute before:-inset-3.5 before:content-[''] md:before:content-none ${
                              isBreakTime
                                ? "text-blue-500/80 md:text-blue-400/50 hover:bg-blue-500/20 hover:text-blue-500"
                                : "text-muted-foreground/80 md:text-muted-foreground/40 hover:bg-background/70 hover:text-foreground"
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
                      "group relative flex-1 cursor-pointer transition-colors",
                      isDropTarget
                        ? "bg-primary/20 ring-1 ring-inset ring-primary"
                        : "hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10"
                    )}
                    style={{ height: `${rowHeight}px` }}
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
                    {/* En touch no hay hover: sin señal permanente nada
                        indica que un slot vacío es tocable. Se muestra
                        tenue por defecto y desde md vuelve al
                        comportamiento hover-only de escritorio. */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-30 transition-opacity md:opacity-0 md:group-hover:opacity-100">
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
            <div className="sticky left-0 z-[1] w-20 shrink-0 flex justify-end pr-1">
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
