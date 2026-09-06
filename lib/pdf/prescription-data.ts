/**
 * Datos de los documentos clínicos del motor HTML (receta y orden de
 * examen). Lo consumen las tres rutas:
 *
 *   /api/pdf/prescription/[appointmentId]   receta por cita
 *   /api/pdf/prescription/batch/[batchId]   receta por lote (mig 247, sin cita)
 *   /api/pdf/exam-order/[orderId]           orden de examen
 *
 * Aquí viven las piezas que las tres comparten: edad del paciente, código
 * corto del documento, pie "generado el…" en la zona de la org, variables
 * `{{…}}` del cuerpo editable (Ajustes → Plantillas HC) y el `data` de la
 * receta. Todo es puro (sin Supabase): las rutas cargan y esto arma.
 */

import { buildOrgDocBlock, type OrgDocBlock } from "@/lib/pdf/html/org";
import { formatLongDate, formatShortDate } from "@/lib/pdf/html/render";
import { resolveOrgTimezone } from "@/lib/org-time";
import { sanitizeEmailHtml, substituteVariables } from "@/lib/sanitize-email-html";

/** Columnas de `organizations` que necesita `buildOrgDocBlock` + zona horaria. */
export const ORG_DOC_COLUMNS =
  "id, name, legal_name, tagline, ruc, logo_url, address, district, phone, " +
  "phone_secondary, email_public, website, print_color_primary, timezone";

export interface DocPatient {
  first_name: string;
  last_name: string;
  dni: string | null;
  birth_date: string | null;
}

export interface DocDoctor {
  full_name: string;
  cmp: string | null;
}

export interface DocTemplate {
  body_html: string | null;
  is_enabled: boolean;
}

export interface PrescriptionRow {
  medication: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  quantity: string | null;
  instructions: string | null;
  pharmaceutical_form: string | null;
  dose_per_take: string | null;
}

// ── Helpers genéricos ─────────────────────────────────────────────

export function patientFullName(p: DocPatient): string {
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
}

/** Nombre apto para `filename=` (sin espacios ni caracteres raros). */
export function fileSlug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "documento"
  );
}

/** "RX-1A2B3C4D": prefijo + primeros 8 hex del uuid en mayúsculas. */
export function docCode(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/**
 * Edad en años cumplidos en la fecha civil `onDate` (ambas "yyyy-MM-dd").
 * Aritmética de calendario pura: sin Date ni zonas horarias.
 */
export function ageOn(birthDate: string | null | undefined, onDate: string): number | null {
  if (!birthDate) return null;
  const b = birthDate.slice(0, 10).split("-").map(Number);
  const o = onDate.slice(0, 10).split("-").map(Number);
  if (b.length !== 3 || o.length !== 3 || b.some(Number.isNaN) || o.some(Number.isNaN)) {
    return null;
  }
  let age = o[0] - b[0];
  if (o[1] < b[1] || (o[1] === b[1] && o[2] < b[2])) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

export function ageLabel(age: number | null): string {
  if (age === null) return "";
  return age === 1 ? "1 año" : `${age} años`;
}

/** "Documento generado por Yenda · 05/09/2026 14:32" (reloj de la org). */
export function generatedFooterNote(timezone: string | null | undefined, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("es-PE", {
    timeZone: resolveOrgTimezone(timezone),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `Documento generado por Yenda · ${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

export interface ClinicalDocVariablesInput {
  patient: DocPatient;
  doctor: DocDoctor;
  /** Fecha civil del documento "yyyy-MM-dd". */
  date: string;
  orgName: string;
}

/**
 * Variables del cuerpo editable. Mantiene las históricas y añade
 * `{{paciente_edad}}` y `{{fecha_larga}}` (listadas en Ajustes → Plantillas HC).
 */
export function clinicalDocVariables(input: ClinicalDocVariablesInput): Record<string, string> {
  return {
    "{{paciente_nombre}}": patientFullName(input.patient),
    "{{paciente_dni}}": input.patient.dni ?? "",
    "{{paciente_edad}}": ageLabel(ageOn(input.patient.birth_date, input.date)),
    "{{doctor_nombre}}": input.doctor.full_name,
    "{{doctor_cmp}}": input.doctor.cmp ?? "",
    "{{fecha}}": formatShortDate(input.date),
    "{{fecha_larga}}": formatLongDate(input.date),
    "{{clinica_nombre}}": input.orgName,
  };
}

/**
 * Cuerpo editable listo para insertar con triple llave. El body_html del
 * admin (TipTap) se guarda sin sanitizar en `clinical_document_templates`,
 * y ahora se renderiza en Chromium: se pasa por `sanitizeEmailHtml`
 * (allow-list de formato) ANTES de sustituir variables, que a su vez
 * escapa cada valor. Null si el template está deshabilitado o vacío.
 */
export function renderTemplateBody(
  tpl: DocTemplate | null | undefined,
  variables: Record<string, string>,
): string | null {
  if (!tpl?.is_enabled) return null;
  const raw = tpl.body_html?.trim();
  if (!raw) return null;
  const safe = sanitizeEmailHtml(raw).trim();
  if (!safe) return null;
  return substituteVariables(safe, variables);
}

/**
 * Celdas de la rejilla `meta` comunes a receta y orden de examen. Siempre
 * 5 celdas que llenan 2 filas de 3 (Paciente · Documento · Edad / Médico
 * ancho · Fecha): un dato ausente sale como "—" en vez de omitir la celda,
 * porque el partial `meta` no imprime celdas vacías y dejaría un hueco.
 */
export function patientDoctorMeta(patient: DocPatient, doctor: DocDoctor, date: string) {
  return [
    { label: "Paciente", value: patientFullName(patient) || "—" },
    { label: "Documento", value: patient.dni ? `DNI ${patient.dni}` : "—" },
    { label: "Edad", value: ageLabel(ageOn(patient.birth_date, date)) || "—" },
    {
      label: "Médico",
      value: doctor.full_name,
      hint: doctor.cmp ? `CMP ${doctor.cmp}` : "",
      wide: true,
    },
    { label: "Fecha", value: formatLongDate(date) },
  ];
}

// ── Receta ────────────────────────────────────────────────────────

/** Fila (parcial) de `organizations` con `ORG_DOC_COLUMNS`. */
export type OrgDocRow = Parameters<typeof buildOrgDocBlock>[0] & { timezone?: string | null };

export interface PrescriptionDocInput {
  org: OrgDocRow;
  /** UUID que identifica la receta impresa (batch_id o appointment_id). */
  codeSource: string;
  /** Fecha civil del documento "yyyy-MM-dd". */
  date: string;
  patient: DocPatient;
  doctor: DocDoctor;
  prescriptions: PrescriptionRow[];
  template: DocTemplate | null | undefined;
}

export interface PrescriptionDocData extends Record<string, unknown> {
  doc: {
    title: string;
    eyebrow: string;
    code: string;
    issued_label: string;
    footer_note: string;
  };
  org: OrgDocBlock;
  meta: ReturnType<typeof patientDoctorMeta>;
  items: PrescriptionRow[];
  count_label: string;
  body_html: string | null;
  signer: { name: string; role: string; cmp: string };
}

export function buildPrescriptionDocData(input: PrescriptionDocInput): PrescriptionDocData {
  const org = buildOrgDocBlock(input.org);
  const items = input.prescriptions.map((p) => ({
    medication: (p.medication ?? "").trim(),
    dosage: p.dosage?.trim() || null,
    frequency: p.frequency?.trim() || null,
    duration: p.duration?.trim() || null,
    route: p.route?.trim() || null,
    quantity: p.quantity?.trim() || null,
    instructions: p.instructions?.trim() || null,
    pharmaceutical_form: p.pharmaceutical_form?.trim() || null,
    dose_per_take: p.dose_per_take?.trim() || null,
  }));
  const n = items.length;

  return {
    doc: {
      title: "Receta médica",
      eyebrow: "Prescripción",
      code: docCode("RX", input.codeSource),
      issued_label: `Emitida ${formatShortDate(input.date)}`,
      footer_note: generatedFooterNote(input.org.timezone),
    },
    org,
    meta: patientDoctorMeta(input.patient, input.doctor, input.date),
    items,
    count_label: n === 1 ? "1 medicamento" : `${n} medicamentos`,
    body_html: renderTemplateBody(
      input.template,
      clinicalDocVariables({
        patient: input.patient,
        doctor: input.doctor,
        date: input.date,
        orgName: org.display_name,
      }),
    ),
    signer: {
      name: input.doctor.full_name,
      role: "Médico tratante",
      cmp: input.doctor.cmp?.trim() ?? "",
    },
  };
}
