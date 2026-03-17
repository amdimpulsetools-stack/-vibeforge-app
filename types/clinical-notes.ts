// ── Clinical Notes Types ────────────────────────────────────────────────────

/** Vitals stored as JSONB in clinical_notes.vitals */
export interface Vitals {
  weight_kg?: number | null;
  height_cm?: number | null;
  temp_c?: number | null;
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  heart_rate?: number | null;
  resp_rate?: number | null;
  spo2?: number | null;
}

/** Row shape for `clinical_notes` table */
export interface ClinicalNote {
  id: string;
  appointment_id: string;
  patient_id: string | null;
  doctor_id: string;
  organization_id: string;

  subjective: string;
  objective: string;
  assessment: string;
  plan: string;

  diagnosis_code: string | null;
  diagnosis_label: string | null;
  is_signed: boolean;
  signed_at: string | null;

  vitals: Vitals;
  internal_notes: string | null;

  created_at: string;
  updated_at: string;
}

/** Insert shape (omits server-generated fields) */
export type ClinicalNoteInsert = Omit<
  ClinicalNote,
  "id" | "created_at" | "updated_at" | "signed_at"
> & {
  id?: string;
  signed_at?: string | null;
};

/** Update shape (all fields optional except id) */
export type ClinicalNoteUpdate = Partial<
  Omit<ClinicalNote, "id" | "created_at" | "updated_at" | "appointment_id" | "organization_id">
>;

/** Clinical note with doctor name for display */
export interface ClinicalNoteWithDoctor extends ClinicalNote {
  doctors: {
    full_name: string;
    color: string;
  };
}

/** SOAP section keys */
export type SOAPSection = "subjective" | "objective" | "assessment" | "plan";

/** Labels for each SOAP section */
export const SOAP_LABELS: Record<SOAPSection, { letter: string; label: string; placeholder: string }> = {
  subjective: {
    letter: "S",
    label: "Subjetivo",
    placeholder: "Motivo de consulta, síntomas reportados por el paciente, historia de la enfermedad actual...",
  },
  objective: {
    letter: "O",
    label: "Objetivo",
    placeholder: "Hallazgos del examen físico, resultados de laboratorio, signos vitales...",
  },
  assessment: {
    letter: "A",
    label: "Evaluación",
    placeholder: "Diagnóstico o impresión clínica, diagnóstico diferencial...",
  },
  plan: {
    letter: "P",
    label: "Plan",
    placeholder: "Tratamiento, medicamentos, indicaciones, próxima cita, referencia a especialista...",
  },
};

/** Vitals field metadata */
export const VITALS_FIELDS = [
  { key: "weight_kg" as const, label: "Peso", unit: "kg", step: 0.1 },
  { key: "height_cm" as const, label: "Talla", unit: "cm", step: 0.1 },
  { key: "temp_c" as const, label: "Temp.", unit: "°C", step: 0.1 },
  { key: "bp_systolic" as const, label: "PA Sist.", unit: "mmHg", step: 1 },
  { key: "bp_diastolic" as const, label: "PA Diast.", unit: "mmHg", step: 1 },
  { key: "heart_rate" as const, label: "FC", unit: "lpm", step: 1 },
  { key: "resp_rate" as const, label: "FR", unit: "rpm", step: 1 },
  { key: "spo2" as const, label: "SpO₂", unit: "%", step: 1 },
] as const;
