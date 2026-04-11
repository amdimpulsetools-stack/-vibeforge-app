import { z } from "zod";

export const organizationSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre no puede superar 100 caracteres"),
  slug: z
    .string()
    .min(2, "El slug debe tener al menos 2 caracteres")
    .max(50, "El slug no puede superar 50 caracteres")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Solo letras minúsculas, números y guiones"
    ),
  address: z
    .string()
    .max(250, "La dirección no puede superar 250 caracteres")
    .optional()
    .or(z.literal("")),
  google_maps_url: z
    .string()
    .max(500, "El enlace no puede superar 500 caracteres")
    .url("Debe ser una URL válida")
    .optional()
    .or(z.literal("")),
});

export type OrganizationFormData = z.infer<typeof organizationSchema>;
