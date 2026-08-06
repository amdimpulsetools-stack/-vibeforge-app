/**
 * FECUNDACIÓN IN VITRO CON ÓVULOS DONADOS (ovodonación) — precio único.
 * Fuente: "Presupuesto fiv ovulos donados ( ovodon).docx".
 *
 * Aritmética verificada ✓ (sin erratas):
 *   FIV            14,500 + 6,600 + 4,000 = 25,100
 *   Transferencia     800 + 3,450         =  4,250
 *   TOTAL                                  = 29,350
 */

import type { CicloFivDonante, Transferencia } from "./types";

export const OVODON: {
  fiv: CicloFivDonante;
  transferencia: Transferencia;
  total_formatted: string;
} = {
  fiv: {
    subtotal: "25,100.00",
    ovulos_donante: "14,500.00",
    procedimiento: "6,600.00",
    honorarios: "4,000.00",
  },
  transferencia: {
    subtotal: "4,250.00",
    honorarios: "800.00",
    control_endometrial: "3,450.00",
  },
  total_formatted: "29,350.00",
};
