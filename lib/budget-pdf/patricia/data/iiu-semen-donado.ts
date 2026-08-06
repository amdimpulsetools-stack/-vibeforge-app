/**
 * INSEMINACIÓN INTRAUTERINA CON SEMEN DONADO — precio único.
 * Fuente: "PRESUPUESTO DE INSEMINACION CON SEMEN DONADO.docx"
 *         (y su duplicado "…(1).docx", idéntico salvo la paciente —
 *          son el MISMO presupuesto emitido a dos personas, no dos
 *          productos: por eso el lote son 13 presupuestos y no 14).
 *
 * Mismo paquete cerrado que la IIU estándar (S/ 2,750) más el bloque
 * informativo de semen donado, que corre por cuenta de la paciente y
 * NO está incluido en el total.
 *
 * Aritmética: N/A (paquete cerrado, sin ítems valorizados).
 */

import type { PaqueteCerrado } from "./types";

export const IIU_SEMEN_DONADO: PaqueteCerrado = {
  total_formatted: "2,750.00",
};
