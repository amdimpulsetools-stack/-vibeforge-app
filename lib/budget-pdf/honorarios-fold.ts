/**
 * Reparto del ajuste de honorarios (mig 174) entre las líneas de
 * honorarios de un tratamiento.
 *
 * Regla de producto (decisión founder + evaluación de agentes,
 * 2026-08-01): el ajuste es UN monto capturado al asignar; en el PDF
 * se distribuye proporcionalmente a las líneas de honorarios base del
 * tier, redondeado a múltiplos de S/ 10 para que las cifras finales
 * pertenezcan al mismo vocabulario que los precios de lista (5,400 ·
 * 4,320 · 1,080 — decenas, nunca céntimos). El resto del redondeo cae
 * en la línea de MAYOR base, de modo que la suma de incrementos sea
 * EXACTAMENTE el delta y el total del PDF cuadre al céntimo con
 * `budget_records.amount` (tier + ajuste).
 *
 * Tratamientos de una sola línea de honorarios (CRIO, IIU, TED)
 * degeneran al comportamiento histórico: todo el delta a esa línea.
 */

/** "5,400.00" → 540000 (céntimos enteros). */
export function centsOf(formatted: string): number {
  return Math.round(Number(formatted.replace(/,/g, "")) * 100) || 0;
}

/** "5,400.00" + 24000 céntimos → "5,640.00". */
export function addCents(formatted: string, deltaCents: number): string {
  return ((centsOf(formatted) + deltaCents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Reparte `deltaCents` entre líneas proporcionalmente a `baseCents`.
 * Aritmética 100% en céntimos enteros. Postcondición dura:
 * Σ resultado === deltaCents (siempre), y ningún incremento negativo.
 *
 * Paso de redondeo S/ 10 (1000 céntimos) cuando el delta lo permite;
 * si el delta es pequeño o no-múltiplo de 10, degrada a céntimos —
 * nunca bloquea (el modal solo sugiere múltiplos de 10, no exige).
 */
export function distributeHonorarios(
  baseCents: number[],
  deltaCents: number,
): number[] {
  if (deltaCents <= 0 || baseCents.length === 0) {
    return baseCents.map(() => 0);
  }
  if (baseCents.length === 1) return [deltaCents];

  const sum = baseCents.reduce((a, b) => a + b, 0);
  // Índice de la línea principal (mayor base; empate → la primera).
  const main = baseCents.reduce(
    (best, v, i) => (v > baseCents[best] ? i : best),
    0,
  );
  if (sum <= 0) {
    return baseCents.map((_, i) => (i === main ? deltaCents : 0));
  }

  const step =
    deltaCents % 1000 === 0 && deltaCents >= 1000 * baseCents.length
      ? 1000
      : 1;

  const build = (roundFn: (x: number) => number) => {
    const out = baseCents.map((b, i) =>
      i === main ? 0 : roundFn((deltaCents * b) / sum / step) * step,
    );
    out[main] = deltaCents - out.reduce((a, b) => a + b, 0);
    return out;
  };

  // round-half-up puede dejar la línea principal negativa en casos
  // extremos (muchas líneas pequeñas); floor lo garantiza ≥ su share.
  let out = build(Math.round);
  if (out[main] < 0) out = build(Math.floor);
  return out;
}
