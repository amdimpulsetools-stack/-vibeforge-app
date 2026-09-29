import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Adelantos "a cuenta" que una paciente dejó en citas CANCELADAS (mig 273).
 *
 * Solo cuenta lo que recepción marcó explícitamente como "queda a cuenta de
 * la próxima cita" (`appointments.cancel_money = 'a_cuenta'`): una penalidad
 * retenida o un pago devuelto NO son saldo a favor. Solo plata clínica de la
 * cita (source clinical, sin tratamiento ni plan): la regla de CLAUDE.md
 * "un cobro vive en UN solo contenedor" se respeta porque el traslado mueve
 * la fila entera de una cita a otra; nunca la parte ni la duplica.
 *
 * No reescribe ninguna fórmula de deuda: get_patient_summary /
 * lib/patient-debt.ts dan los mismos totales antes y después del traslado.
 */
export interface TransferableDeposit {
  appointmentId: string;
  appointmentDate: string; // yyyy-MM-dd
  startTime: string; // HH:MM:SS
  serviceName: string | null;
  amount: number;
  paymentsCount: number;
}

export async function fetchTransferableDeposits(
  supabase: SupabaseClient,
  patientId: string,
  opts: { excludeAppointmentId?: string } = {},
): Promise<TransferableDeposit[]> {
  const { data: appts, error } = await supabase
    .from("appointments")
    .select("id, appointment_date, start_time, services(name)")
    .eq("patient_id", patientId)
    .eq("status", "cancelled")
    .eq("cancel_money", "a_cuenta")
    .order("appointment_date", { ascending: false })
    .limit(20);
  // Antes de aplicar la mig 273 la columna no existe: sin adelantos, sin ruido.
  if (error || !appts || appts.length === 0) return [];

  const rows = appts as unknown as Array<{
    id: string;
    appointment_date: string;
    start_time: string;
    services: { name: string } | null;
  }>;
  const ids = rows.filter((a) => a.id !== opts.excludeAppointmentId).map((a) => a.id);
  if (ids.length === 0) return [];

  const { data: pays } = await supabase
    .from("patient_payments")
    .select("appointment_id, amount, source, treatment_id, treatment_plan_id")
    .in("appointment_id", ids);

  const byAppt = new Map<string, { amount: number; count: number }>();
  for (const p of (pays ?? []) as Array<{
    appointment_id: string;
    amount: number | string;
    source: string | null;
    treatment_id: string | null;
    treatment_plan_id: string | null;
  }>) {
    if ((p.source ?? "clinical") !== "clinical") continue;
    if (p.treatment_id || p.treatment_plan_id) continue;
    const cur = byAppt.get(p.appointment_id) ?? { amount: 0, count: 0 };
    cur.amount += Number(p.amount) || 0;
    cur.count += 1;
    byAppt.set(p.appointment_id, cur);
  }

  return rows
    .filter((a) => byAppt.has(a.id) && (byAppt.get(a.id)?.amount ?? 0) > 0)
    .map((a) => ({
      appointmentId: a.id,
      appointmentDate: a.appointment_date,
      startTime: a.start_time,
      serviceName: a.services?.name ?? null,
      amount: Math.round((byAppt.get(a.id)!.amount + Number.EPSILON) * 100) / 100,
      paymentsCount: byAppt.get(a.id)!.count,
    }));
}

export interface TransferResult {
  ok: boolean;
  movedCount: number;
  amount: number;
  einvoicesMoved: number;
  error?: string;
}

/**
 * Traslada los pagos clínicos "a cuenta" de una cita cancelada a una cita
 * viva de la misma paciente (RPC `appointment_transfer_payments`, mig 273).
 * Corre con el cliente del usuario (RLS), nunca con service role. Mantiene
 * fecha, turno de caja y medio de pago: Caja, Ingresos y "Mis cobros" no
 * cambian.
 */
export async function transferDeposits(
  supabase: SupabaseClient,
  fromAppointmentId: string,
  toAppointmentId: string,
): Promise<TransferResult> {
  const { data, error } = await supabase.rpc("appointment_transfer_payments", {
    p_from_appointment_id: fromAppointmentId,
    p_to_appointment_id: toAppointmentId,
  });
  if (error) {
    return { ok: false, movedCount: 0, amount: 0, einvoicesMoved: 0, error: error.message };
  }
  const d = (data ?? {}) as { moved_count?: number; amount?: number | string; einvoices_moved?: number };
  return {
    ok: true,
    movedCount: Number(d.moved_count ?? 0),
    amount: Number(d.amount ?? 0),
    einvoicesMoved: Number(d.einvoices_moved ?? 0),
  };
}
