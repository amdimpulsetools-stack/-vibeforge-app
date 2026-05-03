/**
 * Cliente fire-and-forget para disparar el endpoint que crea seguimientos
 * automáticos cuando una cita pasa a `status='completed'`.
 *
 * El endpoint vive en `/api/appointments/[id]/complete-followup-trigger`
 * y resuelve la sesión por sí mismo (no necesita auth header explícita).
 *
 * IMPORTANTE: invocar SIEMPRE *después* de que el UPDATE de la cita a
 * `completed` haya sido confirmado por la base de datos. Si se invoca
 * antes, el endpoint rechazará la cita por no encontrarla en estado
 * correcto.
 *
 * No retorna nada y nunca lanza: cualquier fallo se silencia para que
 * no afecte la UX del scheduler.
 */
export function fireAppointmentCompletedFollowupTrigger(
  appointmentId: string
): void {
  if (!appointmentId) return;
  if (typeof fetch !== "function") return;

  try {
    void fetch(
      `/api/appointments/${encodeURIComponent(
        appointmentId
      )}/complete-followup-trigger`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    ).catch(() => {
      // Silencioso: no afecta UX ni rompe nada.
    });
  } catch {
    // Silencioso.
  }
}
