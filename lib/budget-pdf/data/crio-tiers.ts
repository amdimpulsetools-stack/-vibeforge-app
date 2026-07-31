/**
 * Breakdown de precios Criopreservación de Ovocitos (CRIO) por tier
 * (A/B/C) de NATURVITRA S.A.C.
 *
 * Fuente: docs/Budgets/CRIO DE OVULOS-{A,B,C} (1).docx.
 *
 * Verificación cruzada vs mig 140 (`service_budget_tiers` seed):
 *   A = 12,600 · B = 11,520 · C = 10,980 — los tres cuadran ✓
 *   (7,200 de aspiración folicular + honorarios variables por tier).
 *
 * Las Consideraciones son idénticas en los 3 docx (solo cambia el
 * monto de honorarios), por lo que viven hardcodeadas en CRIO.hbs.
 *
 * Montos como strings pre-formateados "1,234.00" — el template añade
 * el prefijo "S/" (misma filosofía que fiv-tiers.ts).
 */

export interface CrioPhaseBreakdown {
  fase: {
    subtotal: string;              // "12,600.00" — única fase: subtotal = total
    aspiracion_folicular: string;  // fijo "7,200.00" en los 3 tiers
    honorarios_medicos: string;    // varía por tier
  };
  total_formatted: string;
}

export const CRIO_TIER_BREAKDOWNS: Record<"A" | "B" | "C", CrioPhaseBreakdown> = {
  A: {
    fase: {
      subtotal: "12,600.00",
      aspiracion_folicular: "7,200.00",
      honorarios_medicos: "5,400.00",
    },
    total_formatted: "12,600.00",
  },
  B: {
    fase: {
      subtotal: "11,520.00",
      aspiracion_folicular: "7,200.00",
      honorarios_medicos: "4,320.00",
    },
    total_formatted: "11,520.00",
  },
  C: {
    fase: {
      subtotal: "10,980.00",
      aspiracion_folicular: "7,200.00",
      honorarios_medicos: "3,780.00",
    },
    total_formatted: "10,980.00",
  },
};
