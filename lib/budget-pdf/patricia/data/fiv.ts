/**
 * FECUNDACIÓN IN VITRO — precio único.
 * Fuente: "PRESUPUESTO FIV.docx".
 *
 * Aritmética verificada ✓ (sin erratas):
 *   FIV            1,200 + 6,000 + 3,000 + 5,800 + 1,000 = 17,000
 *   Transferencia          800 + 3,200                   =  4,000
 *   TOTAL                                                = 21,000
 */

import type { CicloFivPropio, Transferencia } from "./types";

export const FIV: {
  fiv: CicloFivPropio;
  transferencia: Transferencia;
  total_formatted: string;
} = {
  fiv: {
    subtotal: "17,000.00",
    consulta: "1,200.00",
    medicacion: "6,000.00",
    honorarios: "3,000.00",
    aspiracion_fiv: "5,800.00",
    vitrificacion: "1,000.00",
  },
  transferencia: {
    subtotal: "4,000.00",
    honorarios: "800.00",
    control_endometrial: "3,200.00",
  },
  total_formatted: "21,000.00",
};
