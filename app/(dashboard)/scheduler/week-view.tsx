"use client";

import { format, addDays, startOfWeek, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, Office, ScheduleBlock } from "@/types/admin";
import { APPOINTMENT_STATUS_COLORS } from "@/types/admin";
import { cn } from "@/lib/utils";
import { Plus, Coffee, Lock, CheckCircle2, CircleDollarSign, Video } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadSchedulerConfig, fetchSchedulerConfig, generateTimeSlots, getActiveInterval, getScheduleStartMinutes, getScheduleEndMinutes, DEFAULT_SCHEDULER_CONFIG, computeSlotHeight } from "@/lib/scheduler-config";
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

  // Scheduler config — pinta al instante desde localStorage (placeholder) y
  // sincroniza con la BD vía React Query. La key es compartida entre las
  // vistas día/semana: alternar de vista ya no repite el fetch de sync (una
  // sola query por staleTime para ambas).
  const { data: schedulerConfig = loadSchedulerConfig() } = useQuery({
    queryKey: ["scheduler-config"],
    queryFn: () => fetchSchedulerConfig(),
    placeholderData: () => loadSchedulerConfig(),
  });
  // ── Borde elástico (paridad con day-view) ────────────────────────────────
  // Citas fuera de la ventana org no caían en ningún renglón del filtro
  // half-open [time, nextSlot) y desaparecían de la semana. La grilla se
  // extiende con renglones del MISMO stride hasta cubrir la cita más
  // temprana/tardía de la semana visible. El eje es único para los 7 días
  // (unión): un lunes con cita de 07:00 muestra la fila 07:00 toda la semana
  // — renglones vacíos clicables, derivados de datos, sin estado propio.
  const { gridStartMin, gridEndMin } = useMemo(() => {
    const baseStart = getScheduleStartMinutes(schedulerConfig);
    const baseEnd = getScheduleEndMinutes(schedulerConfig);
    const interval = getActiveInterval(schedulerConfig);
    const weekDates = new Set(weekDays.map((d) => format(d, "yyyy-MM-dd")));
    let earliest = baseStart;
    let latest = baseEnd;
    for (const a of appointments) {
      if (!weekDates.has(a.appointment_date)) continue;
      const [sh, sm] = a.start_time.slice(0, 5).split(":").map(Number);
      const [eh, em] = a.end_time.slice(0, 5).split(":").map(Number);
      earliest = Math.min(earliest, sh * 60 + sm);
      latest = Math.max(latest, eh * 60 + em);
    }
    return {
      gridStartMin:
        earliest < baseStart
          ? Math.max(0, baseStart - Math.ceil((baseStart - earliest) / interval) * interval)
          : baseStart,
      gridEndMin: latest > baseEnd ? Math.min(24 * 60, latest) : baseEnd,
    };
    // weekDays se rederiva de weekStart; usarlo directo evitaría un dep inestable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments, weekStart, schedulerConfig]);

  const TIME_SLOTS = useMemo(
    () => generateTimeSlots(gridStartMin, gridEndMin, getActiveInterval(schedulerConfig)),
    [gridStartMin, gridEndMin, schedulerConfig]
  );

  const activeInterval = getActiveInterval(schedulerConfig);
  // :00-only labels/borders require a 60-divisor stride (15/30/60) AND a
  // whole-hour start (startMinute 0). A :15/:30/:45 offset (mig 175) means no
  // row lands on :00 → label every row, same as a non-divisor interval (45).
  const hourAligned = 60 % activeInterval === 0 && gridStartMin % 60 === 0;

  // Real per-row minute geometry — same uniform-stride grid as day-view
  // (interval 45 → 07:00, 07:45, 08:30…). spanMin = minutes each row occupies;
  // the LAST row is clamped to endHour so the grid closes exactly at closing
  // time. slotUnits = Σ spanMin / interval = full-interval count (= row count
  // when the stride divides the day evenly). The geometry reads these REAL
  // boundaries, which is what makes the uniform-stride change safe.
  const { spanMin, slotUnits } = useMemo(() => {
    const endMin = gridEndMin;
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
    return { spanMin, slotUnits: totalMin / activeInterval };
  }, [TIME_SLOTS, activeInterval, gridEndMin]);

  // Auto-size rows so short schedules fill the viewport instead of leaving a
  // blank gap below. Long schedules keep base height + scroll.
  const slotHeight = useMemo(
    () => computeSlotHeight(containerHeight ?? 0, slotUnits, WEEK_BASE_SLOT_HEIGHT, WEEK_HEADER_HEIGHT),
    [containerHeight, slotUnits]
  );

  // Linear pixel↔minute mapping: proportional row heights + duration-based
  // card heights so a 45-min card fills 75% of its visual hour band, exactly
  // like day-view.
  const { pxPerMin, rowHeights } = useMemo(() => {
    const pxPerMin = slotHeight / activeInterval;
    const rowHeights = spanMin.map((s) => s * pxPerMin);
    return { pxPerMin, rowHeights };
  }, [slotHeight, activeInterval, spanMin]);

  const getAppointmentsForDay = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return appointments.filter((a) => a.appointment_date === dateStr);
  };

  /** Mismas citas, ordenadas por hora — la vista agenda las lee en fila. */
  const getSortedAppointmentsForDay = (date: Date) =>
    [...getAppointmentsForDay(date)].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );

  const isDisabledDay = (day: Date) =>
    schedulerConfig.disabledWeekdays.includes(
      day.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6
    );

  return (
    <>
    {/* ═══ VISTA AGENDA (<md) ══════════════════════════════════════════
        La grilla semanal necesita ~900 px de ancho: en un iPhone de 390 px
        se veía menos de la mitad de la semana, con tarjetas de 10 px y sin
        referencia de día al scrollear en horizontal. En móvil la semana se
        lee como lista vertical agrupada por día: cabecera de día sticky +
        una card tocable por cita que dispara EXACTAMENTE los mismos
        handlers que la grilla (`onAppointmentClick` → AppointmentSidebar,
        `onSlotClick` → AppointmentFormModal), así que no hay flujo nuevo
        que mantener. Colores y tipografía salen de los mismos helpers que
        la grilla y appointment-card (hexToPastel / hexToDark), de modo que
        una cita se reconoce igual en ambas vistas.
        Desde md: se oculta y manda la grilla de siempre. */}
    <div className="md:hidden">
      {weekDays.map((day) => {
        const dayAppointments = getSortedAppointmentsForDay(day);
        const today = isToday(day);
        const dayDisabled = isDisabledDay(day);
        const firstSlot = TIME_SLOTS[0] ?? "08:00";

        return (
          <section key={day.toISOString()}>
            {/* Cabecera de día — sticky dentro del scroll de la agenda.
                Fondo opaco a propósito (bg-card, sin el bg-primary/5 de la
                grilla): al quedar pegada, un fondo translúcido dejaría ver
                las citas pasando por debajo. El día actual se marca con
                color de texto + punto. */}
            <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-border bg-card px-3 py-2">
              {today && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
              <p
                className={cn(
                  "text-sm font-semibold capitalize",
                  dayDisabled
                    ? "text-muted-foreground/60"
                    : today
                      ? "text-primary"
                      : "text-foreground"
                )}
              >
                {format(day, "EEEE d 'de' MMM", { locale: es })}
              </p>
              {dayDisabled ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Cerrado
                </span>
              ) : dayAppointments.length > 0 ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {dayAppointments.length}
                </span>
              ) : null}
              <span className="flex-1" />
              {!dayDisabled && (
                /* Añadir cita en este día. La grilla ofrece el slot vacío
                   como afordancia; en la lista no hay slots, así que el
                   "+" vive en la cabecera. p-3 + icono de 20 px = 44 px de
                   área tocable, con margen negativo para no engordar la
                   fila. */
                <button
                  type="button"
                  onClick={() => onSlotClick(day, firstSlot, offices[0]?.id ?? "")}
                  className="-m-2 rounded-lg p-3 text-primary transition-colors active:bg-primary/10"
                  aria-label={`Nueva cita el ${format(day, "d 'de' MMMM", { locale: es })}`}
                >
                  <Plus className="h-5 w-5" />
                </button>
              )}
            </div>

            {dayDisabled ? null : dayAppointments.length === 0 ? (
              /* Estado vacío discreto — y tocable, para que un día libre
                 siga siendo el punto de entrada natural para agendar. */
              <button
                type="button"
                onClick={() => onSlotClick(day, firstSlot, offices[0]?.id ?? "")}
                className="flex w-full items-center gap-2 px-3 py-3 text-left text-xs text-muted-foreground/70 transition-colors active:bg-accent"
              >
                <Plus className="h-3.5 w-3.5 shrink-0 opacity-70" />
                Sin citas — toca para agendar
              </button>
            ) : (
              <div className="space-y-1.5 px-3 py-2">
                {dayAppointments.map((appt) => {
                  const doctorColor = appt.doctors?.color ?? "#9ca3af";
                  const isOtherDoctorAppt =
                    currentDoctorId != null && appt.doctor_id !== currentDoctorId;
                  const gross = Number(appt.price_snapshot ?? 0);
                  const discount = Number(
                    (appt as { discount_amount?: number | null }).discount_amount ?? 0
                  );
                  const effective = Math.max(0, gross - discount);
                  const paid = paymentTotals[appt.id] ?? 0;

                  return (
                    <button
                      key={appt.id}
                      type="button"
                      onClick={() => onAppointmentClick(appt)}
                      className={cn(
                        "flex min-h-[56px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-shadow",
                        !isOtherDoctorAppt && "active:shadow-md",
                        selectedAppointmentId === appt.id &&
                          !isOtherDoctorAppt &&
                          "ring-2 ring-primary"
                      )}
                      style={{
                        backgroundColor: hexToPastel(doctorColor, 0.18),
                        borderLeft: `4px solid ${doctorColor}`,
                        ...(isOtherDoctorAppt
                          ? { filter: "saturate(0.5)", opacity: 0.6 }
                          : {}),
                      }}
                    >
                      <div className="w-12 shrink-0">
                        <p
                          className="text-sm font-bold leading-tight"
                          style={{ color: hexToDark(doctorColor) }}
                        >
                          {appt.start_time.slice(0, 5)}
                        </p>
                        <p
                          className="text-[11px] leading-tight"
                          style={{ color: hexToDark(doctorColor, 0.55) }}
                        >
                          {appt.end_time.slice(0, 5)}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          {appt.patients?.is_recurring && (
                            <RecurringDot className="shrink-0" />
                          )}
                          <p
                            className="truncate text-sm font-semibold"
                            style={{ color: hexToDark(doctorColor) }}
                          >
                            {appt.patient_name}
                          </p>
                        </div>
                        <p
                          className="truncate text-xs"
                          style={{ color: hexToDark(doctorColor, 0.55) }}
                        >
                          {appt.services?.name ?? "—"} · {appt.doctors?.full_name ?? "—"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {!isOtherDoctorAppt &&
                          (appt as { meeting_url?: string | null }).meeting_url && (
                            <Video className="h-4 w-4 text-blue-500" />
                          )}
                        {!isOtherDoctorAppt && effective > 0 && (
                          paid >= effective ? (
                            <CheckCircle2 className="h-4 w-4 text-success-600" />
                          ) : paid > 0 ? (
                            <CircleDollarSign className="h-4 w-4 text-amber-600" />
                          ) : null
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>

    {/* Grilla semanal — desde md, idéntica a la anterior. */}
    <div className="hidden min-w-[900px] md:block">
      {/* Day headers */}
      <div className="sticky top-0 z-10 flex border-b border-border bg-card">
        {/* Gutter de horas sticky: la referencia horaria sobrevive al
            scroll horizontal (móvil). */}
        <div className="sticky left-0 z-[2] w-16 shrink-0 border-r border-border bg-card" />
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
          <div className="sticky left-0 w-16 shrink-0 border-r border-border" />
          {weekDays.map((day) => (
            <div key={day.toISOString()} className="flex-1 border-r border-border" />
          ))}
        </div>

        {TIME_SLOTS.map((time, slotIndex) => {
          const isHour = time.endsWith(":00");
          // hourAligned (15/30/60): classic :00-only labels + solid border.
          // Non-divisor (45): no :00 rows, so label every row + shared weight.
          const showLabel = hourAligned ? isHour : true;
          const rowBorder = hourAligned
            ? isHour
              ? "border-t border-border"
              : "border-t border-border/30"
            : "border-t border-border/60";
          const rowHeight = rowHeights[slotIndex];
          return (
            <div
              key={time}
              className={cn("flex", rowBorder)}
            >
              {/* Time label — sticky left; z-[7] por encima de las
                  tarjetas de cita (z-[5]/z-[6]). border-r propio: el bg-card
                  tapa la capa de separadores (z-0), igual que en day-view. */}
              <div className="sticky left-0 z-[7] w-16 shrink-0 border-r border-border bg-card px-1 py-1 text-right">
                {showLabel && (
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
                      style={{ height: `${rowHeight}px` }}
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
                      style={{ height: `${rowHeight}px` }}
                    >
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{
                          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 4px, ${stripeColor} 4px, ${stripeColor} 8px)`,
                          backgroundColor: bgColor,
                        }}
                      >
                        {/* Same label cadence as the time gutter: once per
                            :00 when hour-aligned, else every (blocked) row so
                            the label isn't lost when no row ends in :00. */}
                        {showLabel && (
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
                  // Offset real dentro de la fila (paridad con day-view):
                  // con stride 45, una cita de 08:00 vive dentro de la fila
                  // 07:45 y debe dibujarse 15 min más abajo, no en el tope.
                  const [slH2, slM2] = time.split(":").map(Number);
                  const offsetPx = (startMinutes - (slH2 * 60 + slM2)) * pxPerMin;
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
                      style={{ height: `${rowHeight}px` }}
                    >
                      <button
                        onClick={() => onAppointmentClick(startAppt)}
                        className={cn(
                          "absolute inset-x-1.5 z-[5] rounded px-1 py-0.5 text-left transition-all overflow-hidden",
                          isOtherDoctorAppt
                            ? "cursor-default"
                            : "hover:shadow-md",
                          selectedAppointmentId === startAppt.id && !isOtherDoctorAppt && "ring-2 ring-primary shadow-lg z-[6]"
                        )}
                        style={{
                          top: `${offsetPx + 2}px`,
                          height: `${(endMinutes - startMinutes) * pxPerMin - 4}px`,
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
                              return <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-success-600" />;
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
                      style={{ height: `${rowHeight}px` }}
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
                    style={{ height: `${rowHeight}px` }}
                    onClick={() =>
                      onSlotClick(day, time, offices[0]?.id ?? "")
                    }
                  >
                    {/* En touch no hay hover: sin señal permanente nada
                        indica que un slot vacío es tocable. Se muestra
                        tenue por defecto y desde md vuelve al
                        comportamiento hover-only de escritorio. */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-30 transition-opacity md:opacity-0 md:group-hover:opacity-100">
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
    </>
  );
}
