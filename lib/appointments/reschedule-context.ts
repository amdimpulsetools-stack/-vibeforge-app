import type { SupabaseClient } from "@supabase/supabase-js";
import { appointmentBilledAmount } from "@/lib/patient-debt";
import { fetchTransferableDeposits, type TransferableDeposit } from "@/lib/appointments/deposits";
import { RESCHEDULE_OPEN_STATUSES, RESCHEDULE_PENDING_RULE_KEY } from "@/lib/followups/reschedule";

/**
 * "Modo reprogramar" de la agenda (`/scheduler?reprogramar=<id cancelada>`).
 *
 * Contexto de la cita CANCELADA que se va a volver a agendar: todo lo que el
 * formulario de "Nueva cita" copia (paciente, doctor, servicio, precio
 * acordado, descuento, modalidad, origen, notas…) y el adelanto "a cuenta"
 * trasladable. Se carga con el cliente del usuario (RLS): solo se aceptan
 * citas de la org activa y en estado 'cancelled'.
 *
 * Qué NO se copia a propósito: status (la nueva nace 'scheduled'), pagos (se
 * trasladan aparte con appointment_transfer_payments), comprobantes,
 * google_event_id, estados en vivo, atribución, discount_code_id (no se
 * vuelve a gastar un uso del código) ni marcas de edición.
 *
 * Dinero: el "precio acordado" es `price_snapshot` tal cual y el total que
 * se muestra sale de `appointmentBilledAmount` (lib/patient-debt.ts); aquí no
 * se reescribe ninguna fórmula.
 */

/** Fila de paciente con las mismas columnas que la búsqueda por DNI del form. */
export interface ReschedulePatientRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  document_type: string | null;
  departamento: string | null;
  distrito: string | null;
  dni: string | null;
  is_recurring: boolean | null;
  origin: string | null;
  organization_id: string;
}

export const RESCHEDULE_PATIENT_COLUMNS =
  "id, first_name, last_name, phone, email, birth_date, document_type, departamento, distrito, dni, is_recurring, origin, organization_id";

export interface RescheduleContext {
  /** Id de la cita cancelada (irá en `rescheduled_from_id`). */
  appointmentId: string;
  appointmentDate: string; // yyyy-MM-dd
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  /** Minutos de la cita original (fin − inicio). */
  durationMinutes: number;
  patient: ReschedulePatientRow | null;
  /** Snapshot del nombre/teléfono en la cita (por si no hay ficha). */
  patientName: string;
  patientPhone: string | null;
  doctorId: string | null;
  doctorName: string | null;
  doctorActive: boolean;
  serviceId: string | null;
  serviceName: string | null;
  serviceBasePrice: number | null;
  serviceDuration: number | null;
  serviceActive: boolean;
  officeId: string | null;
  officeName: string | null;
  priceSnapshot: number | null;
  discountAmount: number;
  discountReason: string | null;
  /** Precio real de la cita original (lib/patient-debt.ts). */
  billedAmount: number;
  modality: string | null;
  meetingUrl: string | null;
  origin: string | null;
  paymentMethod: string | null;
  /** Notas SIN las líneas de sistema ([Motivo de cancelación], etc.). */
  notes: string;
  customFields: Record<string, unknown>;
  treatmentSessionId: string | null;
  /** Adelanto "a cuenta" que se trasladará a la cita nueva (mig 273). */
  deposit: TransferableDeposit | null;
}

export type LoadRescheduleResult =
  | { ok: true; ctx: RescheduleContext }
  | { ok: false; reason: "not_found" | "not_cancelled" | "error"; message?: string };

/** Líneas que escribe el sistema en `appointments.notes` al cancelar/trasladar. */
const SYSTEM_NOTE_LINE =
  /^\s*\[(Motivo de cancelaci[oó]n|Dinero|Adelanto trasladado|Devoluci[oó]n[^\]]*)\]/i;

export function stripSystemNoteLines(notes: string | null | undefined): string {
  return (notes ?? "")
    .split("\n")
    .filter((line) => !SYSTEM_NOTE_LINE.test(line))
    .join("\n")
    .trim();
}

/** "12/10 10:30" a partir de "yyyy-MM-dd" + "HH:MM[:SS]" (sin Date: fecha civil). */
export function formatRescheduleWhen(date: string, time: string): string {
  const [, m, d] = date.split("-");
  return `${d}/${m} ${time.slice(0, 5)}`;
}

/** Monto corto para banners: "S/ 180" o "S/ 180.50". */
export function formatSoles(n: number): string {
  const r = Math.round(n * 100) / 100;
  return `S/ ${Number.isInteger(r) ? r.toFixed(0) : r.toFixed(2)}`;
}

const toMinutes = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};

type RawAppt = {
  id: string;
  organization_id: string;
  status: string;
  patient_id: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  doctor_id: string | null;
  office_id: string | null;
  service_id: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  origin: string | null;
  payment_method: string | null;
  notes: string | null;
  meeting_url: string | null;
  modality?: string | null;
  price_snapshot: number | string | null;
  discount_amount: number | string | null;
  discount_reason: string | null;
  custom_fields: Record<string, unknown> | null;
  treatment_session_id: string | null;
  doctors: { id: string; full_name: string; is_active: boolean | null } | null;
  services: {
    id: string;
    name: string;
    base_price: number | string | null;
    duration_minutes: number | null;
    is_active: boolean | null;
  } | null;
  offices: { id: string; name: string } | null;
  patients: ReschedulePatientRow | null;
};

const apptColumns = (modality: boolean) =>
  `id, organization_id, status, patient_id, patient_name, patient_phone, doctor_id, office_id, service_id, appointment_date, start_time, end_time, origin, payment_method, notes, meeting_url${modality ? ", modality" : ""}, price_snapshot, discount_amount, discount_reason, custom_fields, treatment_session_id, doctors(id, full_name, is_active), services(id, name, base_price, duration_minutes, is_active), offices(id, name), patients(${RESCHEDULE_PATIENT_COLUMNS})`;

/**
 * Carga la cita cancelada para el modo reprogramar. Nunca lanza.
 * Exige misma org y status='cancelled'.
 */
export async function loadRescheduleContext(
  supabase: SupabaseClient,
  appointmentId: string,
  organizationId: string,
  opts: { withDeposit?: boolean } = {},
): Promise<LoadRescheduleResult> {
  const run = (modality: boolean) =>
    supabase
      .from("appointments")
      .select(apptColumns(modality))
      .eq("id", appointmentId)
      .eq("organization_id", organizationId)
      .maybeSingle();

  // `modality` (mig 256) puede no existir: se repite sin ella.
  let res = await run(true);
  if (res.error) res = await run(false);
  if (res.error) return { ok: false, reason: "error", message: res.error.message };
  const a = res.data as unknown as RawAppt | null;
  if (!a) return { ok: false, reason: "not_found" };
  if (a.status !== "cancelled") return { ok: false, reason: "not_cancelled" };

  const startTime = a.start_time.slice(0, 5);
  const endTime = a.end_time.slice(0, 5);
  const priceSnapshot = a.price_snapshot != null ? Number(a.price_snapshot) : null;
  const discountAmount = Number(a.discount_amount ?? 0) || 0;
  const serviceBasePrice = a.services?.base_price != null ? Number(a.services.base_price) : null;

  let deposit: TransferableDeposit | null = null;
  if (a.patient_id && opts.withDeposit !== false) {
    try {
      const deps = await fetchTransferableDeposits(supabase, a.patient_id);
      deposit = deps.find((d) => d.appointmentId === a.id) ?? null;
    } catch {
      deposit = null;
    }
  }

  return {
    ok: true,
    ctx: {
      appointmentId: a.id,
      appointmentDate: a.appointment_date,
      startTime,
      endTime,
      durationMinutes: Math.max(0, toMinutes(endTime) - toMinutes(startTime)),
      patient: a.patients ?? null,
      patientName: a.patient_name ?? "",
      patientPhone: a.patient_phone ?? null,
      doctorId: a.doctor_id,
      doctorName: a.doctors?.full_name ?? null,
      doctorActive: a.doctors?.is_active !== false,
      serviceId: a.service_id,
      serviceName: a.services?.name ?? null,
      serviceBasePrice,
      serviceDuration: a.services?.duration_minutes ?? null,
      serviceActive: a.services?.is_active !== false,
      officeId: a.office_id,
      officeName: a.offices?.name ?? null,
      priceSnapshot,
      discountAmount,
      discountReason: a.discount_reason,
      billedAmount: appointmentBilledAmount({
        status: a.status,
        price_snapshot: priceSnapshot,
        discount_amount: discountAmount,
        services: { base_price: serviceBasePrice },
      }),
      modality: a.modality ?? null,
      meetingUrl: a.meeting_url,
      origin: a.origin,
      paymentMethod: a.payment_method,
      notes: stripSystemNoteLines(a.notes),
      customFields: a.custom_fields ?? {},
      treatmentSessionId: a.treatment_session_id,
      deposit,
    },
  };
}

/**
 * Citas canceladas de la paciente con tarjeta "Por reprogramar" abierta
 * (clinical_followups core.reschedule_pending, source_id = cita). Para la
 * franja del formulario de "Nueva cita" fuera del modo reprogramar.
 * Nunca lanza: sin la mig 273 (o sin tarjetas) devuelve [].
 */
export async function fetchPendingReschedulesForPatient(
  supabase: SupabaseClient,
  patientId: string,
  organizationId: string,
): Promise<RescheduleContext[]> {
  try {
    const { data, error } = await supabase
      .from("clinical_followups")
      .select("source_id, created_at")
      .eq("organization_id", organizationId)
      .eq("patient_id", patientId)
      .eq("rule_key", RESCHEDULE_PENDING_RULE_KEY)
      .in("status", [...RESCHEDULE_OPEN_STATUSES])
      .order("created_at", { ascending: false })
      .limit(3);
    if (error || !data) return [];
    const ids = Array.from(
      new Set(
        (data as Array<{ source_id: string | null }>)
          .map((r) => r.source_id)
          .filter((x): x is string => !!x),
      ),
    );
    const results = await Promise.all(
      ids.map((id) => loadRescheduleContext(supabase, id, organizationId, { withDeposit: false })),
    );
    return results.flatMap((r) => (r.ok ? [r.ctx] : []));
  } catch {
    return [];
  }
}
