import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { resolveOrgTimezone, todayInTz } from "@/lib/org-time";
import { appointmentBilledAmount, type BillableAppointment } from "@/lib/patient-debt";
import { formatSoles } from "@/lib/appointments/reschedule-context";
import { renderClipboardTemplate } from "@/lib/whatsapp-clipboard-config";
import { buildRescheduleMessage } from "@/lib/followups/reschedule";

/**
 * Pre-reserva de horario (mig 274).
 *
 * Una cita con `appointments.hold_expires_at` NOT NULL es una PRE-RESERVA:
 * ocupa el horario (bloquea choques y la reserva online) mientras la paciente
 * paga. NULL = cita normal (el 100 % de las citas previas a la mig).
 *  - vigente: hold_expires_at > ahora
 *  - vencida: hold_expires_at <= ahora — v1 NO se libera sola: se pinta roja
 *    y recepción decide [Extender] o [Liberar horario].
 * Se confirma sola cuando se registra un pago clínico en la cita (trigger de
 * la mig 274 limpia hold_expires_at) o con [Confirmar sin pago].
 *
 * Todo degrada sin la mig 274: los helpers detectan la columna / RPC
 * inexistente (PGRST204 / 42703 / PGRST202) y las citas normales no cambian.
 *
 * `hold_expires_at` es un INSTANTE absoluto (timestamptz): se calcula con
 * Date.now() y se serializa con toISOString() — eso está bien para instantes.
 * Lo que se MUESTRA (hora límite, "hoy/mañana") se formatea en la zona de la
 * org (lib/org-time), nunca en la del navegador ni en UTC.
 */

export {
  PRERESERVA_DEFAULT_COLOR,
  PRERESERVA_DEFAULT_MINUTES,
  PRERESERVA_MIN_MINUTES,
  PRERESERVA_MAX_MINUTES,
  sanitizePrereservaColor,
  sanitizePrereservaMinutes,
} from "@/lib/scheduler-config";
/** Chips de plazo del formulario y del menú "Extender". */
export const PRERESERVA_DURATION_OPTIONS: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 60, label: "1 h" },
  { minutes: 120, label: "2 h" },
  { minutes: 180, label: "3 h" },
  { minutes: 1440, label: "24 h" },
];
/** Rojo de "Pre-reserva vencida" (mismo tono que los avisos de deuda). */
export const PRERESERVA_EXPIRED_COLOR = "#ef4444";

/** Etiqueta corta de un plazo en minutos: 60 → "1 h", 90 → "1 h 30 min", 1440 → "24 h". */
export function formatHoldDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// ─── Estado ─────────────────────────────────────────────────────────────

/** `hold_expires_at` de una fila (la columna no está en types/database.ts). */
export function getHoldExpiresAt(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const v = (row as { hold_expires_at?: unknown }).hold_expires_at;
  return typeof v === "string" && v ? v : null;
}

export type HoldState = "none" | "active" | "expired";

export function holdStateOf(holdExpiresAt: string | null | undefined, now: Date | number = Date.now()): HoldState {
  if (!holdExpiresAt) return "none";
  const t = new Date(holdExpiresAt).getTime();
  if (Number.isNaN(t)) return "none";
  const n = typeof now === "number" ? now : now.getTime();
  return t > n ? "active" : "expired";
}

/** Instante de vencimiento = ahora + minutos (ISO, instante absoluto). */
export function computeHoldExpiry(minutes: number, from: number = Date.now()): string {
  return new Date(from + minutes * 60_000).toISOString();
}

/** Extender: desde max(ahora, vencimiento actual) + minutos. */
export function extendHoldExpiry(current: string | null, minutes: number, now: number = Date.now()): string {
  const cur = current ? new Date(current).getTime() : NaN;
  const base = Number.isNaN(cur) ? now : Math.max(now, cur);
  return new Date(base + minutes * 60_000).toISOString();
}

// ─── Formato (zona de la org) ───────────────────────────────────────────

function hhmmInTz(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: resolveOrgTimezone(tz),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return dt.toISOString().slice(0, 10);
}

function ymdToLocalNoon(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * Hora límite de la pre-reserva en la zona de la org, relativa al día civil:
 *   mismo día  → { day: "today",    short: "15:30",              long: "15:30" }
 *   mañana     → { day: "tomorrow", short: "mañana 10:00",       long: "10:00 de mañana" }
 *   otro día   → { day: "other",    short: "jue 02/10 10:00",    long: "10:00 del jueves 02/10" }
 * `short` es para tarjetas y toasts ("vence 15:30"); `long` para la frase
 * "queda separado hasta las {{VENCE}}" del WhatsApp.
 */
export function describeHoldDeadline(
  holdExpiresAt: string,
  tz: string,
  now: Date = new Date(),
): { day: "today" | "tomorrow" | "other"; time: string; short: string; long: string } {
  const at = new Date(holdExpiresAt);
  const time = hhmmInTz(at, tz);
  const dayYmd = todayInTz(tz, at);
  const todayYmd = todayInTz(tz, now);
  if (dayYmd === todayYmd) return { day: "today", time, short: time, long: time };
  if (dayYmd === addDaysYmd(todayYmd, 1)) {
    return { day: "tomorrow", time, short: `mañana ${time}`, long: `${time} de mañana` };
  }
  const local = ymdToLocalNoon(dayYmd);
  return {
    day: "other",
    time,
    short: `${format(local, "EEE dd/MM", { locale: es })} ${time}`,
    long: `${time} del ${format(local, "EEEE dd/MM", { locale: es })}`,
  };
}

/** Tiempo restante legible: "45 min", "1 h 20 min", "1 d 3 h", "menos de 1 min". */
export function formatHoldRemaining(holdExpiresAt: string, now: number = Date.now()): string {
  const ms = new Date(holdExpiresAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "vencida";
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return "menos de 1 min";
  if (totalMin < 60) return `${totalMin} min`;
  const totalH = Math.floor(totalMin / 60);
  if (totalH < 24) {
    const m = totalMin % 60;
    return m === 0 ? `${totalH} h` : `${totalH} h ${m} min`;
  }
  const d = Math.floor(totalH / 24);
  const h = totalH % 24;
  return h === 0 ? `${d} d` : `${d} d ${h} h`;
}

/** Fecha de la cita para el WhatsApp: "jueves 2 de octubre" (fecha civil, sin zona). */
export function formatAppointmentDayLong(ymd: string): string {
  return format(ymdToLocalNoon(ymd), "EEEE d 'de' MMMM", { locale: es });
}

/**
 * MONTO del WhatsApp: total a pagar de la cita con la fórmula canónica
 * (lib/patient-debt.ts → appointmentBilledAmount, espejo del RPC). "" si 0,
 * para que la plantilla limpie la frase.
 */
export function prereservaAmountLabel(appt: BillableAppointment): string {
  const amount = appointmentBilledAmount(appt);
  return amount > 0 ? formatSoles(amount) : "";
}

// ─── Errores de esquema (mig 274 sin aplicar) ───────────────────────────

type PgErrorLike = { code?: string | null; message?: string | null } | null | undefined;

export function isMissingColumnError(err: PgErrorLike, column: string): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  const mentions = new RegExp(column, "i").test(msg);
  if (err.code === "PGRST204" || err.code === "42703") return mentions || !msg;
  return mentions && /does not exist|could not find|schema cache/i.test(msg);
}

export function isMissingFunctionError(err: PgErrorLike): boolean {
  if (!err) return false;
  if (err.code === "PGRST202" || err.code === "42883") return true;
  return /could not find the function|function .* does not exist/i.test(err.message ?? "");
}

// Soporte de la columna en ESTA sesión del navegador (null = sin probar).
// "No existe" caduca a los 5 min: una pestaña abierta antes de aplicar la
// mig 274 la descubre sola, sin recargar.
let holdColumnSupported: boolean | null = null;
let holdColumnMissingAt = 0;
const HOLD_MISSING_TTL_MS = 5 * 60_000;

export function markHoldColumnSupport(supported: boolean) {
  holdColumnSupported = supported;
  if (!supported) holdColumnMissingAt = Date.now();
}

export function holdColumnKnownMissing(): boolean {
  if (holdColumnSupported !== false) return false;
  if (Date.now() - holdColumnMissingAt > HOLD_MISSING_TTL_MS) {
    holdColumnSupported = null;
    return false;
  }
  return true;
}

/** ¿Existe appointments.hold_expires_at? Query de cero filas; cacheado por sesión. */
export async function probeHoldColumn(supabase: SupabaseClient): Promise<boolean> {
  if (holdColumnSupported === true) return true;
  if (holdColumnKnownMissing()) return false;
  const { error } = await supabase.from("appointments").select("id, hold_expires_at").limit(0);
  if (!error) {
    markHoldColumnSupport(true);
    return true;
  }
  if (isMissingColumnError(error, "hold_expires_at")) {
    markHoldColumnSupport(false);
    return false;
  }
  // Error de red / otro: no se cachea; se asume que no (no crear nada raro).
  return false;
}

// ─── Mutaciones ─────────────────────────────────────────────────────────

export type HoldMutationResult =
  | { ok: true }
  | { ok: false; unavailable: boolean; message: string };

const UNAVAILABLE_MSG =
  "La pre-reserva aún no está disponible en esta base (falta la mig 274).";

/** [Confirmar sin pago]: la pre-reserva pasa a cita normal. */
export async function confirmHold(supabase: SupabaseClient, appointmentId: string): Promise<HoldMutationResult> {
  const { data, error } = await supabase
    .from("appointments")
    .update({ hold_expires_at: null } as never)
    .eq("id", appointmentId)
    .not("hold_expires_at", "is", null)
    .select("id");
  if (error) {
    return isMissingColumnError(error, "hold_expires_at")
      ? { ok: false, unavailable: true, message: UNAVAILABLE_MSG }
      : { ok: false, unavailable: false, message: error.message };
  }
  if (!data || data.length === 0) {
    // Ya estaba confirmada (pago de otra persona, otra pestaña) o RLS.
    return { ok: false, unavailable: false, message: "Esta cita ya no es una pre-reserva." };
  }
  return { ok: true };
}

/** [Extender]: nuevo vencimiento absoluto. */
export async function extendHold(
  supabase: SupabaseClient,
  appointmentId: string,
  newExpiresAt: string,
): Promise<HoldMutationResult> {
  const { data, error } = await supabase
    .from("appointments")
    .update({ hold_expires_at: newExpiresAt } as never)
    .eq("id", appointmentId)
    .not("hold_expires_at", "is", null)
    .select("id");
  if (error) {
    return isMissingColumnError(error, "hold_expires_at")
      ? { ok: false, unavailable: true, message: UNAVAILABLE_MSG }
      : { ok: false, unavailable: false, message: error.message };
  }
  if (!data || data.length === 0) {
    return { ok: false, unavailable: false, message: "Esta cita ya no es una pre-reserva (¿ya se registró el pago?)." };
  }
  return { ok: true };
}

/**
 * [Liberar horario]: RPC appointment_release_hold (mig 274). Borra la cita —
 * no es una cancelación (no infla reportes) ni avisa a la paciente. La base
 * valida que siga siendo pre-reserva y que no tenga pagos / notas / comprobantes.
 */
export async function releaseHold(supabase: SupabaseClient, appointmentId: string): Promise<HoldMutationResult> {
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  const { data, error } = await rpc.call(supabase, "appointment_release_hold", {
    p_appointment_id: appointmentId,
  });
  if (error) {
    return isMissingFunctionError(error)
      ? { ok: false, unavailable: true, message: UNAVAILABLE_MSG }
      : { ok: false, unavailable: false, message: error.message ?? "No se pudo liberar el horario." };
  }
  const released = (data as { released?: boolean } | null)?.released;
  if (released === false) {
    return { ok: false, unavailable: false, message: "La base no liberó el horario." };
  }
  return { ok: true };
}

/** hold_expires_at actual de una cita (null = normal o columna inexistente). */
export async function fetchHoldExpiresAt(supabase: SupabaseClient, appointmentId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id, hold_expires_at")
    .eq("id", appointmentId)
    .maybeSingle();
  if (error || !data) return null;
  return getHoldExpiresAt(data);
}

/**
 * Pre-reservas VENCIDAS de la org (chip rojo de la agenda). Query liviana:
 * solo el conteo + la más antigua (para saltar a su día). Nunca lanza:
 * sin la mig 274 devuelve null.
 */
export async function fetchExpiredHolds(
  supabase: SupabaseClient,
  organizationId: string,
  now: number = Date.now(),
): Promise<{ count: number; oldest: { id: string; appointment_date: string } | null } | null> {
  if (holdColumnSupported === false) return null;
  const { data, count, error } = await supabase
    .from("appointments")
    .select("id, appointment_date", { count: "exact" })
    .eq("organization_id", organizationId)
    .not("hold_expires_at", "is", null)
    .lte("hold_expires_at", new Date(now).toISOString())
    .in("status", ["scheduled", "confirmed"])
    .order("hold_expires_at", { ascending: true })
    .limit(1);
  if (error) {
    if (isMissingColumnError(error, "hold_expires_at")) holdColumnSupported = false;
    return null;
  }
  const first = (data?.[0] as { id: string; appointment_date: string } | undefined) ?? null;
  return { count: count ?? 0, oldest: first };
}

// ─── WhatsApp ───────────────────────────────────────────────────────────

export interface PrereservaMessageInput {
  patientName: string;
  clinicName: string;
  serviceName: string | null;
  doctorName: string | null;
  appointmentDate: string; // yyyy-MM-dd
  startTime: string; // HH:MM[:SS]
  holdExpiresAt: string;
  timezone: string;
  /** Ya formateado ("S/ 150"), "" si no aplica. */
  amountLabel: string;
}

/** Mensaje de pre-reserva desde la plantilla editable 'prereserva'. */
export async function renderPrereservaMessage(input: PrereservaMessageInput): Promise<string> {
  const deadline = describeHoldDeadline(input.holdExpiresAt, input.timezone);
  return renderClipboardTemplate("prereserva", {
    NOMBRE: input.patientName,
    CLINICA: input.clinicName,
    SERVICIO: input.serviceName ?? "",
    DOCTOR: input.doctorName ?? "",
    FECHA: formatAppointmentDayLong(input.appointmentDate),
    HORA: input.startTime.slice(0, 5),
    VENCE: deadline.long,
    MONTO: input.amountLabel,
  });
}

/**
 * Aviso de cancelación "Reprogramará" desde la plantilla editable
 * 'reschedule_notice'. Si la plantilla falla, cae al texto fijo de siempre.
 */
export async function renderRescheduleNoticeMessage(input: {
  patientName: string;
  clinicName: string;
  serviceName: string | null;
  appointmentDate: string; // yyyy-MM-dd
  startTime: string;
}): Promise<string> {
  const [, m, d] = input.appointmentDate.split("-");
  const ddmm = d && m ? `${d}/${m}` : input.appointmentDate;
  const hora = input.startTime.slice(0, 5);
  try {
    return await renderClipboardTemplate("reschedule_notice", {
      NOMBRE: input.patientName,
      CLINICA: input.clinicName,
      SERVICIO: input.serviceName ?? "",
      FECHA: ddmm,
      HORA: hora,
    });
  } catch {
    return buildRescheduleMessage({
      kind: "aviso_cancelacion",
      patientName: input.patientName,
      clinicName: input.clinicName,
      serviceName: input.serviceName,
      dateLabel: `${ddmm} a las ${hora}`,
    });
  }
}

/** Abre wa.me con el mensaje (llamar SINCRÓNICAMENTE desde el clic). */
export function openWhatsApp(waPhone: string | null, message: string) {
  const url = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
