/**
 * Tope de Mercado Pago para el monto por período de una suscripción
 * (preapproval). Es un límite de riesgo de la cuenta collector — NO está
 * documentado públicamente; MP rechaza el create con
 * "Cannot pay an amount greater than S/ 1500.00" (verificado 2026-08-07
 * con Centro Médico semestral S/1,919.50).
 *
 * Las cadencias cuyo cobro por período supera este monto se ofrecen como
 * "Próximamente" en /plans y /select-plan, y el checkout las rechaza con
 * un 400 claro antes de llamar a MP.
 *
 * Cuando MP suba el límite de la cuenta (ticket abierto por el founder),
 * basta con ajustar este número — o ponerlo en Infinity — para reactivar
 * las cadencias bloqueadas en todas partes.
 */
export const MP_MAX_PREAPPROVAL_AMOUNT = 1500;

/** true si el cobro por período de esa cadencia excede el tope de MP. */
export function exceedsMpPreapprovalCap(amount: number | null | undefined): boolean {
  return typeof amount === "number" && amount > MP_MAX_PREAPPROVAL_AMOUNT;
}
