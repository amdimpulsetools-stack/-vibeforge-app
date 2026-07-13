import { z } from "zod";
import type { AppointmentRequiredFields } from "@/lib/scheduler-config";

// Base schema — the pre-mig-176 shape, kept byte-identical so that
// `buildAppointmentSchema({})` validates EXACTLY like the original
// `appointmentSchema`. The configurable fields below stay optional here and
// are upgraded to "required" purely at RUNTIME via the superRefine, so the
// inferred output type (AppointmentFormData) never changes.
const appointmentBaseSchema = z.object({
  patient_name: z.string().min(2, "Mínimo 2 caracteres").max(100, "Máximo 100 caracteres"),
  patient_last_name: z.string().min(2, "Mínimo 2 caracteres").max(100, "Máximo 100 caracteres"),
  patient_phone: z.string().max(20, "Máximo 20 caracteres").optional().or(z.literal("")),
  patient_dni: z.string().max(20, "Máximo 20 caracteres").optional().or(z.literal("")),
  patient_id: z.string().uuid().optional().or(z.literal("")),
  doctor_id: z.string().uuid("Selecciona un doctor"),
  office_id: z.string().uuid("Selecciona un consultorio"),
  service_id: z.string().uuid("Selecciona un servicio"),
  appointment_date: z.string().min(1, "Fecha obligatoria"),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM"),
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]).default("scheduled"),
  origin: z.string().optional().or(z.literal("")),
  payment_method: z.string().optional().or(z.literal("")),
  responsible: z.string().optional().or(z.literal("")),
  notes: z.string().max(500, "Máximo 500 caracteres").optional().or(z.literal("")),
  meeting_url: z.string().url("URL inválida").optional().or(z.literal("")),
});

// es-PE messages for each configurable field when an admin marks it mandatory.
// Only fields living inside React Hook Form are handled here; email, birth
// date and location live outside RHF and are validated manually in the modal.
const REQUIRED_MESSAGES: Partial<Record<keyof AppointmentRequiredFields, string>> = {
  patient_dni: "El documento es obligatorio",
  patient_phone: "El teléfono es obligatorio",
  origin: "El origen es obligatorio",
  payment_method: "El método de pago es obligatorio",
  responsible: "El responsable es obligatorio",
  notes: "Las notas son obligatorias",
};

/**
 * Builds the appointment validation schema for a given per-org
 * `required_fields` map (mig 176). With the default empty map the schema is
 * semantically identical to the legacy `appointmentSchema`: no configurable
 * field is enforced, so no existing org sees any change.
 *
 * Required fields are enforced via superRefine (runtime only) so the inferred
 * TypeScript output type stays constant across every configuration — the modal
 * can keep a single `useForm<AppointmentFormData>`.
 */
export function buildAppointmentSchema(req: AppointmentRequiredFields = {}) {
  return appointmentBaseSchema.superRefine((data, ctx) => {
    (Object.keys(REQUIRED_MESSAGES) as (keyof typeof REQUIRED_MESSAGES)[]).forEach((key) => {
      if (!req[key]) return;
      const value = (data as Record<string, unknown>)[key];
      if (value === undefined || value === null || String(value).trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: REQUIRED_MESSAGES[key]!,
        });
      }
    });
  });
}

// Back-compat export: other modules import `appointmentSchema` directly. The
// empty-map build is byte-identical to the original schema.
export const appointmentSchema = buildAppointmentSchema({});

export type AppointmentFormData = z.infer<typeof appointmentBaseSchema>;
