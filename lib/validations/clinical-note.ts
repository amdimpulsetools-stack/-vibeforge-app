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

// Single diagnosis entry — used inside the diagnoses array.
const diagnosisInputSchema = z.object({
  code: z.string().min(1, "Código requerido").max(20),
  label: z.string().min(1, "Descripción requerida").max(200),
  is_primary: z.boolean().optional(),
  position: z.number().int().min(0).max(100).optional(),
});

// Full replace-all list. Cap at 20 to prevent abuse.
const diagnosesSchema = z
  .array(diagnosisInputSchema)
  .max(20, "Máximo 20 diagnósticos por nota")
  .optional();

export const clinicalNoteSchema = z.object({
  appointment_id: z.string().uuid("appointment_id debe ser un UUID válido"),
  patient_id: z.string().uuid().nullish(),
  doctor_id: z.string().uuid("doctor_id debe ser un UUID válido"),

  subjective: z.string().max(5000, "Máximo 5000 caracteres").default(""),
  objective: z.string().max(5000, "Máximo 5000 caracteres").default(""),
  assessment: z.string().max(5000, "Máximo 5000 caracteres").default(""),
  plan: z.string().max(5000, "Máximo 5000 caracteres").default(""),

  // Legacy single-diagnosis fields. Mantener por compat con plantillas y
  // clientes que aún no migraron a `diagnoses`. Si se envía `diagnoses`,
  // estos se ignoran (el trigger DB sincroniza el primary).
  diagnosis_code: z.string().max(20).nullish(),
  diagnosis_label: z.string().max(200).nullish(),

  /** Lista completa de diagnósticos CIE-10. Reemplaza el set existente. */
  diagnoses: diagnosesSchema,

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
