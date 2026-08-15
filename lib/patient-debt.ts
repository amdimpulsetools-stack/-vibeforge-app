/**
 * Deuda clínica del paciente — fórmula única para cliente y servidor.
 *
 * Espejo EXACTO del RPC `get_patient_summary` (supabase/migrations/219).
 * Existe para que las tres vistas que muestran deuda no vuelvan a divergir:
 *   · PatientDrawer  → usa el RPC (badge "Saldo pendiente")
 *   · Lista de pacientes → filtro "con deuda" + export CSV (calcula aquí)
 *   · Sidebar de la cita → deuda total del paciente (calcula aquí)
 *
 * El bug que motivó esto: el RPC facturaba `services.base_price` (precio de
 * CATÁLOGO) mientras el resto de la app usaba el precio real de la cita. Una
 * cita de catálogo S/ 200 con precio personalizado S/ 180 y S/ 180 pagados
 * mostraba "Saldo pendiente S/ 20" solo en el drawer.
 *
 * Precio real de una cita (fórmula canónica fijada en la mig 100):
 *   GREATEST(0, COALESCE(price_snapshot, services.base_price) - discount_amount)
 * · price_snapshot (mig 011) es el precio acordado y congelado al crear la
 *   cita: precio personalizado > precio de sesión de plan > catálogo.
 * · El fallback a base_price cubre citas anteriores a la mig 011 y las
 *   guardadas sin snapshot. Se dispara solo con price_snapshot == null: una
 *   cita legítimamente gratis (0) factura 0 y no resucita el catálogo.
 * · El clamp a 0 evita que un descuento mayor que el precio genere crédito
 *   negativo que cancele la deuda de otras citas.
 */

export type BillableAppointment = {
  status: string;
  price_snapshot: number | null;
  discount_amount?: number | null;
  services?: { base_price?: number | null } | null;
};

export type ClinicalPayment = {
  amount: number;
  /** mig 213: 'clinical' | 'pos'. Ausente ⇒ 'clinical' (default de la columna). */
  source?: string | null;
};

/** Precio real facturado por UNA cita. No aplica el filtro de canceladas. */
export function appointmentBilledAmount(a: BillableAppointment): number {
  const gross =
    a.price_snapshot != null
      ? Number(a.price_snapshot)
      : Number(a.services?.base_price ?? 0);
  const discount = Number(a.discount_amount ?? 0);
  return Math.max(0, (Number.isFinite(gross) ? gross : 0) - (Number.isFinite(discount) ? discount : 0));
}

/** SUM del precio real de las citas NO canceladas. */
export function totalBilled(appointments: BillableAppointment[] | null | undefined): number {
  return (appointments ?? [])
    .filter((a) => a.status !== "cancelled")
    .reduce((sum, a) => sum + appointmentBilledAmount(a), 0);
}

/**
 * SUM de los pagos que cancelan deuda CLÍNICA. Los cobros del POS de farmacia
 * (source='pos', mig 213/216) no cancelan consultas: si no se filtran, un
 * paracetamol de S/ 8 baja la deuda clínica del paciente.
 */
export function totalClinicalPaid(payments: ClinicalPayment[] | null | undefined): number {
  return (payments ?? [])
    .filter((p) => (p.source ?? "clinical") === "clinical")
    .reduce((sum, p) => sum + Number(p.amount), 0);
}

/** Saldo pendiente del paciente. Nunca negativo: un saldo a favor no es deuda. */
export function patientPendingBalance(
  appointments: BillableAppointment[] | null | undefined,
  payments: ClinicalPayment[] | null | undefined
): number {
  return Math.max(0, totalBilled(appointments) - totalClinicalPaid(payments));
}
