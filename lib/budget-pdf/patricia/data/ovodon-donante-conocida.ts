/**
 * FIV CON ÓVULOS DONADOS (DONANTE CONOCIDA) — precio único.
 * Fuente: "Presupuesto FIV ovulos donados donante conocida.docx".
 *
 * Variante más barata de la ovodonación: la paciente aporta su propia
 * donante, así que el paquete de óvulos baja de 14,500 a 11,000.
 * El original es además el único SIN sección "Consideraciones" ni
 * "Evaluaciones previas"; la plantilla las incluye igual porque
 * aplican al tratamiento (mismo criterio que el resto del lote) y su
 * ausencia en el .docx es un olvido de edición, no una condición
 * comercial distinta.
 *
 * Aritmética verificada ✓ (sin erratas):
 *   FIV            11,000 + 6,600 + 4,000 = 21,600
 *   Transferencia     800 + 3,450         =  4,250
 *   TOTAL                                  = 25,850
 */

import type { CicloFivDonante, Transferencia } from "./types";

export const OVODON_DONANTE_CONOCIDA: {
  fiv: CicloFivDonante;
  transferencia: Transferencia;
  total_formatted: string;
} = {
  fiv: {
    subtotal: "21,600.00",
    ovulos_donante: "11,000.00",
    procedimiento: "6,600.00",
    honorarios: "4,000.00",
  },
  transferencia: {
    subtotal: "4,250.00",
    honorarios: "800.00",
    control_endometrial: "3,450.00",
  },
  total_formatted: "25,850.00",
};
