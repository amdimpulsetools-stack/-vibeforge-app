import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotification } from "@/lib/send-notification";
import { syncAppointmentToGoogle } from "@/lib/google-calendar-client";
import {
  getHoldExpiresAt,
  holdColumnKnownMissing,
  isMissingColumnError,
  markHoldColumnSupport,
} from "@/lib/appointments/prereserva";

/**
 * Pre-reserva confirmada por un COBRO (mig 274): el trigger de la base
 * limpia `hold_expires_at` al registrar un pago clínico en la cita; aquí
 * solo se envía lo que se omitió al pre-reservar (correo de confirmación
 * y alta en Google Calendar).
 *
 * Para no mandar el correo dos veces (otra persona ya la confirmó, o un
 * error de lectura) se compara el estado REAL antes y después del cobro:
 * solo una transición pre-reserva → confirmada dispara el envío, y ante
 * cualquier duda ("unknown") no se envía nada.
 */
export type HoldReadState = "held" | "normal" | "unknown";

export async function readHoldState(
  supabase: SupabaseClient,
  appointmentId: string | null | undefined,
): Promise<HoldReadState> {
  if (!appointmentId) return "normal";
  // Sin la mig 274 no hay pre-reservas: ni una consulta de más.
  if (holdColumnKnownMissing()) return "normal";
  const { data, error } = await supabase
    .from("appointments")
    .select("id, hold_expires_at")
    .eq("id", appointmentId)
    .maybeSingle();
  if (error && isMissingColumnError(error, "hold_expires_at")) {
    markHoldColumnSupport(false); // una sola vez por sesión
    return "normal";
  }
  if (error || !data) return "unknown";
  return getHoldExpiresAt(data) ? "held" : "normal";
}

/** Llamar DESPUÉS de registrar el cobro con el estado leído ANTES. */
export async function notifyIfHoldConfirmedByPayment(
  supabase: SupabaseClient,
  appointmentId: string | null | undefined,
  before: HoldReadState,
): Promise<boolean> {
  if (!appointmentId || before !== "held") return false;
  const after = await readHoldState(supabase, appointmentId);
  if (after !== "normal") return false;
  sendNotification({ type: "appointment_confirmation", appointment_id: appointmentId });
  syncAppointmentToGoogle(appointmentId, "upsert");
  return true;
}
