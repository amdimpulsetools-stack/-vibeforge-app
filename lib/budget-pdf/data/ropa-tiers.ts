/**
 * Breakdown de precios Método ROPA por tier (A/B/C) de NATURVITRA
 * S.A.C.
 *
 * Fuente: docs/Budgets/METODO ROPA-{A,B,C} (1).docx. El diseño HTML
 * del founder corresponde al tier A. Los precios son exactamente los
 * de FIV (es una FIV repartida entre dos mujeres): donante = ciclo
 * FIV completo con vitrificación; receptora = transferencia.
 *
 * DOS líneas de honorarios por presupuesto (donante + receptora) —
 * el ajuste de honorarios (mig 174) se reparte entre ellas vía
 * `distributeHonorarios`.
 *
 * DISCREPANCIA vs mig 140 (`service_budget_tiers` seed, baseline):
 *   mig 140 dice  A = 13,600 · B = 12,520 · C = 11,980  (solo donante)
 *   los docx dicen A = 18,450 · B = 17,020 · C = 16,260 (donante +
 *   receptora). Los docx mandan — la mig 180 sube los montos en prod
 *   (confirmado por founder 2026-08-01).
 *
 * Montos como strings pre-formateados "1,234.00" — el template añade
 * el prefijo "S/" (misma filosofía que fiv-tiers.ts).
 */

export interface RopaPhaseBreakdown {
  donante: {
    estimulacion: {
      subtotal: string;
      consulta: string;
    };
    aspiracion: {
      subtotal: string;
      honorarios_medicos: string; // varía por tier — línea de ajuste
      procedimiento_fiv: string;  // fijo "5,800.00"
    };
    fiv: {
      subtotal: string;
      vitrificacion: string; // fijo "1,200.00"
    };
    subtotal: string; // subtotal del tratamiento donante completo
  };
  receptora: {
    subtotal: string;
    honorario_medico: string;     // varía por tier — línea de ajuste
    control_endometrial: string;  // fijo "3,200.00" (transferencia incluida)
  };
  total_formatted: string;
}

export const ROPA_TIER_BREAKDOWNS: Record<"A" | "B" | "C", RopaPhaseBreakdown> =
  {
    A: {
      donante: {
        estimulacion: { subtotal: "1,200.00", consulta: "1,200.00" },
        aspiracion: {
          subtotal: "11,200.00",
          honorarios_medicos: "5,400.00",
          procedimiento_fiv: "5,800.00",
        },
        fiv: { subtotal: "1,200.00", vitrificacion: "1,200.00" },
        subtotal: "13,600.00",
      },
      receptora: {
        subtotal: "4,850.00",
        honorario_medico: "1,650.00",
        control_endometrial: "3,200.00",
      },
      total_formatted: "18,450.00",
    },
    B: {
      donante: {
        estimulacion: { subtotal: "1,200.00", consulta: "1,200.00" },
        aspiracion: {
          subtotal: "10,120.00",
          honorarios_medicos: "4,320.00",
          procedimiento_fiv: "5,800.00",
        },
        fiv: { subtotal: "1,200.00", vitrificacion: "1,200.00" },
        subtotal: "12,520.00",
      },
      receptora: {
        subtotal: "4,500.00",
        honorario_medico: "1,300.00",
        control_endometrial: "3,200.00",
      },
      total_formatted: "17,020.00",
    },
    C: {
      donante: {
        estimulacion: { subtotal: "1,200.00", consulta: "1,200.00" },
        aspiracion: {
          subtotal: "9,580.00",
          honorarios_medicos: "3,780.00",
          procedimiento_fiv: "5,800.00",
        },
        fiv: { subtotal: "1,200.00", vitrificacion: "1,200.00" },
        subtotal: "11,980.00",
      },
      receptora: {
        subtotal: "4,280.00",
        honorario_medico: "1,080.00",
        control_endometrial: "3,200.00",
      },
      total_formatted: "16,260.00",
    },
  };
