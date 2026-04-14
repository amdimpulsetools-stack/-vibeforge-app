import { z } from "zod";

export const treatmentPlanTemplateSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  specialty: z.string().max(100).nullish(),
  is_global: z.boolean().default(false),
  doctor_id: z.string().uuid().nullish(),

  title_template: z.string().max(200, "Máximo 200 caracteres").default(""),
  description: z.string().max(2000, "Máximo 2000 caracteres").default(""),

  diagnosis_code: z.string().max(20).nullish(),
  diagnosis_label: z.string().max(200).nullish(),

  total_sessions: z
    .number()
    .int()
    .min(1, "Mínimo 1 sesión")
    .max(100, "Máximo 100 sesiones")
    .nullish(),
  session_duration_minutes: z
    .number()
    .int()
    .min(5, "Mínimo 5 minutos")
    .max(600, "Máximo 600 minutos")
    .nullish(),

  internal_notes: z.string().max(2000).nullish(),
});

export const treatmentPlanTemplateUpdateSchema = treatmentPlanTemplateSchema.partial();

export type TreatmentPlanTemplateFormData = z.infer<typeof treatmentPlanTemplateSchema>;
