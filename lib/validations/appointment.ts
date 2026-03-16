import { z } from "zod";

export const appointmentSchema = z.object({
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

export type AppointmentFormData = z.infer<typeof appointmentSchema>;
