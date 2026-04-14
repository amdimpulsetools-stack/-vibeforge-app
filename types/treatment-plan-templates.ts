// ── Treatment Plan Templates Types ───────────────────────────────────────────

/** Row shape for `treatment_plan_templates` table */
export interface TreatmentPlanTemplate {
  id: string;
  organization_id: string;
  doctor_id: string | null;

  name: string;
  specialty: string | null;
  is_global: boolean;

  title_template: string;
  description: string;
  diagnosis_code: string | null;
  diagnosis_label: string | null;
  total_sessions: number | null;
  session_duration_minutes: number | null;

  internal_notes: string | null;

  created_at: string;
  updated_at: string;
}

/** Template with doctor info for display */
export interface TreatmentPlanTemplateWithDoctor extends TreatmentPlanTemplate {
  doctors: {
    full_name: string;
  } | null;
}

/** Insert shape */
export type TreatmentPlanTemplateInsert = Omit<
  TreatmentPlanTemplate,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
};

/** Update shape */
export type TreatmentPlanTemplateUpdate = Partial<
  Omit<TreatmentPlanTemplate, "id" | "created_at" | "updated_at" | "organization_id">
>;
