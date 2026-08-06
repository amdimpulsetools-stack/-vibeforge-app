"use client";

/**
 * Disparador de notificaciones en vivo desde componentes de cliente.
 *
 * Desde la mig 192 el navegador no puede insertar en `notifications` (RLS lo
 * cierra), así que la emisión pasa por `/api/live-notifications/emit`, que
 * reconstruye el texto server-side a partir de la entidad.
 *
 * Fire-and-forget: nunca lanza. Una notificación que no sale no puede romper
 * el flujo que la originó (guardar la cita, registrar el pago).
 */

export type ClientEmitPayload =
  | { event: "appointment_created"; appointment_id: string }
  | { event: "appointment_cancelled"; appointment_id: string }
  | { event: "appointment_no_show"; appointment_id: string }
  | { event: "payment_registered"; payment_id: string }
  | { event: "patient_created"; patient_id: string };

export function emitLiveNotification(payload: ClientEmitPayload): void {
  void fetch("/api/live-notifications/emit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => {
    console.error("[live-notifications] emit falló:", err);
  });
}
