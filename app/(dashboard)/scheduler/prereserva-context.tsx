"use client";

/**
 * Pre-reserva en la grilla (mig 274): color configurable de la org y un
 * indicador que cambia solo de "vence 15:30" a "vencida".
 *
 * El color viaja por Context (como NowProvider) en vez de por props: así la
 * grilla y las tarjetas memoizadas no cambian de firma, y SOLO las tarjetas
 * que son pre-reserva lo leen. Fuera del provider cae al default.
 */

import { createContext, useContext, type ReactNode } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrgToday } from "@/hooks/use-org-today";
import { PRERESERVA_DEFAULT_COLOR } from "@/lib/scheduler-config";
import {
  PRERESERVA_EXPIRED_COLOR,
  describeHoldDeadline,
  holdStateOf,
  type HoldState,
} from "@/lib/appointments/prereserva";
import { useNow } from "./now-provider";

const PrereservaColorContext = createContext<string>(PRERESERVA_DEFAULT_COLOR);

export function PrereservaColorProvider({ color, children }: { color: string; children: ReactNode }) {
  return <PrereservaColorContext.Provider value={color}>{children}</PrereservaColorContext.Provider>;
}

export function usePrereservaColor(): string {
  return useContext(PrereservaColorContext);
}

/**
 * Estado de la pre-reserva re-evaluado con el reloj compartido de la agenda
 * (NowProvider): el componente que lo llama re-renderiza una vez por minuto.
 * Úsalo SOLO en hojas que son pre-reserva, nunca en la grilla.
 */
export function useHoldView(holdExpiresAt: string): {
  state: Exclude<HoldState, "none">;
  color: string;
  label: string;
} {
  const now = useNow();
  const configured = usePrereservaColor();
  const { timezone } = useOrgToday();
  const st = holdStateOf(holdExpiresAt, now);
  if (st === "expired") {
    return { state: "expired", color: PRERESERVA_EXPIRED_COLOR, label: "Pre-reserva vencida" };
  }
  const deadline = describeHoldDeadline(holdExpiresAt, timezone, now);
  return { state: "active", color: configured, label: `Pre-reserva · vence ${deadline.short}` };
}

/**
 * Marca compacta para las listas / celdas de la semana: icono (y texto si
 * `withLabel`) en el color de la pre-reserva, rojo si venció.
 */
export function PrereservaBadge({
  holdExpiresAt,
  withLabel = false,
  className,
}: {
  holdExpiresAt: string;
  withLabel?: boolean;
  className?: string;
}) {
  const view = useHoldView(holdExpiresAt);
  const Icon = view.state === "expired" ? AlertTriangle : Clock;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-0.5 font-semibold leading-none", className)}
      style={{ color: view.color }}
      title={view.label}
    >
      <Icon className="h-3 w-3 shrink-0" aria-label={view.label} />
      {withLabel && <span className="truncate">{view.label}</span>}
    </span>
  );
}
