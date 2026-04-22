import { z } from "zod";

export const doctorSchema = z.object({
  full_name: z.string().min(2, "Mínimo 2 caracteres").max(100, "Máximo 100 caracteres"),
  cmp: z.string().min(1, "CMP es obligatorio").max(20, "Máximo 20 caracteres"),
  specialty: z.string().max(100, "Máximo 100 caracteres").optional().or(z.literal("")).or(z.literal(null)),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hexadecimal inválido"),
  photo_url: z.string().url("URL inválida").optional().or(z.literal("")).or(z.literal(null)),
  default_meeting_url: z.string().url("URL inválida").optional().or(z.literal("")).or(z.literal(null)),
  default_office_id: z.string().uuid("Consultorio inválido").optional().or(z.literal("")).or(z.literal(null)),
  is_active: z.boolean().default(true),
});

export type DoctorFormData = z.infer<typeof doctorSchema>;

export const doctorScheduleSchema = z.object({
  day_of_week: z.number().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM"),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM"),
  office_id: z.string().uuid("Consultorio inválido").optional().or(z.literal("")),
}).refine((data) => data.end_time > data.start_time, {
  message: "La hora fin debe ser posterior a la hora inicio",
  path: ["end_time"],
});

export type DoctorScheduleFormData = z.infer<typeof doctorScheduleSchema>;
