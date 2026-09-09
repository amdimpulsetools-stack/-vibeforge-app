/**
 * Modalidad de una cita (mig 256) — FUENTE ÚNICA de lectura.
 *
 * Antes de la mig 256 la app deducía "virtual" de que la cita tuviera
 * `meeting_url`. Con un servicio de modalidad "Ambos" el formulario
 * rellenaba solo el link por defecto del doctor, así que toda cita salía
 * con camarita aunque fuera presencial.
 *
 * Regla (decisión del founder, 9-sep-2026):
 *   - `appointments.modality` presente → manda.
 *   - NULL (cita anterior a la migración) → se deduce como siempre:
 *     meeting_url con contenido ⇒ virtual, si no ⇒ presencial.
 *
 * Nadie más debe mirar `meeting_url` para decidir si una cita es virtual:
 * tarjetas, sidebar, historial, notificaciones (plantilla virtual) y reserva
 * online pasan por aquí. Sirve en cliente y servidor (sin dependencias).
 */

export type AppointmentModality = "in_person" | "virtual";

export type ServiceModality = "in_person" | "virtual" | "both";

export interface ModalityLike {
  modality?: string | null;
  meeting_url?: string | null;
}

export function resolveAppointmentModality(appt: ModalityLike | null | undefined): AppointmentModality {
  if (!appt) return "in_person";
  if (appt.modality === "virtual" || appt.modality === "in_person") return appt.modality;
  return appt.meeting_url && appt.meeting_url.trim() !== "" ? "virtual" : "in_person";
}

export function isVirtualAppointment(appt: ModalityLike | null | undefined): boolean {
  return resolveAppointmentModality(appt) === "virtual";
}

/**
 * Qué modalidad impone el servicio: fija para presencial/virtual, y `null`
 * cuando es "Ambos" (hay que preguntar en la cita).
 */
export function modalityImposedByService(serviceModality: string | null | undefined): AppointmentModality | null {
  if (serviceModality === "virtual") return "virtual";
  if (serviceModality === "both") return null;
  return "in_person";
}

/** ¿El servicio deja elegir modalidad en la cita? */
export function serviceAsksModality(serviceModality: string | null | undefined): boolean {
  return serviceModality === "both";
}

export const MODALITY_LABELS: Record<AppointmentModality, string> = {
  in_person: "Presencial",
  virtual: "Virtual",
};

/**
 * Nombre a mostrar del servicio en tarjetas y listas: "Primera consulta de
 * fertilidad · Virtual" cuando la cita es virtual; el nombre tal cual si es
 * presencial. Solo visual: el catálogo no cambia.
 */
export function serviceDisplayName(
  serviceName: string | null | undefined,
  appt: ModalityLike | null | undefined,
  separator = " · "
): string {
  const base = serviceName ?? "—";
  return isVirtualAppointment(appt) ? `${base}${separator}${MODALITY_LABELS.virtual}` : base;
}
