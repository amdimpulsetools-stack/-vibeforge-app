// ── Treatment Plans ──────────────────────────────────────────────────────────

export interface TreatmentPlan {
  id: string;
  organization_id: string;
  patient_id: string;
  doctor_id: string;
  title: string;
  description: string | null;
  diagnosis_code: string | null;
  diagnosis_label: string | null;
  status: "active" | "completed" | "cancelled" | "paused";
  total_sessions: number | null;
  start_date: string | null;
  estimated_end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreatmentPlanWithDoctor extends TreatmentPlan {
  doctors: { full_name: string; color: string } | null;
}

export interface TreatmentPlanWithSessions extends TreatmentPlanWithDoctor {
  treatment_sessions: TreatmentSession[];
  treatment_plan_items?: TreatmentPlanItemWithService[];
}

export interface TreatmentSession {
  id: string;
  treatment_plan_id: string;
  organization_id: string;
  appointment_id: string | null;
  session_number: number;
  status: "pending" | "completed" | "missed" | "cancelled";
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  // Added in migration 099 — nullable for legacy plans without items
  service_id?: string | null;
  session_price?: number | null;
  treatment_plan_item_id?: string | null;
}

// Added in migration 099 — multi-service budget line items
export interface TreatmentPlanItem {
  id: string;
  treatment_plan_id: string;
  organization_id: string;
  service_id: string;
  quantity: number;
  unit_price: number;
  display_order: number;
  created_at: string;
}

// Helper shape returned when joining services
export interface TreatmentPlanItemWithService extends TreatmentPlanItem {
  services?: { id: string; name: string; duration_minutes: number } | null;
}

// Balance summary computed client-side
export interface TreatmentPlanBalance {
  total: number;
  paid: number;
  consumed: number;
  saldo: number; // paid - consumed (positive = credit, negative = debt)
}

export const TREATMENT_STATUS_CONFIG = {
  active: { label: "Activo", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  completed: { label: "Completado", color: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  cancelled: { label: "Cancelado", color: "bg-red-500/10 text-red-600 border-red-500/30" },
  paused: { label: "Pausado", color: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
} as const;

export const SESSION_STATUS_CONFIG = {
  pending: { label: "Pendiente", color: "bg-zinc-500/10 text-zinc-500" },
  completed: { label: "Completada", color: "bg-emerald-500/10 text-emerald-600" },
  missed: { label: "No asistió", color: "bg-red-500/10 text-red-600" },
  cancelled: { label: "Cancelada", color: "bg-amber-500/10 text-amber-600" },
} as const;

// ── Prescriptions ────────────────────────────────────────────────────────────

export interface Prescription {
  id: string;
  organization_id: string;
  patient_id: string;
  doctor_id: string;
  appointment_id: string | null;
  clinical_note_id: string | null;
  medication: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  route: string | null;
  instructions: string | null;
  quantity: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrescriptionWithDoctor extends Prescription {
  doctors: { full_name: string } | null;
}

// ── Catálogos de prescripción — FUENTE ÚNICA ────────────────────────────────
//
// Hasta el 10-sep-2026 había DOS listas divergentes para los mismos campos:
// estas (formulario dentro de la historia clínica, `prescriptions-panel.tsx`)
// y otras dentro de `components/clinical/prescription-composer-modal.tsx` (el
// atajo "Receta" del sidebar de la cita). Las recetas de ambos caminos acaban
// en la MISMA tabla y en la misma historia clínica, así que la divergencia ya
// había ensuciado los datos en producción: conviven "Subcutánea" (compositor)
// e "Intravenosa (IV)" (historia clínica) para la misma vía, y "Dosis única"
// existía solo en una de las dos listas.
//
// Ahora estas son las únicas listas: el compositor las importa desde aquí.
// Un valor guardado que ya no esté en la lista NO se pierde — el compositor
// lo añade como opción extra (`routeOptions`/`frequencyOptions`) y
// `matchOption` devuelve el valor crudo si no encuentra equivalencia.

/** Siglas incluidas a propósito: la botica y enfermería leen IM/IV/SC. */
export const PRESCRIPTION_ROUTES = [
  "Oral",
  "Sublingual",
  "Tópica",
  "Intramuscular (IM)",
  "Intravenosa (IV)",
  "Subcutánea (SC)",
  "Inhalatoria",
  "Rectal",
  "Oftálmica",
  "Ótica",
  "Nasal",
  "Vaginal",
] as const;

/**
 * Texto EXACTO de la dosis única: la redacción del PDF
 * (`lib/prescriptions/format.ts`) lo compara por string, así que no admite
 * variantes ("Dosis unica", "Única dosis"…).
 */
export const SINGLE_DOSE_FREQUENCY = "Dosis única";

/**
 * Orden deliberado. "Dosis única" va PRIMERA, no al final:
 *
 *  - No es una periodicidad, es su caso degenerado (cero repeticiones), y el
 *    resto de la lista es una escalera monótona que se lee de un vistazo
 *    (4→6→8→12→24 horas, 1→2→3 veces al día). Meterla en medio rompe esa
 *    escalera; meterla al final la esconde junto a "Según necesidad".
 *  - En el compositor las opciones son chips que hacen wrap: la primera
 *    posición es la única garantizada a la vista sin barrer la fila.
 *  - Es la opción que cambia el significado de los demás campos (la duración
 *    deja de aplicar), así que verla primero fija el modelo mental.
 *
 * "Según necesidad" (antes "PRN (según necesidad)" en esta lista) se queda al
 * final: es la otra no-periódica, pero es la salida de emergencia. Se elige
 * esa redacción y no la sigla porque la receta la lee la paciente, y porque
 * es la única de las dos que aparece en los datos de producción.
 */
export const PRESCRIPTION_FREQUENCIES = [
  SINGLE_DOSE_FREQUENCY,
  "Cada 4 horas",
  "Cada 6 horas",
  "Cada 8 horas",
  "Cada 12 horas",
  "Cada 24 horas",
  "Una vez al día",
  "Dos veces al día",
  "Tres veces al día",
  "En ayunas",
  "Antes de dormir",
  "Según necesidad",
] as const;

// ── Clinical Attachments ─────────────────────────────────────────────────────

export interface ClinicalAttachment {
  id: string;
  organization_id: string;
  patient_id: string;
  clinical_note_id: string | null;
  appointment_id: string | null;
  uploaded_by: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  category: "general" | "lab_result" | "imaging" | "referral" | "consent" | "other";
  description: string | null;
  created_at: string;
}

export const ATTACHMENT_CATEGORIES = {
  general: { label: "General", icon: "FileText" },
  lab_result: { label: "Resultado de laboratorio", icon: "TestTube" },
  imaging: { label: "Imagen diagnóstica", icon: "Image" },
  referral: { label: "Interconsulta", icon: "Send" },
  consent: { label: "Consentimiento", icon: "FileCheck" },
  other: { label: "Otro", icon: "File" },
} as const;

// ── Clinical Followups ───────────────────────────────────────────────────────

export interface ClinicalFollowup {
  id: string;
  organization_id: string;
  patient_id: string;
  doctor_id: string;
  appointment_id: string | null;
  clinical_note_id: string | null;
  priority: "red" | "yellow" | "green";
  reason: string;
  follow_up_date: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  notes: string | null;
  last_contacted_at: string | null;
  contacted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClinicalFollowupWithRelations extends ClinicalFollowup {
  doctors: { full_name: string } | null;
  patients: { first_name: string; last_name: string; phone: string | null } | null;
}

export interface FollowupDashboardItem extends ClinicalFollowupWithRelations {
  urgency: "overdue" | "this_week" | "upcoming";
  days_diff: number;
}

export const FOLLOWUP_PRIORITY_CONFIG = {
  red: { label: "Urgente", color: "bg-red-500", textColor: "text-red-600", bgLight: "bg-red-500/10" },
  yellow: { label: "Moderado", color: "bg-amber-500", textColor: "text-amber-600", bgLight: "bg-amber-500/10" },
  // Verde de SIGNIFICADO ("rutina, sin urgencia"), no de marca: usa la
  // escala `success-*` para que no lo recoloreen los temas de acento por
  // organización (ver app/globals.css).
  green: { label: "Rutina", color: "bg-success-500", textColor: "text-success-600", bgLight: "bg-success-500/10" },
} as const;

// ── Clinical Note Versions ───────────────────────────────────────────────────

export interface ClinicalNoteVersion {
  id: string;
  clinical_note_id: string;
  organization_id: string;
  edited_by: string;
  version_number: number;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  diagnosis_code: string | null;
  diagnosis_label: string | null;
  vitals: Record<string, number | null>;
  internal_notes: string | null;
  change_summary: string | null;
  created_at: string;
}
