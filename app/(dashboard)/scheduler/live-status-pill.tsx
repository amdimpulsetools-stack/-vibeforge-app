"use client";

/**
 * <LiveStatusPill /> — Part D of the visual card status feature.
 *
 * One pill that shows the live state of an appointment AND acts as
 * the control surface: tapping it opens a small popover with the 2-3
 * contextual transitions valid from the current state. Rendered in
 * two places with different sizes:
 *
 *   • size="card"    → compact, top-right corner of the agenda card
 *   • size="sidebar" → larger, next to the appointment status badge
 *
 * Why a pill-with-popover and not N buttons: the sidebar already has
 * 9 primary actions and the agenda card is 30-60 px tall. The pill
 * costs zero extra real estate (state and action share the same
 * affordance) and reception can SEE the state across 30 cards at a
 * glance — a contextual button showing only the "next action" hides
 * the current state.
 *
 * Undo: every transition fires a sonner toast with an 8-second
 * "Deshacer" action. No confirm dialogs — reception does dozens of
 * these per day; modal friction would kill adoption.
 *
 * States (derived from the timestamps, never stored as an enum):
 *   programada   → nothing set
 *   llegó        → arrived_at set, consultation not started
 *   en consulta  → started, not ended
 *   finalizada   → ended
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Stethoscope,
  UserCheck,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type LiveState = "scheduled" | "arrived" | "in_consultation" | "ended";

export interface LiveStatusFields {
  arrived_at: string | null;
  consultation_started_at: string | null;
  consultation_ended_at: string | null;
}

export function deriveLiveState(a: LiveStatusFields): LiveState {
  if (a.consultation_ended_at) return "ended";
  if (a.consultation_started_at) return "in_consultation";
  if (a.arrived_at) return "arrived";
  return "scheduled";
}

const STATE_META: Record<
  LiveState,
  { label: string; dot: string; text: string; bg: string; Icon: typeof Clock }
> = {
  scheduled: {
    label: "Programada",
    dot: "bg-gray-400",
    text: "text-gray-600 dark:text-gray-400",
    bg: "bg-gray-500/10",
    Icon: Clock,
  },
  arrived: {
    label: "Llegó",
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-500/10",
    Icon: UserCheck,
  },
  in_consultation: {
    label: "En consulta",
    dot: "bg-success-500 animate-pulse",
    text: "text-success-700 dark:text-success-400",
    bg: "bg-success-500/10",
    Icon: Stethoscope,
  },
  ended: {
    label: "Finalizada",
    dot: "bg-gray-300 dark:bg-gray-600",
    text: "text-muted-foreground",
    bg: "bg-muted/60",
    Icon: CheckCircle2,
  },
};

function shortTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

type Action = "arrive" | "unarrive" | "start" | "end" | "reopen";

interface ActionDef {
  action: Action;
  label: string;
  /** Action used by the undo toast to revert this transition. */
  undo?: Action;
}

/**
 * Valid transitions from each state, in display order. `canEnd` and
 * `canReopen` are separate on purpose (mig 227): the org toggle can
 * grant reception "Finalizar consulta", but "Reabrir consulta" stays
 * owner/admin/doctor-only always.
 */
function actionsFor(
  state: LiveState,
  canEnd: boolean,
  canReopen: boolean,
): ActionDef[] {
  switch (state) {
    case "scheduled":
      return [
        { action: "arrive", label: "Marcar llegada", undo: "unarrive" },
        { action: "start", label: "Iniciar consulta" },
      ];
    case "arrived":
      return [
        { action: "start", label: "Iniciar consulta" },
        { action: "unarrive", label: "Deshacer llegada" },
      ];
    case "in_consultation":
      // The undo of "end" is a reopen — only offered when the user can
      // actually reopen (a receptionist granted `end` by the toggle
      // would get a 403 on the undo).
      return canEnd
        ? [{
            action: "end",
            label: "Finalizar consulta",
            undo: canReopen ? "reopen" : undefined,
          }]
        : [];
    case "ended":
      return canReopen
        ? [{ action: "reopen", label: "Reabrir consulta" }]
        : [];
  }
}

/**
 * Why the pill offers no action from this state — surfaced as the
 * `title` tooltip so it never feels dead for no reason (the clinic's
 * report: "posiciono el mouse y nada").
 */
function noActionReason(state: LiveState): string | null {
  switch (state) {
    case "in_consultation":
      return "Solo el doctor o un administrador puede finalizar la consulta";
    case "ended":
      return "Solo el doctor o un administrador puede reabrir la consulta";
    default:
      return null;
  }
}

export interface LiveStatusPillProps {
  appointmentId: string;
  live: LiveStatusFields;
  size: "card" | "sidebar";
  /**
   * Can fire "Finalizar consulta". Owner/admin/doctor always; reception
   * only when the org toggle (mig 227) is on.
   */
  canEnd: boolean;
  /** Can fire "Reabrir consulta". Never true for reception. */
  canReopen: boolean;
  /** Read-only render (e.g. doctor viewing another doctor's card). */
  readOnly?: boolean;
  /**
   * Dot-only render for short cards (15-min slots are ~36 px tall —
   * the full label pushed the doctor·service line out of the
   * overflow-hidden card). The colored dot still signals the state
   * at a glance; the label moves to the title tooltip and the
   * popover remains fully functional.
   */
  compact?: boolean;
  /** Called after any successful transition so the parent refreshes. */
  onChanged: () => void;
}

export function LiveStatusPill({
  appointmentId,
  live,
  size,
  canEnd,
  canReopen,
  readOnly = false,
  compact = false,
  onChanged,
}: LiveStatusPillProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const state = deriveLiveState(live);
  const meta = STATE_META[state];
  const time =
    state === "arrived"
      ? shortTime(live.arrived_at)
      : state === "in_consultation"
        ? shortTime(live.consultation_started_at)
        : state === "ended"
          ? shortTime(live.consultation_ended_at)
          : null;

  const fire = async (action: Action): Promise<boolean> => {
    const res = await fetch(`/api/appointments/${appointmentId}/live-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(err.error ?? "No se pudo actualizar el estado");
      return false;
    }
    return true;
  };

  const handle = async (def: ActionDef) => {
    setBusy(true);
    try {
      const ok = await fire(def.action);
      if (!ok) return;
      setOpen(false);
      onChanged();
      if (def.undo) {
        const undoAction = def.undo;
        toast.success(def.label, {
          duration: 8000,
          action: {
            label: "Deshacer",
            onClick: () => {
              void fire(undoAction).then((undone) => {
                if (undone) onChanged();
              });
            },
          },
        });
      } else {
        toast.success(def.label);
      }
    } finally {
      setBusy(false);
    }
  };

  const actions = actionsFor(state, canEnd, canReopen);
  const interactive = !readOnly && actions.length > 0;
  // Explanation for a permission-blocked pill (reception without the
  // toggle, or reception on a closed consultation). Read-only renders
  // are a different situation (another doctor's card) — no hint there.
  const blockedHint =
    !readOnly && actions.length === 0 ? noActionReason(state) : null;

  const pill = compact ? (
    // Dot-only: zero height impact on single-slot cards. h-3 keeps
    // the wrapper no taller than the 11px name text so it doesn't
    // inflate the first row (the perceived "line gap" came from the
    // previous 14px wrapper driving the row height).
    <span
      title={
        (time ? `${meta.label} · ${time}` : meta.label) +
        (blockedHint ? ` — ${blockedHint}` : "")
      }
      className={cn(
        "inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full",
        interactive && "cursor-pointer hover:ring-1 hover:ring-current/40",
        meta.bg,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
    </span>
  ) : (
    <span
      title={blockedHint ?? undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full font-semibold leading-none",
        meta.bg,
        meta.text,
        size === "card"
          ? "px-1.5 py-0.5 text-[9px]"
          : "px-2.5 py-1 text-xs",
        interactive && "cursor-pointer hover:ring-1 hover:ring-current/30",
      )}
    >
      <span className={cn("rounded-full", meta.dot, size === "card" ? "h-1.5 w-1.5" : "h-2 w-2")} />
      {size === "sidebar" && <meta.Icon className="h-3.5 w-3.5" />}
      {meta.label}
      {time && <span className="font-normal opacity-75">· {time}</span>}
    </span>
  );

  if (!interactive) return pill;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // The agenda card itself is a click-to-open-sidebar button;
          // the pill must not bubble into it.
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => e.preventDefault()}
          // Full reset: `appearance-none` alone keeps the UA focus
          // outline, which rendered as a dark blob around the
          // dot-only pill when the popover opened. Replace it with a
          // subtle ring.
          className="appearance-none inline-flex bg-transparent p-0 border-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {pill}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-48 p-1"
        onClick={(e) => e.stopPropagation()}
      >
        {actions.map((def) => (
          <button
            key={def.action}
            type="button"
            disabled={busy}
            onClick={() => void handle(def)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {def.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
