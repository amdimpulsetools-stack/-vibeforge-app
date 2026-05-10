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
  requires_consent: z.boolean().default(false),
  is_active: z.boolean().default(true),

  // Fiscal data — only relevant if e-invoicing is connected. All optional so
  // services created before activation keep working.
  sunat_product_code: z
    .string()
    .max(15, "Máximo 15 caracteres")
    .optional()
    .or(z.literal("")),
  unit_of_measure: z
    .string()
    .max(10)
    .optional()
    .or(z.literal("")),
  igv_affectation: z.coerce.number().int().optional(),

  // Fertility addon — only relevant if the org has fertility_basic|premium
  // active. Inert otherwise. UI gates this with <FertilityAddonGate>.
  is_budget_eligible: z.boolean().default(false),
});

export type ServiceFormData = z.infer<typeof serviceSchema>;

// ──────────────────────────────────────────────────────────────────
// Budget tiers (A/B/C) for services flagged is_budget_eligible.
// Persisted to service_budget_tiers via PUT /api/services/[id]/tiers.
// ──────────────────────────────────────────────────────────────────
export const TIER_LETTERS = ["A", "B", "C"] as const;
export type TierLetter = (typeof TIER_LETTERS)[number];

export const TIER_CURRENCY_OPTIONS = [
  { value: "PEN", label: "PEN (S/.)" },
  { value: "USD", label: "USD ($)" },
] as const;

export const serviceBudgetTierSchema = z.object({
  tier: z.enum(TIER_LETTERS),
  amount: z.coerce.number().min(0, "Monto inválido"),
  currency: z.enum(["PEN", "USD"]).default("PEN"),
  includes_text: z.string().max(2000).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});

export type ServiceBudgetTierFormData = z.infer<typeof serviceBudgetTierSchema>;

// Catálogo IGV para el selector. Estos son los más comunes para servicios
// médicos en Perú; el manual Nubefact tiene la lista completa.
export const IGV_AFFECTATION_OPTIONS = [
  { value: 1, label: "Gravado (con IGV 18%)" },
  { value: 8, label: "Exonerado (sin IGV — servicio exonerado por SUNAT)" },
  { value: 9, label: "Inafecto (no afecto a IGV)" },
  { value: 12, label: "Inafecto — Muestras médicas" },
] as const;

export const UNIT_OF_MEASURE_OPTIONS = [
  { value: "ZZ", label: "ZZ — Servicios" },
  { value: "NIU", label: "NIU — Unidades (productos)" },
  { value: "4A", label: "4A — Otros" },
] as const;
