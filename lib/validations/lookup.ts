import { z } from "zod";

export const lookupValueSchema = z.object({
  label: z.string().min(1, "La etiqueta es obligatoria").max(100, "Máximo 100 caracteres"),
  value: z
    .string()
    .min(1, "El valor es obligatorio")
    .max(50, "Máximo 50 caracteres")
    .regex(/^[a-z0-9_-]+$/, "Solo minúsculas, números, guiones y guion bajo"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color hexadecimal inválido")
    .optional()
    .or(z.literal(""))
    .or(z.literal(null)),
  display_order: z.coerce.number().min(0).default(0),
});

export type LookupValueFormData = z.infer<typeof lookupValueSchema>;
