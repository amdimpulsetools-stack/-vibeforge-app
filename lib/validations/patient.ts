import { z } from "zod";

export const patientSchema = z.object({
  dni: z.string().max(20, "Máximo 20 caracteres").optional().or(z.literal("")),
  first_name: z.string().min(2, "Mínimo 2 caracteres").max(100, "Máximo 100 caracteres"),
  last_name: z.string().min(2, "Mínimo 2 caracteres").max(100, "Máximo 100 caracteres"),
  phone: z.string().max(20, "Máximo 20 caracteres").optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).default("active"),
  origin: z.string().optional().or(z.literal("")),
  adicional_1: z.string().max(200, "Máximo 200 caracteres").optional().or(z.literal("")),
  adicional_2: z.string().max(200, "Máximo 200 caracteres").optional().or(z.literal("")),
  viene_desde: z.string().max(200, "Máximo 200 caracteres").optional().or(z.literal("")),
  notes: z.string().max(500, "Máximo 500 caracteres").optional().or(z.literal("")),
});

export type PatientFormData = z.infer<typeof patientSchema>;

export const patientPaymentSchema = z.object({
  patient_id: z.string().uuid("Paciente requerido"),
  appointment_id: z.string().uuid().optional().or(z.literal("")),
  amount: z.coerce.number().min(0.01, "Monto debe ser mayor a 0"),
  payment_method: z.string().optional().or(z.literal("")),
  notes: z.string().max(200, "Máximo 200 caracteres").optional().or(z.literal("")),
  payment_date: z.string().min(1, "Fecha requerida"),
});

export type PatientPaymentFormData = z.infer<typeof patientPaymentSchema>;
