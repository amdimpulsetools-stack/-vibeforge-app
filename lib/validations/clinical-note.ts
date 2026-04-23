import { z } from "zod";

const vitalsSchema = z.object({
  weight_kg: z.coerce.number().min(0).max(500).nullish(),
  height_cm: z.coerce.number().min(0).max(300).nullish(),
  temp_c: z.coerce.number().min(30).max(45).nullish(),
  bp_systolic: z.coerce.number().min(40).max(300).nullish(),
  bp_diastolic: z.coerce.number().min(20).max(200).nullish(),
  heart_rate: z.coerce.number().min(20).max(300).nullish(),
  resp_rate: z.coerce.number().min(4).max(60).nullish(),
  spo2: z.coerce.number().min(50).max(100).nullish(),
}).default({});

export const clinicalNoteSchema = z.object({
  appointment_id: z.string().uuid("appointment_id debe ser un UUID válido"),
  patient_id: z.string().uuid().nullish(),
  doctor_id: z.string().uuid("doctor_id debe ser un UUID válido"),

  subjective: z.string().max(5000, "Máximo 5000 caracteres").default(""),
  objective: z.string().max(5000, "Máximo 5000 caracteres").default(""),
  assessment: z.string().max(5000, "Máximo 5000 caracteres").default(""),
  plan: z.string().max(5000, "Máximo 5000 caracteres").default(""),

  diagnosis_code: z.string().max(20).nullish(),
  diagnosis_label: z.string().max(200).nullish(),

  vitals: vitalsSchema,

  internal_notes: z.string().max(2000).nullish(),

  // Informed consent (Tier 1 MVP — migration 102)
  consent_registered: z.boolean().default(false),
  consent_notes: z.string().max(2000).nullish(),
});

export const clinicalNoteUpdateSchema = clinicalNoteSchema
  .omit({ appointment_id: true, doctor_id: true })
  .partial();

export const signNoteSchema = z.object({
  is_signed: z.literal(true),
});

export type ClinicalNoteFormData = z.infer<typeof clinicalNoteSchema>;
export type ClinicalNoteUpdateData = z.infer<typeof clinicalNoteUpdateSchema>;
