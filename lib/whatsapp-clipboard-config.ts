// WhatsApp clipboard quick-copy
//
// As of migration 139, the TEMPLATE TEXT for each kind lives in Supabase
// (table `org_whatsapp_clipboard_templates`) and is shared across all
// devices of an organization. The per-device "enabled" toggle (whether
// the post-cita modal pops up after booking) stays in localStorage —
// it's a per-user/per-device UX preference, not org config.
//
// Kinds of templates supported:
//   - post_appointment              → general, all orgs
//   - second_consultation_followup  → fertility_basic addon
//   - budget_followup               → fertility_basic addon
//   - reschedule_notice             → aviso al cancelar "Reprogramará" (mig 274)
//   - reschedule_coordinate         → coordinar desde la bandeja "Por reprogramar" (mig 274)
//   - prereserva                    → horario pre-reservado a la espera del pago (mig 274)
//
// Los 3 últimos necesitan la mig 274 (amplía el CHECK de `kind`) para
// GUARDARSE; leerlos funciona siempre (sin fila → default de fábrica).
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
//   - renderClipboardTemplate(kind, vars)  → carga (cacheada) + build

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
  | "budget_followup"
  | "reschedule_notice"
  | "reschedule_coordinate"
  | "prereserva";

export const CLIPBOARD_TEMPLATE_KINDS: readonly ClipboardTemplateKind[] = [
  "post_appointment",
  "second_consultation_followup",
  "budget_followup",
  "reschedule_notice",
  "reschedule_coordinate",
  "prereserva",
] as const;

/**
 * Kinds que llegaron con la mig 274. Si la base aún no la tiene, guardarlos
 * falla por el CHECK de `org_whatsapp_clipboard_templates.kind` (la API
 * responde 409); leerlos devuelve el default.
 */
export const MIG_274_CLIPBOARD_KINDS: readonly ClipboardTemplateKind[] = [
  "reschedule_notice",
  "reschedule_coordinate",
  "prereserva",
] as const;

export const DEFAULT_TEMPLATES: Record<ClipboardTemplateKind, string> = {
  post_appointment:
    "Hola {{NOMBRE}}, tu cita ha sido reservada para el día {{FECHA}} a las {{HORA}} con {{DOCTOR}} en {{CLINICA}}.\n\nDirección: {{DIRECCION}}.\n¡Te esperamos!",
  second_consultation_followup:
    "Hola {{NOMBRE}}, somos de {{CLINICA}} 👋\n\nQueremos saber cómo te sientes después de tu primera consulta con {{DOCTOR}}. ¿Has podido revisar las indicaciones? Estamos a tu disposición para coordinar tu segunda consulta cuando estés lista.\n\n¿Te gustaría agendar?",
  budget_followup:
    "Hola {{NOMBRE}} 👋\n\nTe escribimos de {{CLINICA}} para hacer seguimiento al presupuesto de {{TRATAMIENTO}} que te enviamos. ¿Has tenido oportunidad de revisarlo? Cualquier duda con gusto te la resolvemos.\n\nQuedamos atentos a tus comentarios 💚",
  // Mismo texto que tenía buildRescheduleMessage (lib/followups/reschedule.ts),
  // que ahora se construye desde estos defaults. Las variables vacías se
  // limpian junto con su conector ("de", "del", "a las"…), así que sin
  // servicio queda "tu cita del 12/10 a las 10:30".
  reschedule_notice:
    "Hola {{NOMBRE}} 👋\n\nTe escribimos de {{CLINICA}}: tuvimos que cancelar tu cita de {{SERVICIO}} del {{FECHA}} a las {{HORA}}. Queremos darte una nueva fecha. ¿Qué día y horario te acomoda?\n\nQuedamos atentos.",
  reschedule_coordinate:
    "Hola {{NOMBRE}} 👋\n\nTe escribimos de {{CLINICA}} para reprogramar tu cita de {{SERVICIO}} del {{FECHA}} a las {{HORA}}. ¿Qué día y horario te acomoda?\n\nQuedamos atentos.",
  prereserva:
    "Hola {{NOMBRE}} 👋\n\nTu horario del {{FECHA}} a las {{HORA}} ({{SERVICIO}}) en {{CLINICA}} queda separado hasta las {{VENCE}}. Para confirmarlo, envía tu pago de {{MONTO}}.\n\n¡Gracias!",
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
  reschedule_notice: [
    ...COMMON_VARS,
    { key: "{{SERVICIO}}", description: "Servicio de la cita cancelada" },
    { key: "{{FECHA}}", description: "Fecha de la cita cancelada (ej. 12/10)" },
    { key: "{{HORA}}", description: "Hora de la cita cancelada (ej. 10:30)" },
  ],
  reschedule_coordinate: [
    ...COMMON_VARS,
    { key: "{{SERVICIO}}", description: "Servicio de la cita cancelada" },
    { key: "{{FECHA}}", description: "Fecha de la cita cancelada (ej. 12/10)" },
    { key: "{{HORA}}", description: "Hora de la cita cancelada (ej. 10:30)" },
  ],
  prereserva: [
    ...COMMON_VARS,
    { key: "{{SERVICIO}}", description: "Servicio pre-reservado" },
    { key: "{{DOCTOR}}", description: "Nombre del doctor" },
    { key: "{{FECHA}}", description: "Día del horario (ej. jueves 12/10)" },
    { key: "{{HORA}}", description: "Hora del horario (ej. 10:00)" },
    { key: "{{VENCE}}", description: "Hora límite de la pre-reserva (ej. 15:30)" },
    { key: "{{MONTO}}", description: "Monto a pagar (ej. S/ 150.00)" },
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

/**
 * Kinds de la mig 274: las claves son las mismas variables de la plantilla
 * (sin llaves). Un valor vacío / null / undefined se limpia junto con su
 * conector ("de", "del", "a las", "con", "en"…) o sus paréntesis, sin dejar
 * "()" ni dobles espacios.
 */
export interface RescheduleTemplateVars {
  NOMBRE: string;
  CLINICA: string;
  SERVICIO?: string | null;
  FECHA?: string | null; // "12/10"
  HORA?: string | null; // "10:30"
}

export interface PrereservaTemplateVars {
  NOMBRE: string;
  CLINICA: string;
  SERVICIO?: string | null;
  DOCTOR?: string | null;
  FECHA: string; // "jueves 12/10"
  HORA: string; // "10:00"
  VENCE: string; // "15:30" / "mañana 10:00"
  MONTO?: string | null; // "S/ 150.00"
}

/** Variables que acepta cada kind (buildMessage / renderClipboardTemplate). */
export interface ClipboardTemplateVars {
  post_appointment: AppointmentVariables;
  second_consultation_followup: SecondConsultationVars;
  budget_followup: BudgetFollowupVars;
  reschedule_notice: RescheduleTemplateVars;
  reschedule_coordinate: RescheduleTemplateVars;
  prereserva: PrereservaTemplateVars;
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
  kind: ClipboardTemplateKind,
  /**
   * Qué usar si la petición falla (offline / sesión caída). Por defecto la
   * plantilla de fábrica, pero quien tenga una copia local más fiel —el
   * modal post-cita cachea la última vista— debe pasarla aquí: caer al
   * texto de fábrica cuando la clínica ya personalizó el suyo se ve como
   * si la app hubiera ignorado su configuración.
   */
  fallback?: string
): Promise<string> {
  const safeFallback = fallback ?? DEFAULT_TEMPLATES[kind];
  if (typeof window === "undefined") return safeFallback;
  try {
    const res = await fetch("/api/whatsapp-clipboard-templates", {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return safeFallback;
    const json = (await res.json()) as ApiTemplatesResponse;
    const found = json.templates?.find((t) => t.kind === kind);
    return found?.template ?? DEFAULT_TEMPLATES[kind];
  } catch {
    return safeFallback;
  }
}

/**
 * Loads every kind in ONE request (the API returns all of them). Kinds the
 * response doesn't include — or every kind, if the request fails — fall
 * back to the in-code default. Browser-only.
 */
export async function loadAllTemplatesFromDb(): Promise<
  Record<ClipboardTemplateKind, string>
> {
  const out = { ...DEFAULT_TEMPLATES };
  const fetched = await fetchTemplatesMap();
  if (fetched) {
    for (const [k, t] of fetched) out[k] = t;
  }
  return out;
}

/** Error de guardado con el status HTTP (409 = falta la mig 274). */
export class ClipboardTemplateSaveError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ClipboardTemplateSaveError";
    this.status = status;
  }
}

/**
 * Persists a template for one kind via the API. Admin/owner only on the
 * server side; callers should surface the error toast on rejection.
 * Throws `ClipboardTemplateSaveError` (status 409 when the DB still lacks
 * mig 274 for the new kinds).
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
    throw new ClipboardTemplateSaveError(
      typeof (detail as { error?: string })?.error === "string"
        ? (detail as { error: string }).error
        : `Request failed (${res.status})`,
      res.status
    );
  }
  invalidateClipboardTemplateCache();
}

// ─────────────────────────────────────────────────────────────────────
// Cached load for renderClipboardTemplate
// ─────────────────────────────────────────────────────────────────────
// One GET returns every kind, so the cache holds the whole map. The
// promise itself is cached so concurrent callers dedupe to one fetch. A
// failed load is NOT cached (the next call retries). TTL keeps edits made
// on another device from going stale for long.
const TEMPLATE_CACHE_TTL_MS = 60_000;
let templatesCache: {
  at: number;
  promise: Promise<Map<ClipboardTemplateKind, string> | null>;
} | null = null;

async function fetchTemplatesMap(): Promise<Map<
  ClipboardTemplateKind,
  string
> | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/whatsapp-clipboard-templates", {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as ApiTemplatesResponse;
    const map = new Map<ClipboardTemplateKind, string>();
    for (const t of json.templates ?? []) {
      if (
        (CLIPBOARD_TEMPLATE_KINDS as readonly string[]).includes(t.kind) &&
        typeof t.template === "string" &&
        t.template.trim().length > 0
      ) {
        map.set(t.kind, t.template);
      }
    }
    return map;
  } catch {
    return null;
  }
}

function getCachedTemplatesMap(): Promise<Map<
  ClipboardTemplateKind,
  string
> | null> {
  const now = Date.now();
  if (templatesCache && now - templatesCache.at < TEMPLATE_CACHE_TTL_MS) {
    return templatesCache.promise;
  }
  const promise = fetchTemplatesMap().then((map) => {
    if (!map && templatesCache?.promise === promise) templatesCache = null;
    return map;
  });
  templatesCache = { at: now, promise };
  return promise;
}

/** Forget the cached templates (called after a successful save). */
export function invalidateClipboardTemplateCache(): void {
  templatesCache = null;
}

/**
 * Calienta la caché de plantillas al abrir el formulario de cita, para que
 * `renderClipboardTemplate` sea instantáneo en el momento de guardar.
 * Incidente 02-oct-2026: el mensaje de la pre-reserva se armaba DESPUÉS de
 * crear la cita y esa petición de red dejaba el formulario abierto unos
 * segundos con "Guardar" activo; un segundo clic duplicaba la cita.
 * Nunca lanza: si la carga falla, el render usa el texto por defecto.
 */
export function prefetchClipboardTemplates(): void {
  if (typeof window === "undefined") return;
  void getCachedTemplatesMap().catch(() => null);
}

/**
 * Loads the org's template for `kind` (cached, one request for all kinds)
 * and fills it with `vars`. Never throws: if the load fails, or the org
 * never customised the kind, it uses the in-code default.
 *
 *   await renderClipboardTemplate("reschedule_coordinate", {
 *     NOMBRE, CLINICA, SERVICIO, FECHA, HORA,
 *   });
 */
export async function renderClipboardTemplate<K extends ClipboardTemplateKind>(
  kind: K,
  vars: ClipboardTemplateVars[K]
): Promise<string> {
  let template = DEFAULT_TEMPLATES[kind];
  try {
    const map = await getCachedTemplatesMap();
    template = map?.get(kind) ?? DEFAULT_TEMPLATES[kind];
  } catch {
    template = DEFAULT_TEMPLATES[kind];
  }
  return buildMessageForKind(kind, template, vars);
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Connectors removed together with an EMPTY variable, so "tu cita de
 * {{SERVICIO}} del {{FECHA}}" without service reads "tu cita del 12/10".
 * Longer alternatives first.
 */
const EMPTY_VAR_CONNECTORS =
  "de la|de los|de las|del|de|con el|con la|con|a las|a la|en el|en la|en|para|por";

/**
 * Fills `{{KEY}}` placeholders (kinds from mig 274). Empty values are
 * removed along with their connector word or surrounding parentheses, and
 * the result is tidied: no "()", no double spaces, no space before
 * punctuation, no trailing spaces per line. Only used by the new kinds —
 * the legacy builders keep their exact behaviour.
 */
function fillTemplate(
  template: string,
  values: Record<string, string | null | undefined>
): string {
  let out = template;
  for (const [key, raw] of Object.entries(values)) {
    const value = (raw ?? "").trim();
    const ph = `\\{\\{${escapeRegExp(key)}\\}\\}`;
    if (!value) {
      out = out
        .replace(new RegExp(`[ \\t]*\\([ \\t]*${ph}[ \\t]*\\)`, "g"), "")
        .replace(
          new RegExp(`[ \\t]+(?:${EMPTY_VAR_CONNECTORS})[ \\t]+${ph}`, "gi"),
          ""
        )
        .replace(new RegExp(ph, "g"), "");
    } else {
      out = out.replace(new RegExp(ph, "g"), () => value);
    }
  }
  return out
    .replace(/\([ \t]*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?)])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+/gm, "");
}

function buildRescheduleTemplate(
  template: string,
  vars: RescheduleTemplateVars
): string {
  return fillTemplate(template, {
    NOMBRE: vars.NOMBRE,
    CLINICA: vars.CLINICA,
    SERVICIO: vars.SERVICIO,
    FECHA: vars.FECHA,
    HORA: vars.HORA,
  });
}

function buildPrereserva(template: string, vars: PrereservaTemplateVars): string {
  return fillTemplate(template, {
    NOMBRE: vars.NOMBRE,
    CLINICA: vars.CLINICA,
    SERVICIO: vars.SERVICIO,
    DOCTOR: vars.DOCTOR,
    FECHA: vars.FECHA,
    HORA: vars.HORA,
    VENCE: vars.VENCE,
    MONTO: vars.MONTO,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Phone normalization for wa.me links
// ─────────────────────────────────────────────────────────────────────
/**
 * Normalizes a raw phone string into the digits-only form that wa.me
 * expects (no `+`, no spaces, no parens). Assumes Peru (+51) when the
 * input has no country code.
 *
 * Examples:
 *   "+51 987 654 321" → "51987654321"
 *   "987654321"       → "51987654321"
 *   "(01) 234-5678"   → null  // less than 9 digits after stripping
 *   ""                → null
 *
 * Returns null when the input is empty/invalid (fewer than 9 digits).
 */
export function normalizePhoneForWa(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 9) return null;
  // If the original had a leading `+`, the digits already include the
  // country code. Otherwise we assume Peru and prepend "51" — but only
  // when the digits don't already look like they include it.
  if (hadPlus) return digits;
  if (digits.startsWith("51") && digits.length >= 11) return digits;
  return `51${digits}`;
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
  kind: "reschedule_notice" | "reschedule_coordinate",
  template: string,
  vars: RescheduleTemplateVars
): string;
export function buildMessage(
  kind: "prereserva",
  template: string,
  vars: PrereservaTemplateVars
): string;
export function buildMessage(
  kind: ClipboardTemplateKind,
  template: string,
  vars: ClipboardTemplateVars[ClipboardTemplateKind]
): string {
  return buildMessageForKind(kind, template, vars);
}

function buildMessageForKind<K extends ClipboardTemplateKind>(
  kind: K,
  template: string,
  vars: ClipboardTemplateVars[K]
): string {
  switch (kind) {
    case "post_appointment":
      return buildWhatsAppMessage(template, vars as AppointmentVariables);
    case "second_consultation_followup":
      return buildSecondConsultation(template, vars as SecondConsultationVars);
    case "budget_followup":
      return buildBudgetFollowup(template, vars as BudgetFollowupVars);
    case "reschedule_notice":
    case "reschedule_coordinate":
      return buildRescheduleTemplate(template, vars as RescheduleTemplateVars);
    case "prereserva":
      return buildPrereserva(template, vars as PrereservaTemplateVars);
    default:
      return template;
  }
}
