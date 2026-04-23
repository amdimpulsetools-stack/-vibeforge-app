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

export const PRESCRIPTION_FREQUENCIES = [
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
  "PRN (según necesidad)",
  "Dosis única",
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
  green: { label: "Rutina", color: "bg-emerald-500", textColor: "text-emerald-600", bgLight: "bg-emerald-500/10" },
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
