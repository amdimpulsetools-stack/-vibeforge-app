/**
 * CRIOPRESERVACIÓN DE OVOCITOS — precio único.
 * Fuente: "PRESUPUESTO DE CRIO DE OVOCITOS.docx".
 *
 * Fase única. En el original, "Consulta médica y controles
 * ovulatorios", "Aspiración folicular" y "Vitrificación de ovocitos"
 * comparten un solo importe de S/ 7,200 (las dos últimas van sin
 * precio propio); la plantilla lo refleja agrupando las tres líneas
 * bajo ese monto en vez de inventar un reparto.
 *
 * Aritmética verificada ✓ (sin erratas):
 *   7,200 + 4,000 + 2,800 = 14,000
 */

import type { CicloCrio } from "./types";

export const CRIO: { fase: CicloCrio; total_formatted: string } = {
  fase: {
    subtotal: "14,000.00",
    procedimiento: "7,200.00",
    medicacion: "4,000.00",
    honorarios: "2,800.00",
  },
  total_formatted: "14,000.00",
};
