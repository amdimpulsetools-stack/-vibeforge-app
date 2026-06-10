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
import { LiveStatusPill, deriveLiveState } from "./live-status-pill";

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
  // ── Live status (Part E) ─────────────────────────────────────────
  /** Master toggle (Settings → Agenda). Off = pill never renders. */
  liveStatusEnabled?: boolean;
  /** Receptionists can arrive/start but not end/reopen. */
  canEndReopen?: boolean;
  /**
   * Computed by the parent grid (which owns the shared minute tick):
   * consultation open >1h AND the doctor's next cita already started.
   * The card itself does NOT subscribe to the ticker — keeps memo
   * effective for the other 49 cards.
   */
  isStale?: boolean;
  /** Refetch hook fired after a live-status transition. */
  onLiveChanged?: () => void;
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
  liveStatusEnabled = false,
  canEndReopen = false,
  isStale = false,
  onLiveChanged,
}: AppointmentCardProps) {
  const doctorColor = appointment.doctors?.color ?? "#9ca3af";

  const liveState = liveStatusEnabled
    ? deriveLiveState({
        arrived_at: appointment.arrived_at ?? null,
        consultation_started_at: appointment.consultation_started_at ?? null,
        consultation_ended_at: appointment.consultation_ended_at ?? null,
      })
    : null;
  // "Done" visual: ended consultations and stale ones (open >1h with
  // the doctor already in their next cita) fade to muted gray. The
  // 4px doctor-color left border stays so identity remains legible
  // across the grid — exactly the separator the user asked for.
  const isDone = liveState === "ended" || isStale;

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
        backgroundColor: isDone
          ? "hsl(var(--muted))"
          : hexToPastel(doctorColor, 0.18),
        borderLeft: `4px solid ${doctorColor}`,
        ...(isOtherDoctor ? { filter: "saturate(0.5)", opacity: 0.6 } : {}),
        ...(isDone && !isOtherDoctor ? { opacity: 0.75 } : {}),
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
        {/* Live status pill — visible to everyone, interactive only
            for the org's own flows (other-doctor cards are read-only
            for doctor users). Short cards (15-min slots ≈ 36 px) get
            the dot-only variant so the doctor·service line below
            never gets pushed out of the overflow-hidden card. */}
        {liveStatusEnabled && liveState && (
          <LiveStatusPill
            appointmentId={appointment.id}
            live={{
              arrived_at: appointment.arrived_at ?? null,
              consultation_started_at:
                appointment.consultation_started_at ?? null,
              consultation_ended_at:
                appointment.consultation_ended_at ?? null,
            }}
            size="card"
            compact={heightPx < 52}
            canEndReopen={canEndReopen}
            readOnly={isOtherDoctor}
            onChanged={() => onLiveChanged?.()}
          />
        )}
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
    // updated_at covers the live-status timestamps too: appointments
    // has a set_updated_at trigger (mig 007), so any arrive/start/end
    // bumps it and busts this memo for exactly the touched card.
    prev.appointment.updated_at === next.appointment.updated_at &&
    prev.topPx === next.topPx &&
    prev.heightPx === next.heightPx &&
    prev.isSelected === next.isSelected &&
    prev.isOtherDoctor === next.isOtherDoctor &&
    prev.paymentTotal === next.paymentTotal &&
    prev.liveStatusEnabled === next.liveStatusEnabled &&
    prev.canEndReopen === next.canEndReopen &&
    prev.isStale === next.isStale,
);
