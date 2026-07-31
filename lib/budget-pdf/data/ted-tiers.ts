/**
 * Breakdown de precios Transferencia Embrionaria Diferida (TED) por
 * tier (A/B/C) de NATURVITRA S.A.C.
 *
 * Fuente: docs/Budgets/TED.{A,B,C} (1).docx.
 *
 * DISCREPANCIA vs mig 140 (`service_budget_tiers` seed, baseline):
 *   mig 140 dice  A = 4,500 · B = 4,280 · C = 4,280
 *   los docx dicen A = 5,000 · B = 4,700 · C = 4,400
 * Los docx mandan (mig 140 es baseline anterior): cada docx cuadra
 * internamente — control endometrial 3,200 fijo + honorario médico
 * 1,800 / 1,500 / 1,200 = 5,000 / 4,700 / 4,400. Si Vitra hizo el
 * seed inicial desde mig 140, el admin debe actualizar los montos de
 * TED en `service_budget_tiers` vía UI o SQL (mismo caso documentado
 * en fiv-tiers.ts para FIV-A).
 *
 * Las Consideraciones son idénticas en los 3 docx, por lo que viven
 * hardcodeadas en TED.hbs.
 *
 * Montos como strings pre-formateados "1,234.00" — el template añade
 * el prefijo "S/" (misma filosofía que fiv-tiers.ts).
 */

export interface TedPhaseBreakdown {
  transferencia: {
    subtotal: string;            // única fase: subtotal = total
    honorario_medico: string;    // varía por tier
    control_endometrial: string; // fijo "3,200.00" en los 3 tiers
  };
  total_formatted: string;
}

export const TED_TIER_BREAKDOWNS: Record<"A" | "B" | "C", TedPhaseBreakdown> = {
  A: {
    transferencia: {
      subtotal: "5,000.00",
      honorario_medico: "1,800.00",
      control_endometrial: "3,200.00",
    },
    total_formatted: "5,000.00",
  },
  B: {
    transferencia: {
      subtotal: "4,700.00",
      honorario_medico: "1,500.00",
      control_endometrial: "3,200.00",
    },
    total_formatted: "4,700.00",
  },
  C: {
    transferencia: {
      subtotal: "4,400.00",
      honorario_medico: "1,200.00",
      control_endometrial: "3,200.00",
    },
    total_formatted: "4,400.00",
  },
};
