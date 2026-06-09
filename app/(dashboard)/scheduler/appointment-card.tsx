"use client";

/**
 * <AppointmentCard /> — extracted from the inline JSX that lived in
 * day-view.tsx (and duplicated with variations in week-view.tsx).
 *
 * PERF: wrapped in React.memo with a custom comparator. The day grid
 * re-renders on every parent state change (drag-over highlights, the
 * once-per-minute `now` tick for the time indicator, selection
 * changes…). Before extraction, each of those re-rendered EVERY card.
 * With memo, a card only re-renders when ITS OWN inputs change:
 * appointment identity/updated_at, selection state, payment total or
 * slot geometry.
 *
 * This is also the foundation for the upcoming "live status" feature
 * (llegó / en consulta): per-card time-relative state will subscribe
 * to the shared NowProvider ticker without dragging the whole grid
 * into the tick.
 */

import { memo } from "react";
import { CheckCircle2, CircleDollarSign, Video, AlertTriangle } from "lucide-react";
import type { AppointmentWithRelations } from "@/types/admin";
import { RecurringDot } from "@/components/patients/recurring-badge";
import { cn } from "@/lib/utils";

/**
 * Color helpers — verbatim copies of the ones that lived in
 * day-view.tsx so the rendered colors stay bit-identical after the
 * extraction. Exported so the views can keep using them for non-card
 * elements (blocked slots etc.).
 */

/** Create a light pastel by blending a hex color with white. */
export function hexToPastel(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const bg = 255; // white
  return `rgb(${Math.round(r * alpha + bg * (1 - alpha))}, ${Math.round(g * alpha + bg * (1 - alpha))}, ${Math.round(b * alpha + bg * (1 - alpha))})`;
}

/** Create a darkened version of a hex color for text on pastel bg. */
export function hexToDark(hex: string, factor = 0.45): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

export interface AppointmentCardProps {
  appointment: AppointmentWithRelations;
  /** Card geometry, computed by the parent grid. */
  topPx: number;
  heightPx: number;
  isSelected: boolean;
  /** True when a doctor user is viewing another doctor's appointment. */
  isOtherDoctor: boolean;
  /** Sum of payments registered for this appointment (0 = none). */
  paymentTotal: number;
  onClick: () => void;
  onDragStartCard?: (appointmentId: string) => void;
  onDragEndCard?: () => void;
}

function AppointmentCardInner({
  appointment,
  topPx,
  heightPx,
  isSelected,
  isOtherDoctor,
  paymentTotal,
  onClick,
  onDragStartCard,
  onDragEndCard,
}: AppointmentCardProps) {
  const doctorColor = appointment.doctors?.color ?? "#9ca3af";

  return (
    <button
      draggable={!isOtherDoctor}
      onDragStart={(e) => {
        if (isOtherDoctor) {
          e.preventDefault();
          return;
        }
        onDragStartCard?.(appointment.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => onDragEndCard?.()}
      onClick={onClick}
      className={cn(
        "absolute inset-x-1.5 z-[5] rounded-lg px-2 py-0.5 text-left transition-all overflow-hidden flex flex-col justify-center",
        isOtherDoctor
          ? "cursor-default"
          : "cursor-grab active:cursor-grabbing hover:shadow-md",
        isSelected && !isOtherDoctor && "ring-2 ring-primary shadow-lg z-[6]",
      )}
      style={{
        top: `${topPx}px`,
        height: `${heightPx}px`,
        backgroundColor: hexToPastel(doctorColor, 0.18),
        borderLeft: `4px solid ${doctorColor}`,
        ...(isOtherDoctor ? { filter: "saturate(0.5)", opacity: 0.6 } : {}),
      }}
    >
      <div className="flex items-center gap-1">
        {appointment.patients?.is_recurring && (
          <RecurringDot className="shrink-0" />
        )}
        <p
          className="text-xs font-bold truncate leading-tight flex-1"
          style={{ color: hexToDark(doctorColor) }}
        >
          {appointment.patient_name}
        </p>
        {/* Virtual indicator */}
        {!isOtherDoctor &&
          (appointment as { meeting_url?: string | null }).meeting_url && (
            <Video className="h-3 w-3 shrink-0 text-blue-500" />
          )}
        {/* Payment / Debt indicator */}
        {!isOtherDoctor &&
          appointment.price_snapshot != null &&
          Number(appointment.price_snapshot) > 0 &&
          (() => {
            const gross = Number(appointment.price_snapshot);
            const discount = Number(
              (appointment as { discount_amount?: number | null })
                .discount_amount ?? 0,
            );
            const price = Math.max(0, gross - discount);
            const paid = paymentTotal;
            const pending = price - paid;
            if (price === 0 || paid >= price) {
              return (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" />
              );
            }
            if (pending > 0) {
              return (
                <span
                  className="flex items-center gap-0.5 shrink-0 rounded-full bg-red-500/15 px-1 py-0.5 text-[9px] font-bold text-red-600 leading-none"
                  title={`Deuda: S/. ${pending.toFixed(2)}`}
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  S/{pending.toFixed(0)}
                </span>
              );
            }
            return (
              <CircleDollarSign className="h-3 w-3 shrink-0 text-gray-400" />
            );
          })()}
      </div>
      <p
        className="text-[11px] truncate leading-tight"
        style={{ color: hexToDark(doctorColor, 0.55) }}
      >
        {appointment.doctors?.full_name ?? "—"} ·{" "}
        {appointment.services?.name ?? "—"}
      </p>
    </button>
  );
}

/**
 * Custom comparator: re-render ONLY when card-relevant inputs change.
 * `appointment` is compared by id + updated_at (the API bumps
 * updated_at on every edit) instead of reference, so a polling
 * refresh that returns identical rows doesn't repaint the grid.
 */
export const AppointmentCard = memo(
  AppointmentCardInner,
  (prev, next) =>
    prev.appointment.id === next.appointment.id &&
    prev.appointment.updated_at === next.appointment.updated_at &&
    prev.topPx === next.topPx &&
    prev.heightPx === next.heightPx &&
    prev.isSelected === next.isSelected &&
    prev.isOtherDoctor === next.isOtherDoctor &&
    prev.paymentTotal === next.paymentTotal,
);
