/**
 * FIV MIXTA: ÓVULOS PROPIOS + ÓVULOS DONADOS — precio único.
 * Fuente: "presupuesto FIV mixto.docx".
 *
 * Es el único presupuesto con CUATRO bloques: se estimula a la donante
 * y a la paciente en paralelo, se fecunda todo junto y se transfiere.
 *
 * Aritmética verificada ✓ (sin erratas):
 *   Donante        15,500 + 4,000               = 19,500
 *   Paciente        1,200 + 6,000 + 3,000       = 10,200
 *   FIV                                          =  6,600
 *   Transferencia     800 + 3,450               =  4,250
 *   TOTAL                                        = 40,550
 */

import type {
  CicloFivPropio,
  Transferencia,
} from "./types";

export const FIV_MIXTO: {
  donante: { subtotal: string; ovulos_donante: string; honorarios: string };
  paciente: Pick<
    CicloFivPropio,
    "subtotal" | "consulta" | "medicacion" | "honorarios"
  >;
  fiv: { subtotal: string };
  transferencia: Transferencia;
  total_formatted: string;
} = {
  donante: {
    subtotal: "19,500.00",
    ovulos_donante: "15,500.00",
    honorarios: "4,000.00",
  },
  paciente: {
    subtotal: "10,200.00",
    consulta: "1,200.00",
    medicacion: "6,000.00",
    honorarios: "3,000.00",
  },
  // "Procedimiento de FIV-ICSI + Vitrificación de embriones" — línea
  // única, sin desglose en el original.
  fiv: { subtotal: "6,600.00" },
  transferencia: {
    subtotal: "4,250.00",
    honorarios: "800.00",
    control_endometrial: "3,450.00",
  },
  total_formatted: "40,550.00",
};
