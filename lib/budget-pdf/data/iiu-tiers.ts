/**
 * Breakdown de precios Inseminación Artificial (IIU) por tier (A/B/C)
 * de NATURVITRA S.A.C.
 *
 * Fuente: docs/Budgets/INSEMINACIÓN ARTIFICIAL - {A,B,C} (1).docx.
 *
 * Verificación cruzada vs mig 140 (`service_budget_tiers` seed):
 *   A = 3,750 · B = 3,420 · C = 3,100 — los tres cuadran ✓
 *   (1,800 de control folicular + honorarios variables por tier).
 *
 * Costos adicionales y Consideraciones (banco de semen, etc.) son
 * idénticos en los 3 docx, por lo que viven hardcodeados en IIU.hbs.
 *
 * Montos como strings pre-formateados "1,234.00" — el template añade
 * el prefijo "S/" (misma filosofía que fiv-tiers.ts).
 */

export interface IiuPhaseBreakdown {
  procedimiento: {
    subtotal: string;           // única fase: subtotal = total
    control_folicular: string;  // fijo "1,800.00" en los 3 tiers
    honorarios_medicos: string; // varía por tier
  };
  total_formatted: string;
}

export const IIU_TIER_BREAKDOWNS: Record<"A" | "B" | "C", IiuPhaseBreakdown> = {
  A: {
    procedimiento: {
      subtotal: "3,750.00",
      control_folicular: "1,800.00",
      honorarios_medicos: "1,950.00",
    },
    total_formatted: "3,750.00",
  },
  B: {
    procedimiento: {
      subtotal: "3,420.00",
      control_folicular: "1,800.00",
      honorarios_medicos: "1,620.00",
    },
    total_formatted: "3,420.00",
  },
  C: {
    procedimiento: {
      subtotal: "3,100.00",
      control_folicular: "1,800.00",
      honorarios_medicos: "1,300.00",
    },
    total_formatted: "3,100.00",
  },
};
