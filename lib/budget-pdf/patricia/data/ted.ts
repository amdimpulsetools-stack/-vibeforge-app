/**
 * TRANSFERENCIA EMBRIONARIA DIFERIDA (TED) — precio único.
 * Fuente: "TRANSFERENCIA EMBRIONARIA.docx".
 *
 * Presupuesto suelto para pacientes que ya tienen embriones
 * vitrificados. Ojo: los honorarios (S/ 1,200) son MÁS ALTOS que la
 * línea de transferencia embebida en los ciclos FIV/DUO STIM/ROPA
 * (S/ 800) — así viene en el original y es coherente: allí la
 * transferencia va bonificada dentro del paquete.
 *
 * Aritmética verificada ✓ (sin erratas):
 *   1,200 + 3,800 = 5,000
 */

import type { Transferencia } from "./types";

export const TED: {
  transferencia: Transferencia;
  total_formatted: string;
} = {
  transferencia: {
    subtotal: "5,000.00",
    honorarios: "1,200.00",
    control_endometrial: "3,800.00",
  },
  total_formatted: "5,000.00",
};
