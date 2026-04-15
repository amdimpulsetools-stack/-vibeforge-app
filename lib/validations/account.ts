import { z } from "zod";

export const PROFESSIONAL_TITLES = [
  { value: "doctor", label: "Doctor(a)" },
  { value: "especialista", label: "Especialista" },
  { value: "licenciada", label: "Licenciado(a)" },
] as const;

export type ProfessionalTitle = "doctor" | "especialista" | "licenciada";

export const profileSchema = z.object({
  full_name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre no puede superar 100 caracteres"),
  phone: z
    .string()
    .max(20, "El celular no puede superar 20 caracteres")
    .optional()
    .or(z.literal("")),
  whatsapp_phone: z
    .string()
    .max(20, "El WhatsApp no puede superar 20 caracteres")
    .optional()
    .or(z.literal("")),
  professional_title: z
    .enum(["doctor", "especialista", "licenciada"])
    .nullable()
    .optional(),
});

export type ProfileFormData = z.infer<typeof profileSchema>;

export const passwordSchema = z
  .object({
    new_password: z
      .string()
      .min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Las contraseñas no coinciden",
    path: ["confirm_password"],
  });

export type PasswordFormData = z.infer<typeof passwordSchema>;
