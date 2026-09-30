import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Por reprogramar" (mig 273): cita cancelada con la paciente pendiente de
 * volver a agendar. Vive como seguimiento en la bandeja existente
 * (`clinical_followups`); lo crea y lo cierra la base de datos (triggers
 * sobre `appointments`). Una tarjeta POR CITA cancelada (source_id = cita).
 *
 * Contrato con la base (mig 273):
 *  - `appointments.cancel_outcome` ('reprogramar' | 'no_vuelve' |
 *    'error_registro'): lo elige recepción al cancelar. Solo 'reprogramar'
 *    crea la tarjeta.
 *  - `appointments.cancel_money` ('a_cuenta' | 'penalidad' | 'devuelto'):
 *    qué pasó con lo pagado al cancelar. Solo 'a_cuenta' es trasladable.
 *  - `appointments.rescheduled_from_id`: la cita nueva apunta a la cancelada;
 *    el trigger cierra su tarjeta aunque cambie el servicio.
 *  - La tarjeta se guarda con `follow_up_date` y `appointment_id` NULL a
 *    propósito: así el inicio del doctor (RPCs get_doctor_dashboard_enhanced
 *    / get_doctor_personal_stats) no la cuenta como seguimiento clínico
 *    vencido. El vínculo con la cita va en `source_id`; la fecha, en
 *    `expected_by`. NUNCA escribir follow_up_date en estas tarjetas.
 */
export const RESCHEDULE_PENDING_RULE_KEY = "core.reschedule_pending";

/** Estados en los que un seguimiento sigue abierto (mismos que la bandeja). */
export const RESCHEDULE_OPEN_STATUSES = ["pendiente", "contactado", "pospuesto"] as const;

/** Deep-link de la burbuja de la agenda a la bandeja ya filtrada. */
export const RESCHEDULE_INBOX_HREF = "/scheduler/follow-ups?tipo=por-reprogramar";
export const RESCHEDULE_INBOX_PARAM = { key: "tipo", value: "por-reprogramar" } as const;

/** Parámetro de la agenda que activa el "modo reprogramar" (id de la cita cancelada). */
export const RESCHEDULE_MODE_PARAM = "reprogramar";
export const rescheduleModeHref = (cancelledAppointmentId: string) =>
  `/scheduler?${RESCHEDULE_MODE_PARAM}=${encodeURIComponent(cancelledAppointmentId)}`;

/** Días hasta que la tarjeta se ve "vencida" (la base usa el mismo valor). */
export const RESCHEDULE_DUE_DAYS = 2;

export type CancelOutcome = "reprogramar" | "no_vuelve" | "error_registro";
export type CancelMoney = "a_cuenta" | "penalidad" | "devuelto";

export const CANCEL_OUTCOME_LABEL: Record<CancelOutcome, string> = {
  reprogramar: "Reprogramará",
  no_vuelve: "No vuelve",
  error_registro: "Fue un error de registro",
};

/** Motivos fijos de "No reprograma" (se guardan en closure_reason). */
export const NO_RESCHEDULE_REASONS = [
  { code: "ya_no_necesita", label: "Ya no lo necesita" },
  { code: "otra_clinica", label: "Se atenderá en otra clínica" },
  { code: "economico", label: "Motivos económicos" },
  { code: "volvera_a_llamar", label: "Volverá a llamar ella misma" },
  { code: "otro", label: "Otro" },
] as const;
export type NoRescheduleReasonCode = (typeof NO_RESCHEDULE_REASONS)[number]["code"];

/**
 * Mensaje de WhatsApp para avisar a la paciente que su cita quedó pendiente
 * de reprogramar (al cancelar) o para coordinar la nueva fecha (bandeja).
 * Tono neutro, sin género.
 */
export function buildRescheduleMessage(vars: {
  patientName: string;
  clinicName: string;
  serviceName?: string | null;
  dateLabel?: string | null; // "12/10 a las 10:30"
  kind: "aviso_cancelacion" | "coordinar";
}): string {
  const clinic = vars.clinicName ? ` de ${vars.clinicName}` : "";
  const what = vars.serviceName ? `tu cita de ${vars.serviceName}` : "tu cita";
  const when = vars.dateLabel ? ` del ${vars.dateLabel}` : "";
  if (vars.kind === "aviso_cancelacion") {
    return (
      `Hola ${vars.patientName} 👋\n\n` +
      `Te escribimos${clinic}: tuvimos que cancelar ${what}${when}. ` +
      `Queremos darte una nueva fecha. ¿Qué día y horario te acomoda?\n\nQuedamos atentos.`
    );
  }
  return (
    `Hola ${vars.patientName} 👋\n\n` +
    `Te escribimos${clinic} para reprogramar ${what}${when}. ` +
    `¿Qué día y horario te acomoda?\n\nQuedamos atentos.`
  );
}

/**
 * Resumen para la burbuja de la agenda y el inicio de recepción:
 *  - `patients`: pacientes distintas con alguna tarjeta abierta.
 *  - `due`: pacientes a quienes toca llamar HOY (no pospuestas a futuro).
 * Nunca lanza: si la tabla/columna no existe o falla, devuelve ceros.
 */
export async function fetchReschedulePendingSummary(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<{ patients: number; due: number }> {
  const { data, error } = await supabase
    .from("clinical_followups")
    .select("patient_id, status, snooze_until")
    .eq("organization_id", organizationId)
    .eq("rule_key", RESCHEDULE_PENDING_RULE_KEY)
    .in("status", [...RESCHEDULE_OPEN_STATUSES])
    .limit(1000);
  if (error || !data) return { patients: 0, due: 0 };
  const nowMs = Date.now();
  const all = new Set<string>();
  const due = new Set<string>();
  for (const row of data as Array<{ patient_id: string; status: string; snooze_until: string | null }>) {
    all.add(row.patient_id);
    const snoozedToFuture =
      row.status === "pospuesto" && !!row.snooze_until && new Date(row.snooze_until).getTime() > nowMs;
    if (!snoozedToFuture) due.add(row.patient_id);
  }
  return { patients: all.size, due: due.size };
}
