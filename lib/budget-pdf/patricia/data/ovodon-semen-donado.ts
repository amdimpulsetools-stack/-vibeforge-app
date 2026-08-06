/**
 * FECUNDACIÓN IN VITRO CON ÓVULOS DONADOS Y SEMEN DONADO — precio único.
 * Fuente: "PRESUPUESTO FIV CON OVULOS DONADOS Y SEMEN DONADO.docx".
 *
 * ⚠ ERRATA ARITMÉTICA CORREGIDA (2 de 2 en este documento)
 * ─────────────────────────────────────────────────────────
 *   Subtotal del bloque FIV
 *     · el doc original decía  S/ 25,100
 *     · los ítems suman        14,400 + 6,600 + 4,000 = S/ 25,000
 *   TOTAL
 *     · el doc original decía  S/ 29,350
 *     · los bloques suman      25,000 + 4,250 = S/ 29,250
 *
 * Origen probable: el documento se copió del de ovodonación estándar
 * (óvulos S/ 14,500 → subtotal 25,100 → total 29,350) y se bajó el
 * precio de los óvulos a 14,400 sin rehacer las sumas. Por decisión
 * del founder (2026-08-06) mandan los ítems: se imprime 25,000 /
 * 29,250. Si la clínica confirma que el precio correcto era el TOTAL
 * y no la línea, el arreglo es subir `ovulos_donante` a 14,500 aquí.
 *
 * Resto de la aritmética verificada ✓:
 *   Transferencia  800 + 3,450 = 4,250
 */

import type { CicloFivDonante, Transferencia } from "./types";

export const OVODON_SEMEN_DONADO: {
  fiv: CicloFivDonante;
  transferencia: Transferencia;
  total_formatted: string;
} = {
  fiv: {
    subtotal: "25,000.00", // doc original decía 25,100 — ítems suman 25,000
    ovulos_donante: "14,400.00",
    procedimiento: "6,600.00",
    honorarios: "4,000.00",
  },
  transferencia: {
    subtotal: "4,250.00",
    honorarios: "800.00",
    control_endometrial: "3,450.00",
  },
  total_formatted: "29,250.00", // doc original decía 29,350 — bloques suman 29,250
};
