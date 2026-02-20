import { z } from "zod";

export const officeSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").max(100, "Máximo 100 caracteres"),
  description: z.string().max(255, "Máximo 255 caracteres").optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});

export type OfficeFormData = z.infer<typeof officeSchema>;
