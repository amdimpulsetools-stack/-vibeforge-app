/**
 * DUO STIM — dos estimulaciones ováricas en un mismo ciclo + una
 * transferencia. Precio único.
 * Fuente: "PRESUPUESTO DUOSTIM.docx".
 *
 * La 2.ª estimulación es más barata que la 1.ª (honorarios 2,500 vs
 * 3,000 y aspiración+FIV 5,400 vs 5,800): la paciente ya está
 * estudiada y monitorizada. Así viene en el original.
 *
 * Aritmética verificada ✓ (sin erratas):
 *   1.ª estimulación  1,200 + 6,000 + 3,000 + 5,800 + 1,000 = 17,000
 *   2.ª estimulación  1,200 + 6,000 + 2,500 + 5,400 + 1,000 = 16,100
 *   Transferencia             800 + 3,200                   =  4,000
 *   TOTAL                                                    = 37,100
 */

import type { CicloFivPropio, Transferencia } from "./types";

export const DUOSTIM: {
  primera: CicloFivPropio;
  segunda: CicloFivPropio;
  transferencia: Transferencia;
  total_formatted: string;
} = {
  primera: {
    subtotal: "17,000.00",
    consulta: "1,200.00",
    medicacion: "6,000.00",
    honorarios: "3,000.00",
    aspiracion_fiv: "5,800.00",
    vitrificacion: "1,000.00",
  },
  segunda: {
    subtotal: "16,100.00",
    consulta: "1,200.00",
    medicacion: "6,000.00",
    honorarios: "2,500.00",
    aspiracion_fiv: "5,400.00",
    vitrificacion: "1,000.00",
  },
  transferencia: {
    subtotal: "4,000.00",
    honorarios: "800.00",
    control_endometrial: "3,200.00",
  },
  total_formatted: "37,100.00",
};
