/**
 * Breakdown de precios Ovodonación + NGS por tier (A/B/C) de
 * NATURVITRA S.A.C.
 *
 * Fuente de estructura: docs/Budgets/OVODON+NGS.{A,B,C} (1).docx +
 * diseño HTML del founder. Fuente de MONTOS: los tiers reales que
 * Vitra fijó en prod (`service_budget_tiers`, confirmados por founder
 * 2026-08-01), que difieren de los docx:
 *
 *   docx:  A = 32,050 · B = 32,050 (copia de A) · C = 30,750
 *   prod:  A = 33,480 · B = 32,050              · C = 30,750
 *
 * El tier A de prod reparte el alza (+1,430 sobre el docx) entre las
 * dos líneas de honorarios: estimulación 6,480 (+1,080) y primera
 * transferencia 1,650 (+350) — desglose dictado por el founder. El
 * tier B usa el desglose del docx A; el C, el del docx C.
 *
 * DOS líneas de honorarios por presupuesto — el ajuste de honorarios
 * (mig 174) se reparte entre ellas vía `distributeHonorarios`.
 *
 * Montos como strings pre-formateados "1,234.00" — el template añade
 * el prefijo "S/" (misma filosofía que fiv-tiers.ts).
 */

export interface OvodonPhaseBreakdown {
  estimulacion: {
    subtotal: string;
    ovulos_donante: string;     // fijo "14,500.00" (incluye medicación,
                                // evaluaciones y aspiración folicular)
    honorarios_medicos: string; // varía por tier — línea de ajuste
  };
  fiv: {
    subtotal: string; // fijo "6,850.00" — procedimiento, cultivo,
                      // vitrificación y biopsia van como "Incluido"
  };
  transferencia: {
    subtotal: string;
    honorarios_medicos: string; // varía por tier — línea de ajuste
    desvitrificacion: string;   // fijo "4,000.00"
  };
  total_formatted: string;
}

export const OVODON_TIER_BREAKDOWNS: Record<
  "A" | "B" | "C",
  OvodonPhaseBreakdown
> = {
  A: {
    estimulacion: {
      subtotal: "20,980.00",
      ovulos_donante: "14,500.00",
      honorarios_medicos: "6,480.00",
    },
    fiv: { subtotal: "6,850.00" },
    transferencia: {
      subtotal: "5,650.00",
      honorarios_medicos: "1,650.00",
      desvitrificacion: "4,000.00",
    },
    total_formatted: "33,480.00",
  },
  B: {
    estimulacion: {
      subtotal: "19,900.00",
      ovulos_donante: "14,500.00",
      honorarios_medicos: "5,400.00",
    },
    fiv: { subtotal: "6,850.00" },
    transferencia: {
      subtotal: "5,300.00",
      honorarios_medicos: "1,300.00",
      desvitrificacion: "4,000.00",
    },
    total_formatted: "32,050.00",
  },
  C: {
    estimulacion: {
      subtotal: "18,820.00",
      ovulos_donante: "14,500.00",
      honorarios_medicos: "4,320.00",
    },
    fiv: { subtotal: "6,850.00" },
    transferencia: {
      subtotal: "5,080.00",
      honorarios_medicos: "1,080.00",
      desvitrificacion: "4,000.00",
    },
    total_formatted: "30,750.00",
  },
};
