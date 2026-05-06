// WhatsApp clipboard quick-copy
//
// As of migration 139, the TEMPLATE TEXT for each kind lives in Supabase
// (table `org_whatsapp_clipboard_templates`) and is shared across all
// devices of an organization. The per-device "enabled" toggle (whether
// the post-cita modal pops up after booking) stays in localStorage —
// it's a per-user/per-device UX preference, not org config.
//
// Three kinds of templates are supported:
//   - post_appointment              → general, all orgs
//   - second_consultation_followup  → fertility_basic addon
//   - budget_followup               → fertility_basic addon
//
// Backward-compatible exports for the existing post-cita flow are kept:
//   - DEFAULT_WA_TEMPLATE
//   - WA_TEMPLATE_VARIABLES
//   - WhatsAppClipboardConfig
//   - AppointmentVariables
//   - loadWaClipboardConfig() / saveWaClipboardConfig()
//   - buildWhatsAppMessage()
//
// New API (multi-kind):
//   - ClipboardTemplateKind
//   - DEFAULT_TEMPLATES, TEMPLATE_VARIABLES
//   - loadTemplateFromDb(kind), saveTemplateToDb(kind, template)
//   - SecondConsultationVars, BudgetFollowupVars
//   - buildMessage(kind, template, vars)

// ─────────────────────────────────────────────────────────────────────
// localStorage keys (per-device preferences only)
// ─────────────────────────────────────────────────────────────────────
const KEYS = {
  enabled: "vibeforge_wa_clipboard_enabled",
  // legacy: previously held the post_appointment template. We keep the
  // key around as a read-only fallback if the API is unreachable, but
  // saves now go to the API.
  template: "vibeforge_wa_clipboard_template",
};

// ─────────────────────────────────────────────────────────────────────
// Kinds, defaults, and variable catalogues
// ─────────────────────────────────────────────────────────────────────
export type ClipboardTemplateKind =
  | "post_appointment"
  | "second_consultation_followup"
  | "budget_followup";

export const CLIPBOARD_TEMPLATE_KINDS: readonly ClipboardTemplateKind[] = [
  "post_appointment",
  "second_consultation_followup",
  "budget_followup",
] as const;

export const DEFAULT_TEMPLATES: Record<ClipboardTemplateKind, string> = {
  post_appointment:
    "Hola {{NOMBRE}}, tu cita ha sido reservada para el día {{FECHA}} a las {{HORA}} con {{DOCTOR}} en {{CLINICA}}.\n\nDirección: {{DIRECCION}}.\n¡Te esperamos!",
  second_consultation_followup:
    "Hola {{NOMBRE}}, somos de {{CLINICA}} 👋\n\nQueremos saber cómo te sientes después de tu primera consulta con {{DOCTOR}}. ¿Has podido revisar las indicaciones? Estamos a tu disposición para coordinar tu segunda consulta cuando estés lista.\n\n¿Te gustaría agendar?",
  budget_followup:
    "Hola {{NOMBRE}} 👋\n\nTe escribimos de {{CLINICA}} para hacer seguimiento al presupuesto de {{TRATAMIENTO}} que te enviamos. ¿Has tenido oportunidad de revisarlo? Cualquier duda con gusto te la resolvemos.\n\nQuedamos atentos a tus comentarios 💚",
};

/** Legacy alias — the original single-template default. */
export const DEFAULT_WA_TEMPLATE = DEFAULT_TEMPLATES.post_appointment;

interface VariableDescriptor {
  key: string;
  description: string;
}

const COMMON_VARS: VariableDescriptor[] = [
  { key: "{{NOMBRE}}", description: "Nombre del paciente" },
  { key: "{{CLINICA}}", description: "Nombre de la clínica" },
];

export const TEMPLATE_VARIABLES: Record<ClipboardTemplateKind, VariableDescriptor[]> = {
  post_appointment: [
    ...COMMON_VARS,
    { key: "{{FECHA}}", description: "Fecha de la cita" },
    { key: "{{HORA}}", description: "Hora de la cita" },
    { key: "{{DOCTOR}}", description: "Nombre del doctor" },
    { key: "{{SERVICIO}}", description: "Servicio agendado" },
    { key: "{{DIRECCION}}", description: "Dirección de la clínica" },
  ],
  second_consultation_followup: [
    ...COMMON_VARS,
    { key: "{{DOCTOR}}", description: "Nombre del doctor" },
  ],
  budget_followup: [
    ...COMMON_VARS,
    { key: "{{TRATAMIENTO}}", description: "Tipo de tratamiento (ej. FIV, IIU)" },
  ],
};

/** Legacy export — the post_appointment variable catalogue. */
export const WA_TEMPLATE_VARIABLES = TEMPLATE_VARIABLES.post_appointment;

// ─────────────────────────────────────────────────────────────────────
// Variable types per kind
// ─────────────────────────────────────────────────────────────────────
export interface CommonVars {
  patientName: string;
  clinicName: string;
}

export interface AppointmentVariables extends CommonVars {
  date: string;
  time: string;
  doctorName: string;
  serviceName: string;
  clinicAddress: string;
}

export interface SecondConsultationVars extends CommonVars {
  doctorName: string;
}

export interface BudgetFollowupVars extends CommonVars {
  /** Display label, e.g. "FIV (Fertilización In Vitro)". */
  treatmentType: string;
}

// ─────────────────────────────────────────────────────────────────────
// Legacy localStorage config (per-device "enabled" + cached template)
// ─────────────────────────────────────────────────────────────────────
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

/**
 * Saves the per-device "enabled" toggle to localStorage. The `template`
 * field is also written to localStorage as a stale-tolerant fallback,
 * but callers should prefer `saveTemplateToDb('post_appointment', …)`.
 */
export function saveWaClipboardConfig(config: Partial<WhatsAppClipboardConfig>) {
  if (typeof window === "undefined") return;
  if (config.enabled !== undefined) {
    localStorage.setItem(KEYS.enabled, String(config.enabled));
  }
  if (config.template !== undefined) {
    localStorage.setItem(KEYS.template, config.template);
  }
}

// ─────────────────────────────────────────────────────────────────────
// API helpers — multi-kind templates persisted per-org in Supabase
// ─────────────────────────────────────────────────────────────────────
interface ApiTemplatesResponse {
  templates: Array<{ kind: ClipboardTemplateKind; template: string }>;
}

/**
 * Loads a single template kind from the API. Falls back to the in-code
 * default if the request fails (offline / not authenticated). Browser-only.
 */
export async function loadTemplateFromDb(
  kind: ClipboardTemplateKind
): Promise<string> {
  if (typeof window === "undefined") return DEFAULT_TEMPLATES[kind];
  try {
    const res = await fetch("/api/whatsapp-clipboard-templates", {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return DEFAULT_TEMPLATES[kind];
    const json = (await res.json()) as ApiTemplatesResponse;
    const found = json.templates?.find((t) => t.kind === kind);
    return found?.template ?? DEFAULT_TEMPLATES[kind];
  } catch {
    return DEFAULT_TEMPLATES[kind];
  }
}

/**
 * Persists a template for one kind via the API. Admin/owner only on the
 * server side; callers should surface the error toast on rejection.
 */
export async function saveTemplateToDb(
  kind: ClipboardTemplateKind,
  template: string
): Promise<void> {
  const res = await fetch("/api/whatsapp-clipboard-templates", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, template }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(
      typeof (detail as { error?: string })?.error === "string"
        ? (detail as { error: string }).error
        : `Request failed (${res.status})`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Message builders
// ─────────────────────────────────────────────────────────────────────
function applyCommon(template: string, vars: CommonVars): string {
  return template
    .replace(/\{\{NOMBRE\}\}/g, vars.patientName)
    .replace(/\{\{CLINICA\}\}/g, vars.clinicName);
}

/** Legacy builder — kept for the post-cita modal. */
export function buildWhatsAppMessage(
  template: string,
  vars: AppointmentVariables
): string {
  return applyCommon(template, vars)
    .replace(/\{\{FECHA\}\}/g, vars.date)
    .replace(/\{\{HORA\}\}/g, vars.time)
    .replace(/\{\{DOCTOR\}\}/g, vars.doctorName)
    .replace(/\{\{SERVICIO\}\}/g, vars.serviceName)
    .replace(/\{\{DIRECCION\}\}/g, vars.clinicAddress);
}

function buildSecondConsultation(
  template: string,
  vars: SecondConsultationVars
): string {
  return applyCommon(template, vars).replace(/\{\{DOCTOR\}\}/g, vars.doctorName);
}

function buildBudgetFollowup(template: string, vars: BudgetFollowupVars): string {
  return applyCommon(template, vars).replace(
    /\{\{TRATAMIENTO\}\}/g,
    vars.treatmentType
  );
}

// Type-narrowed builder. Overloads guarantee the right vars per kind.
export function buildMessage(
  kind: "post_appointment",
  template: string,
  vars: AppointmentVariables
): string;
export function buildMessage(
  kind: "second_consultation_followup",
  template: string,
  vars: SecondConsultationVars
): string;
export function buildMessage(
  kind: "budget_followup",
  template: string,
  vars: BudgetFollowupVars
): string;
export function buildMessage(
  kind: ClipboardTemplateKind,
  template: string,
  vars: AppointmentVariables | SecondConsultationVars | BudgetFollowupVars
): string {
  switch (kind) {
    case "post_appointment":
      return buildWhatsAppMessage(template, vars as AppointmentVariables);
    case "second_consultation_followup":
      return buildSecondConsultation(template, vars as SecondConsultationVars);
    case "budget_followup":
      return buildBudgetFollowup(template, vars as BudgetFollowupVars);
  }
}
