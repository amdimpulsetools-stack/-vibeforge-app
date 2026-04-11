import { z } from "zod";

export const serviceCategorySchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").max(100, "Máximo 100 caracteres"),
  description: z.string().max(255, "Máximo 255 caracteres").optional().or(z.literal("")),
});

export type ServiceCategoryFormData = z.infer<typeof serviceCategorySchema>;

export const SERVICE_MODALITY_OPTIONS = [
  { value: "in_person", label: "Presencial" },
  { value: "virtual", label: "Virtual" },
  { value: "both", label: "Ambos" },
] as const;

export type ServiceModality = "in_person" | "virtual" | "both";

export const serviceSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").max(100, "Máximo 100 caracteres"),
  category_id: z.string().uuid("Selecciona una categoría"),
  base_price: z.coerce.number().min(0, "Debe ser un número positivo"),
  duration_minutes: z.coerce.number().refine(
    (val) => val > 0 && val % 15 === 0,
    "La duración debe ser múltiplo de 15 min"
  ),
  modality: z.enum(["in_person", "virtual", "both"]).default("in_person"),
  pre_appointment_instructions: z.string().max(500, "Máximo 500 caracteres").optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});

export type ServiceFormData = z.infer<typeof serviceSchema>;
