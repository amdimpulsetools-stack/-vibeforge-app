/**
 * Modelo de recuperación de ingresos de la landing: UNA sola fórmula para
 * todas las variantes de la home (`/` y `/2`). Sin "use client": lo
 * importan las calculadoras (cliente) y puede importarlo cualquier
 * Server Component.
 */

// ── ROI calculator ──────────────────────────────────────────────────────────
// Modelo (auditoría de conversión 2026-08-21): un solo claim de no-shows en
// todo el sitio — de 20% a 12% (~40% menos, alineado con product-features) —
// y captación +4%. El modelo anterior (20%→5% + 8%) arrojaba S/6,300/mes para
// el plan de S/349: un 18× que dejaba de ser creíble y desactivaba la venta.

export function computeRecovery(
  doctors: number,
  apptPerDoctor: number,
  avgPrice: number
) {
  const monthlyAppts = doctors * apptPerDoctor;
  const monthlyRevenueAtFull = monthlyAppts * avgPrice;
  const noShowLossToday = monthlyRevenueAtFull * 0.2;
  const noShowLossWithYenda = monthlyRevenueAtFull * 0.12;
  const noShowSaved = noShowLossToday - noShowLossWithYenda;
  const captureGain = monthlyRevenueAtFull * 0.04;
  return Math.round(noShowSaved + captureGain);
}

// El plan que le corresponde al slider de doctores — para que el ROI y el
// precio se evalúen en el MISMO campo visual (anclaje + contraste). Antes
// estaban a dos secciones de distancia y el efecto se anulaba.
export function planForDoctors(doctors: number) {
  if (doctors <= 1) return { name: "Independiente", price: 129 };
  if (doctors <= 3) return { name: "Centro Médico", price: 349 };
  return { name: "Clínica", price: 649 };
}

export function formatSoles(n: number): string {
  return `S/ ${n.toLocaleString("es-PE")}`;
}
