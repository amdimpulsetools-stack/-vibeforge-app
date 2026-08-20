"use client";

import { cn } from "@/lib/utils";

interface SuccessCheckProps {
  /** Lado del icono en px. */
  size?: number;
  /** El color se hereda con currentColor: pásalo por className. */
  className?: string;
}

/**
 * Check de confirmación con animación de un solo disparo: aparece girando
 * y desenfocado, sube al asentarse, y el trazo se dibuja solo.
 *
 * Se anima al montarse — que es justo lo que queremos, porque estos checks
 * aparecen cuando el momento ocurre (cita reservada, pago registrado). Para
 * repetir la animación sin desmontar, cambia la prop `key` desde el padre:
 * React remonta el nodo y la animación arranca de cero.
 *
 * El trazo usa `pathLength={1}`, que normaliza la longitud del path a 1
 * sin importar su geometría real. Así el CSS puede usar `stroke-dasharray: 1`
 * en vez del número mágico que saldría de medir con getTotalLength().
 */
export function SuccessCheck({ size = 28, className }: SuccessCheckProps) {
  return (
    <span className={cn("t-success-check", className)} aria-hidden>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6 9 17l-5-5" pathLength={1} />
      </svg>
    </span>
  );
}
