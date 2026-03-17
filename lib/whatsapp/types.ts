// ── WhatsApp Business API Types ──────────────────────────────────────────────

export type WhatsAppTemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";

export type WhatsAppTemplateStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED";

export type WhatsAppHeaderType = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

export type WhatsAppMessageStatus = "sent" | "delivered" | "read" | "failed";

// ── Database Row Types ──────────────────────────────────────────────────────

export interface WhatsAppConfig {
  id: string;
  organization_id: string;
  waba_id: string | null;
  phone_number_id: string | null;
  access_token: string | null;
  webhook_verify_token: string | null;
  business_verified: boolean;
  messaging_tier: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppTemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
}

export interface WhatsAppTemplate {
  id: string;
  organization_id: string;
  local_template_id: string | null;
  meta_template_name: string;
  meta_template_id: string | null;
  category: WhatsAppTemplateCategory;
  language: string;
  status: WhatsAppTemplateStatus;
  rejection_reason: string | null;
  header_type: WhatsAppHeaderType;
  header_content: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: WhatsAppTemplateButton[];
  variable_mapping: Record<string, string>; // {"1": "paciente_nombre", "2": "fecha_cita"}
  sample_values: Record<string, string>;    // {"1": "Juan Pérez", "2": "17/03/2026"}
  submitted_at: string | null;
  reviewed_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppMessageLog {
  id: string;
  organization_id: string;
  template_id: string | null;
  recipient_phone: string;
  patient_id: string | null;
  appointment_id: string | null;
  wamid: string | null;
  status: WhatsAppMessageStatus;
  error_code: string | null;
  error_message: string | null;
  cost: number | null;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

// ── Meta Graph API Types ────────────────────────────────────────────────────

export interface MetaTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
    header_handle?: string[];
  };
  buttons?: MetaTemplateButtonComponent[];
}

export interface MetaTemplateButtonComponent {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[];
}

export interface MetaCreateTemplatePayload {
  name: string;
  language: string;
  category: WhatsAppTemplateCategory;
  components: MetaTemplateComponent[];
}

export interface MetaTemplateResponse {
  id: string;
  status: string;
  category: string;
}

export interface MetaSendMessagePayload {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components?: MetaMessageComponent[];
  };
}

export interface MetaMessageComponent {
  type: "header" | "body" | "button";
  parameters: MetaMessageParameter[];
  sub_type?: string;
  index?: number;
}

export interface MetaMessageParameter {
  type: "text" | "image" | "video" | "document";
  text?: string;
  image?: { link: string };
  video?: { link: string };
  document?: { link: string };
}

export interface MetaSendMessageResponse {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface MetaWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: { display_phone_number: string; phone_number_id: string };
      statuses?: Array<{
        id: string;
        status: "sent" | "delivered" | "read" | "failed";
        timestamp: string;
        recipient_id: string;
        errors?: Array<{ code: number; title: string }>;
      }>;
    };
    field: string;
  }>;
}

export interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

// ── Variable Mapping Constants ──────────────────────────────────────────────

export const WHATSAPP_VARIABLE_OPTIONS = [
  { value: "paciente_nombre", label: "Nombre del paciente" },
  { value: "paciente_dni", label: "DNI del paciente" },
  { value: "paciente_telefono", label: "Teléfono del paciente" },
  { value: "fecha_cita", label: "Fecha de la cita" },
  { value: "hora_cita", label: "Hora de la cita" },
  { value: "servicio", label: "Servicio" },
  { value: "doctor_nombre", label: "Nombre del doctor" },
  { value: "clinica_nombre", label: "Nombre de la clínica" },
  { value: "clinica_telefono", label: "Teléfono de la clínica" },
  { value: "monto_pagado", label: "Monto pagado" },
] as const;

export const WHATSAPP_LANGUAGES = [
  { code: "es", label: "Español" },
  { code: "es_PE", label: "Español (Perú)" },
  { code: "es_MX", label: "Español (México)" },
  { code: "es_AR", label: "Español (Argentina)" },
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "pt_BR", label: "Português (Brasil)" },
] as const;
