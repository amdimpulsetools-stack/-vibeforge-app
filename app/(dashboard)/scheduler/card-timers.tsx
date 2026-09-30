"use client";

/**
 * Contadores de la tarjeta de la agenda:
 *
 *  · <HoldCountdownBadge>  mini badge rojo con letras blancas: cuánto le
 *    queda a la pre-reserva ("2 h 59", "45 min", "Vencida").
 *  · <HoldDrainFill>       el color de la pre-reserva se va agotando de
 *    derecha a izquierda hasta el vencimiento.
 *  · <WaitingBadge>        desde que se marca "Llegó": cuánto lleva la
 *    paciente esperando (azul → ámbar a los 15 min → rojo a los 30).
 *
 * RENDIMIENTO — por qué esto no pesa en una agenda de 200 citas:
 *  · Los badges son hojas que leen el reloj compartido (useNow, un tick
 *    por MINUTO para toda la agenda). Solo re-renderizan ESTOS nodos, y
 *    solo existen en tarjetas que son pre-reserva o tienen paciente en
 *    espera; el resto de tarjetas memoizadas no se entera del tick.
 *  · La barra NO usa timers ni estado: es una animación CSS de `transform`
 *    (keyframes `hold-drain` en globals.css) que corre en el compositor.
 *    Su duración y su desfase se calculan una vez por pre-reserva.
 *  · prefers-reduced-motion: sin animación; la barra queda en su punto y
 *    se corrige con el tick de cada minuto.
 */

import { useMemo } from "react";
import { AlertTriangle, Hourglass, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNow } from "./now-provider";

/** "2 h 59", "45 min", "<1 min", "1 d 3 h" — corto para un badge. */
export function compactDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return "<1 min";
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  if (h < 24) {
    const m = totalMin % 60;
    return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh === 0 ? `${d} d` : `${d} d ${rh} h`;
}

function msUntil(iso: string, now: Date): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t - now.getTime() : 0;
}

/** Badge rojo con letras blancas: tiempo restante de la pre-reserva. */
export function HoldCountdownBadge({
  holdExpiresAt,
  compact = false,
}: {
  holdExpiresAt: string;
  compact?: boolean;
}) {
  const now = useNow();
  const left = msUntil(holdExpiresAt, now);
  const expired = left <= 0;
  const text = expired ? "Vencida" : compactDuration(left);
  const Icon = expired ? AlertTriangle : Timer;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-600 font-bold leading-none text-white tabular-nums shadow-sm",
        compact ? "px-1 py-px text-[9px]" : "px-1.5 py-0.5 text-[10px]",
      )}
      title={expired ? "Pre-reserva vencida" : `La pre-reserva vence en ${text}`}
    >
      <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden />
      {text}
    </span>
  );
}

/**
 * Relleno que se agota de derecha a izquierda. Va DETRÁS del contenido
 * (z-index -1 dentro del stacking context de la tarjeta) y no captura
 * clics. `startedAt` = cuándo se creó la pre-reserva; si se extiende, la
 * barra se recalcula sobre el plazo nuevo (vuelve a llenarse en parte).
 */
export function HoldDrainFill({
  startedAt,
  holdExpiresAt,
  color,
}: {
  startedAt: string | null | undefined;
  holdExpiresAt: string;
  color: string;
}) {
  // `key`: si la pre-reserva se extiende, la barra se vuelve a montar con
  // el plazo nuevo (cambiar duración/desfase de una animación en curso la
  // haría saltar).
  return (
    <DrainBar key={holdExpiresAt} startedAt={startedAt ?? null} holdExpiresAt={holdExpiresAt} color={color} />
  );
}

function holdSpan(startedAt: string | null, holdExpiresAt: string, nowMs: number) {
  const end = new Date(holdExpiresAt).getTime();
  const start = startedAt ? new Date(startedAt).getTime() : NaN;
  // Sin inicio fiable (o posterior al fin): el plazo restante es el total.
  const from = Number.isFinite(start) && start < end ? start : Math.min(nowMs, end - 1);
  const total = Math.max(end - from, 1);
  const elapsed = Math.min(Math.max(nowMs - from, 0), total);
  return { total, elapsed };
}

function DrainBar({
  startedAt,
  holdExpiresAt,
  color,
}: {
  startedAt: string | null;
  holdExpiresAt: string;
  color: string;
}) {
  // Duración y desfase: UNA vez por montaje. A partir de ahí la anima el
  // navegador; el tick del minuto solo mueve el respaldo sin animación.
  const anim = useMemo(
    () => holdSpan(startedAt, holdExpiresAt, Date.now()),
    [startedAt, holdExpiresAt],
  );
  const now = useNow();
  const live = holdSpan(startedAt, holdExpiresAt, now.getTime());
  const ratio = Math.max(0, 1 - live.elapsed / live.total);

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 origin-left motion-reduce:!animate-none"
      style={{
        zIndex: -1,
        backgroundColor: color,
        // Respaldo (reduced-motion / sin animaciones): punto actual.
        transform: `scaleX(${ratio})`,
        animationName: "hold-drain",
        animationTimingFunction: "linear",
        animationFillMode: "both",
        animationDuration: `${anim.total}ms`,
        animationDelay: `-${anim.elapsed}ms`,
      }}
    />
  );
}

/** Tiempo de espera desde "Llegó" (hasta que empieza la consulta). */
export function WaitingBadge({
  arrivedAt,
  compact = false,
}: {
  arrivedAt: string;
  compact?: boolean;
}) {
  const now = useNow();
  const waited = Math.max(0, -msUntil(arrivedAt, now));
  const min = Math.floor(waited / 60_000);
  const tone = min >= 30 ? "bg-red-600" : min >= 15 ? "bg-amber-500" : "bg-blue-600";
  const text = compactDuration(waited);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full font-bold leading-none text-white tabular-nums shadow-sm",
        tone,
        compact ? "px-1 py-px text-[9px]" : "px-1.5 py-0.5 text-[10px]",
      )}
      title={`En espera hace ${text}`}
    >
      <Hourglass className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden />
      {text}
    </span>
  );
}
