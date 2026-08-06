/**
 * FECUNDACIÓN IN VITRO CON SEMEN DONADO — precio único.
 * Fuente: "PRESUPUESTO DE FIV CON SEMEN DONADO.docx".
 *
 * Mismos montos que el FIV estándar; lo que cambia es el bloque
 * informativo "SEMEN DONADO" (US$ 500–2,500 aprox., a cargo de la
 * paciente y NO incluido en el total). Se mantiene como data file y
 * plantilla propios en vez de un flag sobre FIV porque los precios de
 * los dos presupuestos pueden divergir en la próxima revisión de
 * tarifario.
 *
 * Aritmética verificada ✓ (sin erratas):
 *   FIV            1,200 + 6,000 + 3,000 + 5,800 + 1,000 = 17,000
 *   Transferencia          800 + 3,200                   =  4,000
 *   TOTAL                                                = 21,000
 */

import type { CicloFivPropio, Transferencia } from "./types";

export const FIV_SEMEN_DONADO: {
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
