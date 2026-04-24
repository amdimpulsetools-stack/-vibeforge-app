// Builds the Google Calendar event description based on the org's
// `description_fields` configuration. Base fields (doctor, office, notes)
// are always present. Everything else is toggleable per org.
//
// Schema of inputs is intentionally wide — this file is a pure mapper, it
// doesn't load data itself. The caller (sync-appointment route) fetches
// whatever it needs and hands it over.

export const DESCRIPTION_FIELD_KEYS = [
  "patient_phone",
  "patient_email",
  "patient_dni",
  "patient_age",
  "price",
  "payment_status",
  "payment_method",
  "discount",
  "appointment_status",
  "origin",
  "yenda_link",
] as const;

export type DescriptionFieldKey = (typeof DESCRIPTION_FIELD_KEYS)[number];

export type DescriptionFieldsConfig = Record<DescriptionFieldKey, boolean>;

// Human-readable labels for the Settings UI.
export const DESCRIPTION_FIELD_LABELS: Record<
  DescriptionFieldKey,
  { label: string; hint?: string }
> = {
  patient_phone: { label: "Teléfono del paciente" },
  patient_email: { label: "Email del paciente" },
  patient_dni: { label: "DNI / documento" },
  patient_age: { label: "Edad del paciente", hint: "Calculada desde fecha de nacimiento" },
  price: { label: "Total de la cita" },
  payment_status: { label: "Estado de pago", hint: "Pagado, pendiente o completo" },
  payment_method: { label: "Método de pago" },
  discount: { label: "Descuento aplicado", hint: "Solo si la cita tiene descuento" },
  appointment_status: { label: "Estado de la cita", hint: "Agendada, confirmada, completada, etc." },
  origin: { label: "Origen del paciente", hint: "Cómo llegó (referencia, redes, etc.)" },
  yenda_link: { label: "Link al detalle en Yenda" },
};

export const DEFAULT_DESCRIPTION_FIELDS: DescriptionFieldsConfig = {
  patient_phone: true,
  patient_email: false,
  patient_dni: false,
  patient_age: false,
  price: false,
  payment_status: false,
  payment_method: false,
  discount: false,
  appointment_status: false,
  origin: false,
  yenda_link: false,
};

// Field groups for UI organization.
export const DESCRIPTION_FIELD_GROUPS: {
  title: string;
  keys: DescriptionFieldKey[];
}[] = [
  {
    title: "Paciente",
    keys: ["patient_phone", "patient_email", "patient_dni", "patient_age"],
  },
  {
    title: "Cobros",
    keys: ["price", "payment_status", "payment_method", "discount"],
  },
  {
    title: "Metadata",
    keys: ["appointment_status", "origin", "yenda_link"],
  },
];

// ── Input payload ───────────────────────────────────────────────────────────

export interface DescriptionInput {
  // Always-on fields (no toggle needed).
  doctorName: string;
  officeName: string;
  notes: string | null;

  // Optional fields — provided when available. Absence means "no data".
  patient_phone?: string | null;
  patient_email?: string | null;
  patient_dni?: string | null;
  patient_birth_date?: string | null; // YYYY-MM-DD
  price?: number | null;
  amount_paid?: number | null;
  discount_amount?: number | null;
  discount_reason?: string | null;
  payment_method?: string | null;
  appointment_status?: string | null;
  origin?: string | null;
  appointment_id?: string | null;
  app_url?: string | null; // NEXT_PUBLIC_APP_URL — for building the link
}

function formatSoles(n: number): string {
  return `S/ ${Number(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function yearsSince(dateStr: string): number | null {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function paymentStatusLabel(price: number, paid: number, discount: number): string {
  const effective = Math.max(price - discount, 0);
  if (paid <= 0) return "Pendiente";
  if (paid >= effective) return "Pagado";
  const remaining = effective - paid;
  return `Parcial — falta ${formatSoles(remaining)}`;
}

function statusLabelEs(s: string | null | undefined): string {
  switch (s) {
    case "scheduled":
      return "Agendada";
    case "confirmed":
      return "Confirmada";
    case "completed":
      return "Completada";
    case "cancelled":
      return "Cancelada";
    case "no_show":
      return "No asistió";
    default:
      return s ?? "—";
  }
}

export function buildDescription(
  config: DescriptionFieldsConfig,
  data: DescriptionInput
): string {
  const lines: string[] = [];

  // Base (always on)
  lines.push(`Doctor: ${data.doctorName}`);
  if (data.officeName) lines.push(`Consultorio: ${data.officeName}`);

  // Patient block
  if (config.patient_phone && data.patient_phone) {
    lines.push(`Teléfono: ${data.patient_phone}`);
  }
  if (config.patient_email && data.patient_email) {
    lines.push(`Email: ${data.patient_email}`);
  }
  if (config.patient_dni && data.patient_dni) {
    lines.push(`DNI: ${data.patient_dni}`);
  }
  if (config.patient_age && data.patient_birth_date) {
    const age = yearsSince(data.patient_birth_date);
    if (age !== null) lines.push(`Edad: ${age} años`);
  }

  // Billing block
  const hasBillingSection =
    (config.price && data.price != null) ||
    (config.payment_status && data.price != null) ||
    (config.payment_method && data.payment_method) ||
    (config.discount && data.discount_amount && Number(data.discount_amount) > 0);

  if (hasBillingSection) {
    lines.push(""); // blank line separator
    lines.push("— Cobros —");
    if (config.price && data.price != null) {
      lines.push(`Total: ${formatSoles(Number(data.price))}`);
    }
    if (config.discount && data.discount_amount && Number(data.discount_amount) > 0) {
      const reason = data.discount_reason ? ` (${data.discount_reason})` : "";
      lines.push(`Descuento: ${formatSoles(Number(data.discount_amount))}${reason}`);
    }
    if (config.payment_status && data.price != null) {
      const status = paymentStatusLabel(
        Number(data.price),
        Number(data.amount_paid ?? 0),
        Number(data.discount_amount ?? 0)
      );
      lines.push(`Estado de pago: ${status}`);
    }
    if (config.payment_method && data.payment_method) {
      lines.push(`Método de pago: ${data.payment_method}`);
    }
  }

  // Metadata block
  const hasMetaSection =
    (config.appointment_status && data.appointment_status) ||
    (config.origin && data.origin) ||
    (config.yenda_link && data.appointment_id);

  if (hasMetaSection) {
    lines.push("");
    if (config.appointment_status && data.appointment_status) {
      lines.push(`Estado: ${statusLabelEs(data.appointment_status)}`);
    }
    if (config.origin && data.origin) {
      lines.push(`Origen: ${data.origin}`);
    }
    if (config.yenda_link && data.appointment_id && data.app_url) {
      lines.push(`Ver en Yenda: ${data.app_url}/scheduler?appointment=${data.appointment_id}`);
    }
  }

  // Notes (always on, at the bottom)
  if (data.notes) {
    lines.push("");
    lines.push("Notas:");
    lines.push(data.notes);
  }

  return lines.join("\n");
}

// Parse + validate a config coming from DB, tolerating missing keys (fills
// with defaults).
export function normalizeConfig(raw: unknown): DescriptionFieldsConfig {
  const out: DescriptionFieldsConfig = { ...DEFAULT_DESCRIPTION_FIELDS };
  if (raw && typeof raw === "object") {
    for (const key of DESCRIPTION_FIELD_KEYS) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === "boolean") out[key] = v;
    }
  }
  return out;
}
