// Tiny client-side helper to push appointment changes to Google Calendar.
//
// Best-effort + fire-and-forget: a failure must NEVER block or rollback the
// underlying Yenda mutation. The route always returns 200 so this never
// throws on the caller. Errors are logged in the integration row and surfaced
// in Settings → Integraciones.

export type GCalSyncAction = "upsert" | "cancel";

export function syncAppointmentToGoogle(
  appointmentId: string,
  action: GCalSyncAction
): void {
  // No await — we don't want to delay UI feedback (toasts, navigation).
  fetch("/api/integrations/google/sync-appointment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appointmentId, action }),
    keepalive: true, // survive page navigations after the call fires
  }).catch(() => {
    // Swallow; this is best-effort.
  });
}
