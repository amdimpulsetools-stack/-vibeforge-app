import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ¿La paciente ya tiene una cita VIVA (no cancelada) ese día a esa hora?
 *
 * Incidente 02-oct-2026 (Dra. Patricia): tres citas duplicadas en una
 * mañana, cada par con 3-5 segundos de diferencia. El formulario creaba la
 * pre-reserva, seguía abierto mientras armaba el mensaje de WhatsApp y un
 * segundo clic en "Guardar" creaba una cita idéntica. El chequeo de choques
 * del formulario mira la lista de la agenda, que todavía no tenía la cita
 * recién creada; este chequeo pregunta a la base justo antes de insertar.
 *
 * Es la copia en cliente del candado de la mig 282
 * (`uq_appointments_patient_slot_live`): aquí el mensaje es humano; allá,
 * la garantía. Solo lectura, con el cliente del usuario (RLS).
 */
export interface LiveSlotMatch {
  id: string;
  status: string;
  isHold: boolean;
}

export async function findLivePatientAppointmentAtSlot(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    patientId: string;
    appointmentDate: string; // yyyy-MM-dd
    startTime: string; // HH:MM o HH:MM:SS
    excludeAppointmentId?: string | null;
  },
): Promise<{ found: LiveSlotMatch | null; error: string | null }> {
  const startTime = input.startTime.length === 5 ? `${input.startTime}:00` : input.startTime;
  let q = supabase
    .from("appointments")
    .select("id, status, hold_expires_at")
    .eq("organization_id", input.organizationId)
    .eq("patient_id", input.patientId)
    .eq("appointment_date", input.appointmentDate)
    .eq("start_time", startTime)
    .neq("status", "cancelled")
    .limit(1);
  if (input.excludeAppointmentId) q = q.neq("id", input.excludeAppointmentId);

  const res = await q;
  // Mig 274 sin aplicar: la columna hold_expires_at no existe. Se repite
  // sin ella; el chequeo sigue valiendo.
  if (res.error && /hold_expires_at/i.test(res.error.message ?? "")) {
    let q2 = supabase
      .from("appointments")
      .select("id, status")
      .eq("organization_id", input.organizationId)
      .eq("patient_id", input.patientId)
      .eq("appointment_date", input.appointmentDate)
      .eq("start_time", startTime)
      .neq("status", "cancelled")
      .limit(1);
    if (input.excludeAppointmentId) q2 = q2.neq("id", input.excludeAppointmentId);
    const r2 = await q2;
    if (r2.error) return { found: null, error: r2.error.message };
    const row = (r2.data?.[0] as { id: string; status: string } | undefined) ?? null;
    return { found: row ? { id: row.id, status: row.status, isHold: false } : null, error: null };
  }
  if (res.error) return { found: null, error: res.error.message };
  const row =
    (res.data?.[0] as { id: string; status: string; hold_expires_at: string | null } | undefined) ?? null;
  return {
    found: row ? { id: row.id, status: row.status, isHold: row.hold_expires_at != null } : null,
    error: null,
  };
}
