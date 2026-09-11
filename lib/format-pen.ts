/**
 * Formato de moneda en soles — UNA sola versión para las pantallas nuevas.
 *
 * "S/ 1,234.50": el formato de Caja, Almacén, Farmacia y del helper `money`
 * del motor de PDF (lib/pdf/html/render.ts). Es presentación, no fórmula:
 * nunca redondea ni transforma el monto más allá de mostrarlo con dos
 * decimales.
 *
 * Hoy la misma función vive duplicada en `app/(dashboard)/caja/types.ts`,
 * `app/(dashboard)/almacen/types.ts` y `lib/caja-emails.ts`; unificar esos
 * usos es una tarea aparte. Lo nuevo importa de aquí.
 */
export function formatPEN(n: number): string {
  return `S/ ${Number(n || 0).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Diferencias/devoluciones: signo tipográfico (− U+2212), nunca el guion. */
export function formatSignedPEN(n: number): string {
  const v = Number(n || 0);
  if (v === 0) return formatPEN(0);
  return `${v > 0 ? "+" : "−"}${formatPEN(Math.abs(v))}`;
}
