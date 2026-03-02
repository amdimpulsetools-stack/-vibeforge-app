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
});

export type OrganizationFormData = z.infer<typeof organizationSchema>;
