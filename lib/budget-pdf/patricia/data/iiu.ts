/**
 * INSEMINACIÓN INTRAUTERINA — precio único.
 * Fuente: "PRESUPUESTO INSEMINACION INTRAUTERINA.docx".
 *
 * Único formato del lote SIN precio por línea: el original lista lo
 * que incluye el paquete (consulta y controles ovulatorios, Ovidrel
 * 1 ampolla SC, capacitación espermática, inseminación, honorarios) y
 * cierra con un TOTAL de S/ 2,750. La plantilla respeta ese formato —
 * no se reparte el monto entre ítems porque la clínica no publica ese
 * desglose.
 *
 * Nótese que la medicación de disparo (Ovidrel) SÍ va incluida; la de
 * estimulación ovárica, si la paciente la requiere, es aparte
 * (S/ 1,500 — ver `shared.ts`).
 *
 * Aritmética: N/A (paquete cerrado, sin ítems valorizados).
 */

import type { PaqueteCerrado } from "./types";

export const IIU: PaqueteCerrado = {
  total_formatted: "2,750.00",
};
