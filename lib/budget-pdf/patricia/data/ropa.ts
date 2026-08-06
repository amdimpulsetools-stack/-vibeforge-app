/**
 * MÉTODO ROPA (Recepción de Óvulos de la PAreja) — precio único.
 * Fuente: "PRESUPUESTO ROPA.docx".
 *
 * Una integrante de la pareja aporta los óvulos (ciclo FIV completo) y
 * la otra gesta (transferencia). Se usa semen donado, cuyo costo corre
 * aparte y no entra en el total.
 *
 * ⚠ ERRATA ARITMÉTICA CORREGIDA (1 de 1 en este documento)
 * ─────────────────────────────────────────────────────────
 *   Subtotal del bloque de la donante
 *     · el doc original decía  S/ 17,000
 *     · los ítems suman        1,400 + 6,000 + 3,000 + 5,800 + 1,000
 *                              = S/ 17,200
 *
 * Origen probable: el bloque se copió del FIV estándar (donde la
 * consulta cuesta S/ 1,200 y el subtotal 17,000) y se subió la
 * consulta a S/ 1,400 sin rehacer la suma. El TOTAL del original —
 * S/ 21,200 — YA estaba calculado sobre 17,200, así que la única
 * cifra que cambia respecto al .docx es el subtotal intermedio; el
 * total impreso es idéntico al del documento.
 *
 * Resto de la aritmética verificada ✓:
 *   Receptora  800 + 3,200                    =  4,000
 *   TOTAL      17,200 + 4,000                 = 21,200 ✓ (= doc)
 */

import type { CicloFivPropio, Transferencia } from "./types";

export const ROPA: {
  donante: CicloFivPropio;
  receptora: Transferencia;
  total_formatted: string;
} = {
  donante: {
    subtotal: "17,200.00", // doc original decía 17,000 — ítems suman 17,200
    consulta: "1,400.00",
    medicacion: "6,000.00",
    honorarios: "3,000.00",
    aspiracion_fiv: "5,800.00",
    vitrificacion: "1,000.00",
  },
  receptora: {
    subtotal: "4,000.00",
    honorarios: "800.00",
    control_endometrial: "3,200.00",
  },
  total_formatted: "21,200.00",
};
