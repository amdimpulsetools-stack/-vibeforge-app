import { z } from "zod";

export const clinicalTemplateSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  specialty: z.string().max(100).nullish(),
  is_global: z.boolean().default(false),
  doctor_id: z.string().uuid().nullish(),

  subjective: z.string().max(5000, "Máximo 5000 caracteres").default(""),
  objective: z.string().max(5000, "Máximo 5000 caracteres").default(""),
  assessment: z.string().max(5000, "Máximo 5000 caracteres").default(""),
  plan: z.string().max(5000, "Máximo 5000 caracteres").default(""),

  diagnosis_code: z.string().max(20).nullish(),
  diagnosis_label: z.string().max(200).nullish(),
  internal_notes: z.string().max(2000).nullish(),
});

export const clinicalTemplateUpdateSchema = clinicalTemplateSchema.partial();

export type ClinicalTemplateFormData = z.infer<typeof clinicalTemplateSchema>;
