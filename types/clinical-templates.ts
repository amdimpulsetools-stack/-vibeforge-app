// ── Clinical Templates Types ──────────────────────────────────────────────────

/** Row shape for `clinical_templates` table */
export interface ClinicalTemplate {
  id: string;
  organization_id: string;
  doctor_id: string | null;

  name: string;
  specialty: string | null;
  is_global: boolean;

  subjective: string;
  objective: string;
  assessment: string;
  plan: string;

  diagnosis_code: string | null;
  diagnosis_label: string | null;
  internal_notes: string | null;

  created_at: string;
  updated_at: string;
}

/** Template with doctor info for display */
export interface ClinicalTemplateWithDoctor extends ClinicalTemplate {
  doctors: {
    full_name: string;
  } | null;
}

/** Insert shape */
export type ClinicalTemplateInsert = Omit<
  ClinicalTemplate,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

/** Update shape */
export type ClinicalTemplateUpdate = Partial<
  Omit<ClinicalTemplate, "id" | "created_at" | "updated_at" | "organization_id">
>;

/** Common specialties for template categorization */
export const SPECIALTIES = [
  "Medicina General",
  "Ginecología",
  "Obstetricia",
  "Pediatría",
  "Dermatología",
  "Cardiología",
  "Traumatología",
  "Oftalmología",
  "Otorrinolaringología",
  "Urología",
  "Neurología",
  "Psiquiatría",
  "Nutrición",
  "Odontología",
  "Fertilidad",
] as const;
