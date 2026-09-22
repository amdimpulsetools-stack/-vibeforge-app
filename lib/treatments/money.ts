/**
 * Dinero de un TRATAMIENTO (addon fertilidad) — fórmula única.
 *
 * Espejo EXACTO del RPC `get_treatments_overview` (mig 245). Cambiar JUNTOS.
 *
 *   paid_clinic      = Σ patient_payments.amount
 *                        con treatment_id = t y COALESCE(source,'clinical')='clinical'
 *   external_covered = Σ treatment_external_payments.amount (la paciente le
 *                        pagó DIRECTO al tercero: cubre acordado, no es cobro)
 *   covered          = paid_clinic + external_covered
 *   pending          = max(0, expected_total − covered)
 *   honorarium_paid  = Σ paid_clinic con revenue_bucket = 'honorarium'
 *
 * Todo BRUTO (con IGV, como se cobra). Aquí NADA se llama ingreso ni
 * ganancia: son cobros (regla de oro de CLAUDE.md). La ganancia neta
 * (÷1.18 según afectación − costos reales a terceros) es de la Entrega 2 y
 * vive en su propio RPC, jamás en estas funciones.
 *
 * La deuda de CITAS del paciente (lib/patient-debt.ts) EXCLUYE estos pagos
 * (mig 243): son dos cuentas distintas y nunca se restan entre sí.
 */

export type TreatmentPayment = {
  amount: number | string;
  /** mig 213: 'clinical' | 'pos'. Ausente ⇒ 'clinical'. */
  source?: string | null;
  /** mig 242: snapshot del concepto. */
  revenue_bucket?: string | null;
};

export type TreatmentExternalPayment = {
  amount: number | string;
};

export interface TreatmentMoney {
  expectedTotal: number;
  paidClinic: number;
  externalCovered: number;
  covered: number;
  pending: number;
  honorariumPaid: number;
  thirdPartyPaid: number;
  generalPaid: number;
  /** 0–100, tope 100. */
  progressPercent: number;
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const isClinical = (p: TreatmentPayment) => (p.source ?? "clinical") === "clinical";

/** Σ cobros clínicos del tratamiento (bruto). */
export function treatmentPaidClinic(payments: TreatmentPayment[] | null | undefined): number {
  return (payments ?? []).filter(isClinical).reduce((s, p) => s + num(p.amount), 0);
}

/** Σ pagos directos a terceros (informativos). */
export function treatmentExternalCovered(
  external: TreatmentExternalPayment[] | null | undefined,
): number {
  return (external ?? []).reduce((s, e) => s + num(e.amount), 0);
}

export function treatmentMoney(
  expectedTotal: number | string | null | undefined,
  payments: TreatmentPayment[] | null | undefined,
  external: TreatmentExternalPayment[] | null | undefined,
): TreatmentMoney {
  const expected = Math.max(0, num(expectedTotal));
  const clinical = (payments ?? []).filter(isClinical);
  const paidClinic = clinical.reduce((s, p) => s + num(p.amount), 0);
  const byBucket = (bucket: string) =>
    clinical.filter((p) => p.revenue_bucket === bucket).reduce((s, p) => s + num(p.amount), 0);
  const externalCovered = treatmentExternalCovered(external);
  const covered = paidClinic + externalCovered;
  const pending = Math.max(0, expected - covered);
  const progressPercent =
    expected > 0 ? Math.min(100, Math.round((covered / expected) * 100)) : 0;
  return {
    expectedTotal: expected,
    paidClinic,
    externalCovered,
    covered,
    pending,
    honorariumPaid: byBucket("honorarium"),
    thirdPartyPaid: byBucket("third_party"),
    generalPaid: byBucket("general"),
    progressPercent,
  };
}

/**
 * COSTO de insumos del tratamiento (mig 268): Σ cost_total de las salidas
 * del kardex con `treatment_id`, ya sin los pares deshechos (el que llama
 * los filtra, patrón `reversedPairIds` de Almacén).
 *
 * No es cobro ni pago: NO entra en `treatmentMoney`. Es neto (el costo de
 * compra viaja sin IGV), así que puede restarse de un ingreso neto en el
 * margen del tratamiento (Entrega 2), nunca del acordado bruto.
 * `estimated` = alguna fila sin costo estampado (producto sin entrada con
 * costo): el total está incompleto y la UI lo marca con asterisco, igual
 * que Rentabilidad.
 */
export function treatmentSuppliesCost(
  supplies: { cost_total: number | string | null }[] | null | undefined,
): { cost: number; estimated: boolean } {
  let cost = 0;
  let estimated = false;
  for (const s of supplies ?? []) {
    if (s.cost_total == null) estimated = true;
    else cost += num(s.cost_total);
  }
  return { cost: Math.round(cost * 100) / 100, estimated };
}
