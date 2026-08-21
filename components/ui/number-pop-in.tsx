"use client";

import { cn } from "@/lib/utils";

interface NumberPopInProps {
  /** Valor ya formateado: "S/ 12,450.00", "37", "84%". */
  value: string;
  className?: string;
}

/**
 * Cifra que entra carácter a carácter, con un leve rebote y desenfoque.
 *
 * Se anima al montarse, que es cuando el dato llega: el esqueleto de carga
 * desaparece y el número ocupa su lugar. Para re-animar cuando cambia el
 * periodo (mes/semana/hoy), pasa el propio valor como `key` desde el padre —
 * React remonta el nodo y la animación arranca sola.
 *
 * Reservado para cifras protagonistas: KPIs del inicio, arqueo de caja,
 * total de una venta confirmada. NUNCA en tablas (veinte números animando a
 * la vez es ruido) ni en valores que cambian mientras se escribe.
 *
 * Accesibilidad: partir el número en un <span> por carácter haría que un
 * lector de pantalla dictara "uno, dos, tres" en vez de "ciento veintitrés",
 * y rompería el copiar y pegar. Por eso el valor completo va en aria-label
 * y los caracteres quedan ocultos al lector.
 */
export function NumberPopIn({ value, className }: NumberPopInProps) {
  return (
    <span className={cn("t-digit-group", className)}>
      {/* El valor íntegro para el lector de pantalla. `role="text"` sería
          más corto pero no es estándar: solo lo entiende Safari. */}
      <span className="sr-only">{value}</span>
      {Array.from(value).map((char, i) => (
        <span
          key={i}
          className="t-digit"
          aria-hidden
          // El retardo se calcula por índice en vez de con los data-stagger
          // fijos del patrón original, que solo llegaban a tres caracteres.
          // Se limita a 8 pasos: en "S/ 12,450.00" los últimos decimales
          // llegarían tarde y la cifra se sentiría lenta, no escalonada.
          style={{ animationDelay: `calc(var(--digit-stagger) * ${Math.min(i, 8)})` }}
        >
          {/* El espacio en blanco colapsa dentro de un inline-block */}
          {char === " " ? " " : char}
        </span>
      ))}
    </span>
  );
}
