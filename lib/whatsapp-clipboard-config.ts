// WhatsApp clipboard quick-copy — persisted in localStorage
// This allows clinic staff to quickly copy a pre-formatted message after booking
// an appointment, so they can paste it into the patient's WhatsApp chat.

const KEYS = {
  enabled: "vibeforge_wa_clipboard_enabled",
  template: "vibeforge_wa_clipboard_template",
};

export const WA_TEMPLATE_VARIABLES = [
  { key: "{{NOMBRE}}", description: "Nombre del paciente" },
  { key: "{{FECHA}}", description: "Fecha de la cita" },
  { key: "{{HORA}}", description: "Hora de la cita" },
  { key: "{{DOCTOR}}", description: "Nombre del doctor" },
  { key: "{{SERVICIO}}", description: "Servicio agendado" },
  { key: "{{CLINICA}}", description: "Nombre de la clínica" },
] as const;

export const DEFAULT_WA_TEMPLATE =
  "Hola {{NOMBRE}}, tu cita ha sido reservada para el día {{FECHA}} a las {{HORA}} con {{DOCTOR}} en {{CLINICA}}. ¡Te esperamos!";

export interface WhatsAppClipboardConfig {
  enabled: boolean;
  template: string;
}

export function loadWaClipboardConfig(): WhatsAppClipboardConfig {
  if (typeof window === "undefined") {
    return { enabled: false, template: DEFAULT_WA_TEMPLATE };
  }
  try {
    const enabled = localStorage.getItem(KEYS.enabled) === "true";
    const template = localStorage.getItem(KEYS.template) || DEFAULT_WA_TEMPLATE;
    return { enabled, template };
  } catch {
    return { enabled: false, template: DEFAULT_WA_TEMPLATE };
  }
}

export function saveWaClipboardConfig(config: Partial<WhatsAppClipboardConfig>) {
  if (typeof window === "undefined") return;
  if (config.enabled !== undefined) {
    localStorage.setItem(KEYS.enabled, String(config.enabled));
  }
  if (config.template !== undefined) {
    localStorage.setItem(KEYS.template, config.template);
  }
}

export interface AppointmentVariables {
  patientName: string;
  date: string;
  time: string;
  doctorName: string;
  serviceName: string;
  clinicName: string;
}

export function buildWhatsAppMessage(
  template: string,
  vars: AppointmentVariables
): string {
  return template
    .replace(/\{\{NOMBRE\}\}/g, vars.patientName)
    .replace(/\{\{FECHA\}\}/g, vars.date)
    .replace(/\{\{HORA\}\}/g, vars.time)
    .replace(/\{\{DOCTOR\}\}/g, vars.doctorName)
    .replace(/\{\{SERVICIO\}\}/g, vars.serviceName)
    .replace(/\{\{CLINICA\}\}/g, vars.clinicName);
}
