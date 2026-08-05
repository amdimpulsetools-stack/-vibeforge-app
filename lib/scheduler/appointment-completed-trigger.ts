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

export interface CompletedFollowupOptions {
  /**
   * Días hasta el control (1-365). `null` = el doctor desmarcó
   * "Requiere control" → no se crea el seguimiento core. Omitido = se
   * usa el default del servicio.
   */
  followup_days?: number | null;
  /** Motivo opcional escrito por el doctor. */
  followup_reason?: string;
}

export function fireAppointmentCompletedFollowupTrigger(
  appointmentId: string,
  options?: CompletedFollowupOptions
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
        body: JSON.stringify(options ?? {}),
      }
    ).catch(() => {
      // Silencioso: no afecta UX ni rompe nada.
    });
  } catch {
    // Silencioso.
  }
}
