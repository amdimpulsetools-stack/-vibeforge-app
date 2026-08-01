/**
 * Breakdown de precios DUO STIM (Acumulación de Embriones) por tier
 * (A/B/C) de NATURVITRA S.A.C.
 *
 * Fuente: docs/Budgets/DUO STIM - {A,B,C}.docx (2026-07). El diseño
 * HTML del founder corresponde al tier A.
 *
 * Estructura: dos estimulaciones ováricas completas (cada una con sus
 * fases estimulación → aspiración → congelación y su subtotal propio)
 * más un ciclo de descongelación y transferencia. TRES líneas de
 * honorarios por presupuesto — el ajuste de honorarios (mig 174) se
 * reparte entre ellas vía `distributeHonorarios`.
 *
 * Nota de fuente: los docx B y C traen el honorario de transferencia
 * con puntos de millar tipográficos ("S/ 1.300.00" / "S/ 1.080.00");
 * son 1,300.00 y 1,080.00 — mismos valores que la serie FIV.
 *
 * Montos como strings pre-formateados "1,234.00" — el template añade
 * el prefijo "S/" (misma filosofía que fiv-tiers.ts).
 */

export interface DuostimEstimulacionBreakdown {
  estimulacion: {
    subtotal: string;
    consulta: string; // "Consulta médica y/o controles ovulatorios"
  };
  aspiracion: {
    subtotal: string;
    honorarios_medicos: string; // varía por tier — línea de ajuste
    procedimiento_fiv: string;  // FIV o ICSI (5,800 en 1.ª, 5,400 en 2.ª)
  };
  congelacion: {
    subtotal: string;
    congelacion: string; // "Congelación de embriones"
  };
  subtotal: string; // subtotal del bloque de estimulación completo
}

export interface DuostimPhaseBreakdown {
  primera: DuostimEstimulacionBreakdown;
  segunda: DuostimEstimulacionBreakdown;
  transferencia: {
    subtotal: string;
    honorario_medico: string;    // varía por tier — línea de ajuste
    transferencia: string;       // fijo "3,200.00" en los 3 tiers
  };
  total_formatted: string;
}

export const DUOSTIM_TIER_BREAKDOWNS: Record<
  "A" | "B" | "C",
  DuostimPhaseBreakdown
> = {
  A: {
    primera: {
      estimulacion: { subtotal: "1,200.00", consulta: "1,200.00" },
      aspiracion: {
        subtotal: "11,200.00",
        honorarios_medicos: "5,400.00",
        procedimiento_fiv: "5,800.00",
      },
      congelacion: { subtotal: "1,200.00", congelacion: "1,200.00" },
      subtotal: "13,600.00",
    },
    segunda: {
      estimulacion: { subtotal: "1,200.00", consulta: "1,200.00" },
      aspiracion: {
        subtotal: "10,300.00",
        honorarios_medicos: "4,900.00",
        procedimiento_fiv: "5,400.00",
      },
      congelacion: { subtotal: "1,200.00", congelacion: "1,200.00" },
      subtotal: "12,700.00",
    },
    transferencia: {
      subtotal: "4,850.00",
      honorario_medico: "1,650.00",
      transferencia: "3,200.00",
    },
    total_formatted: "31,150.00",
  },
  B: {
    primera: {
      estimulacion: { subtotal: "1,200.00", consulta: "1,200.00" },
      aspiracion: {
        subtotal: "10,120.00",
        honorarios_medicos: "4,320.00",
        procedimiento_fiv: "5,800.00",
      },
      congelacion: { subtotal: "1,200.00", congelacion: "1,200.00" },
      subtotal: "12,520.00",
    },
    segunda: {
      estimulacion: { subtotal: "1,200.00", consulta: "1,200.00" },
      aspiracion: {
        subtotal: "9,220.00",
        honorarios_medicos: "3,820.00",
        procedimiento_fiv: "5,400.00",
      },
      congelacion: { subtotal: "1,200.00", congelacion: "1,200.00" },
      subtotal: "11,620.00",
    },
    transferencia: {
      subtotal: "4,500.00",
      honorario_medico: "1,300.00",
      transferencia: "3,200.00",
    },
    total_formatted: "28,640.00",
  },
  C: {
    primera: {
      estimulacion: { subtotal: "1,200.00", consulta: "1,200.00" },
      aspiracion: {
        subtotal: "9,580.00",
        honorarios_medicos: "3,780.00",
        procedimiento_fiv: "5,800.00",
      },
      congelacion: { subtotal: "1,200.00", congelacion: "1,200.00" },
      subtotal: "11,980.00",
    },
    segunda: {
      estimulacion: { subtotal: "1,200.00", consulta: "1,200.00" },
      aspiracion: {
        subtotal: "8,680.00",
        honorarios_medicos: "3,280.00",
        procedimiento_fiv: "5,400.00",
      },
      congelacion: { subtotal: "1,200.00", congelacion: "1,200.00" },
      subtotal: "11,080.00",
    },
    transferencia: {
      subtotal: "4,280.00",
      honorario_medico: "1,080.00",
      transferencia: "3,200.00",
    },
    total_formatted: "27,340.00",
  },
};
