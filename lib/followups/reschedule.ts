/**
 * "Por reprogramar" (mig 273): cita cancelada con la paciente pendiente de
 * volver a agendar. Vive como seguimiento en la bandeja existente; lo crea
 * y lo cierra la base de datos (triggers sobre `appointments`).
 */
export const RESCHEDULE_PENDING_RULE_KEY = "core.reschedule_pending";

/** Estados en los que un seguimiento sigue abierto (mismos que la bandeja). */
export const RESCHEDULE_OPEN_STATUSES = ["pendiente", "contactado", "pospuesto"] as const;

/** Deep-link de la burbuja de la agenda a la bandeja ya filtrada. */
export const RESCHEDULE_INBOX_HREF = "/scheduler/follow-ups?tipo=por-reprogramar";
export const RESCHEDULE_INBOX_PARAM = { key: "tipo", value: "por-reprogramar" } as const;
