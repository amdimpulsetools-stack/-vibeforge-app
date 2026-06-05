/**
 * Breakdown de precios FIV por tier (A/B/C) de NATURVITRA S.A.C.
 *
 * Fuente: docs/Budgets/FIV-{A,B,C} (1).docx — versiones actualizadas
 * 2026-06-04 con desglose detallado. Sustituyen a los precios viejos
 * de docs/presupuestos/ donde A y C eran iguales.
 *
 * Tier A = más completo (S/ 18,450), B intermedio (S/ 17,020),
 * C el más económico (S/ 16,260).
 *
 * NOTA: la migration 140 todavía tiene los precios viejos en
 * `service_budget_tiers` (A=16,260). Si Vitra hizo el seed inicial
 * desde ahí, el admin debe actualizar el tier A a 18,450 vía UI o
 * SQL para que coincida con este breakdown.
 *
 * Los precios NGS son los mismos para los 3 tiers.
 */

export interface FivPhaseBreakdown {
  estimulacion: {
    subtotal: string;     // "1,200.00"
    consulta: string;
  };
  aspiracion: {
    subtotal: string;
    honorarios_medicos: string;
    procedimiento_fiv: string;
  };
  congelacion: {
    subtotal: string;
    vitrificacion: string;
  };
  transferencia: {
    subtotal: string;
    honorarios_medicos: string;
    control_endometrial: string;
  };
  total_formatted: string;
}

export const FIV_TIER_BREAKDOWNS: Record<"A" | "B" | "C", FivPhaseBreakdown> = {
  A: {
    estimulacion: { subtotal: "1,200.00", consulta: "1,200.00" },
    aspiracion: {
      subtotal: "11,200.00",
      honorarios_medicos: "5,400.00",
      procedimiento_fiv: "5,800.00",
    },
    congelacion: { subtotal: "1,200.00", vitrificacion: "1,200.00" },
    transferencia: {
      subtotal: "4,850.00",
      honorarios_medicos: "1,650.00",
      control_endometrial: "3,200.00",
    },
    total_formatted: "18,450.00",
  },
  B: {
    estimulacion: { subtotal: "1,200.00", consulta: "1,200.00" },
    aspiracion: {
      subtotal: "10,120.00",
      honorarios_medicos: "4,320.00",
      procedimiento_fiv: "5,800.00",
    },
    congelacion: { subtotal: "1,200.00", vitrificacion: "1,200.00" },
    transferencia: {
      subtotal: "4,500.00",
      honorarios_medicos: "1,300.00",
      control_endometrial: "3,200.00",
    },
    total_formatted: "17,020.00",
  },
  C: {
    estimulacion: { subtotal: "1,200.00", consulta: "1,200.00" },
    aspiracion: {
      subtotal: "9,580.00",
      honorarios_medicos: "3,780.00",
      procedimiento_fiv: "5,800.00",
    },
    congelacion: { subtotal: "1,200.00", vitrificacion: "1,200.00" },
    transferencia: {
      subtotal: "4,280.00",
      honorarios_medicos: "1,080.00",
      control_endometrial: "3,200.00",
    },
    total_formatted: "16,260.00",
  },
};

export const FIV_NGS_PRICES = {
  biopsia: "3,000.00",        // S/
  embrion_1: "1,100.00",      // US$
  embrion_2: "1,300.00",
  embrion_3: "1,625.00",
  embrion_4: "2,050.00",
  embrion_5: "2,400.00",
  embrion_6: "2,600.00",
  embrion_7: "2,750.00",
  embrion_8: "2,850.00",
  embrion_adicional: "300.00",
};
