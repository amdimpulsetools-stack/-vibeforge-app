import { z } from "zod";

// ── Members ──────────────────────────────────────────────────────────
export const inviteMemberSchema = z.object({
  email: z.string().email("Email inválido"),
  role: z.enum(["admin", "receptionist", "doctor"], {
    errorMap: () => ({ message: "Rol inválido. Debe ser admin, receptionist o doctor" }),
  }),
  professional_title: z
    .enum(["doctor", "especialista", "licenciada"])
    .nullish(),
});

export const updateMemberSchema = z
  .object({
    role: z
      .enum(["admin", "receptionist", "doctor"], {
        errorMap: () => ({ message: "Rol inválido" }),
      })
      .optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => data.role !== undefined || data.is_active !== undefined, {
    message: "Debe incluir role o is_active",
  });

// ── Plans ────────────────────────────────────────────────────────────
export const selectPlanSchema = z.object({
  plan_id: z.string().uuid("plan_id debe ser un UUID válido"),
});

export const startTrialSchema = z.object({
  plan_id: z.string().uuid("plan_id debe ser un UUID válido"),
});

// ── Auth ─────────────────────────────────────────────────────────────
export const registerInvitedSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  fullName: z.string().min(2, "Nombre debe tener al menos 2 caracteres"),
  inviteToken: z.string().regex(/^[a-f0-9-]{36}$/, "Token de invitación inválido"),
});

// ── Email ────────────────────────────────────────────────────────────
export const sendTestEmailSchema = z.object({
  to: z.string().email("Email de destinatario inválido"),
  subject: z.string().min(1, "Asunto requerido").max(200),
  body: z.string().min(1, "Cuerpo del correo requerido"),
  brand_color: z.string().optional(),
  logo_url: z.string().url().optional().or(z.literal("")),
  clinic_name: z.string().optional(),
});

// ── Notifications ────────────────────────────────────────────────────
export const sendNotificationSchema = z.object({
  type: z.string().min(1, "type es requerido"),
  appointment_id: z.string().uuid("appointment_id debe ser un UUID válido"),
  extra_variables: z.record(z.string()).optional(),
});

// ── AI Assistant ─────────────────────────────────────────────────────
export const aiAssistantSchema = z.object({
  message: z
    .string()
    .min(1, "Mensaje vacío")
    .max(1000, "Mensaje demasiado largo"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      })
    )
    .max(10)
    .optional(),
});

// ── AI Reports ──────────────────────────────────────────────────
export const aiReportSchema = z.object({
  reportType: z.enum(["financial", "marketing", "operational", "retention", "general"]),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: YYYY-MM-DD"),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: YYYY-MM-DD"),
});

// ── Mercado Pago ─────────────────────────────────────────────────────
export const mpCheckoutSchema = z.object({
  plan_id: z.string().uuid("plan_id debe ser un UUID válido"),
  billing_cycle: z.enum(["monthly", "yearly"]).default("monthly"),
});

export const mpSubscriptionUpdateSchema = z.object({
  addon_type: z.enum(["extra_member", "extra_office"], {
    errorMap: () => ({ message: "addon_type inválido" }),
  }),
  quantity: z.number().int().min(1, "quantity debe ser >= 1"),
});

export const mpCreatePreferenceSchema = z.object({
  plan_slug: z.string().min(1, "plan_slug requerido"),
  billing_cycle: z.enum(["monthly", "yearly"]),
});

export const mpWebhookBodySchema = z.object({
  type: z.enum([
    "payment",
    "subscription_preapproval",
    "subscription_preapproval_plan",
    "subscription_authorized_payment",
    "point_integration_wh",
    "topic_claims_integration_wh",
  ]),
  action: z.string().max(100).optional(),
  data: z.object({
    id: z.string().regex(/^\d+$/, "data.id debe ser numérico"),
  }),
}).passthrough();

// ── Clinical Notes ──────────────────────────────────────────────────
export { clinicalNoteSchema, clinicalNoteUpdateSchema, signNoteSchema } from "./clinical-note";

// ── Clinical Templates ──────────────────────────────────────────────
export { clinicalTemplateSchema, clinicalTemplateUpdateSchema } from "./clinical-template";

// ── Treatment Plan Templates ────────────────────────────────────────
export {
  treatmentPlanTemplateSchema,
  treatmentPlanTemplateUpdateSchema,
} from "./treatment-plan-template";
