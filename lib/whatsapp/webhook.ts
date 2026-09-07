import type { MetaWebhookPayload, WhatsAppMessageStatus } from "./types";

export interface StatusUpdate {
  wamid: string;
  status: WhatsAppMessageStatus;
  timestamp: string;
  recipientPhone: string;
  errorCode?: string;
  errorTitle?: string;
}

/**
 * Parses Meta webhook payload and extracts message status updates.
 */
export function parseWebhookStatusUpdates(
  payload: MetaWebhookPayload
): StatusUpdate[] {
  const updates: StatusUpdate[] = [];

  if (payload.object !== "whatsapp_business_account") {
    return updates;
  }

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const statuses = change.value.statuses;
      if (!statuses) continue;

      for (const status of statuses) {
        const update: StatusUpdate = {
          wamid: status.id,
          status: status.status,
          timestamp: status.timestamp,
          recipientPhone: status.recipient_id,
        };

        if (status.errors && status.errors.length > 0) {
          update.errorCode = String(status.errors[0].code);
          update.errorTitle = status.errors[0].title;
        }

        updates.push(update);
      }
    }
  }

  return updates;
}

/** Cambio de estado de una plantilla, avisado por Meta. */
export interface TemplateStatusUpdate {
  metaTemplateId: string | null;
  templateName: string;
  language: string | null;
  /** APPROVED | REJECTED | PENDING | PAUSED | DISABLED */
  status: string;
  reason?: string | null;
}

/**
 * Extrae los cambios de estado de plantilla (`message_template_status_update`).
 *
 * Hasta ahora el estado solo se refrescaba pulsando "Sincronizar" en cada
 * plantilla: Meta aprobaba en minutos y Yenda seguía diciendo "En revisión".
 * Requiere suscribir ese campo en la consola (WhatsApp → Configuración →
 * Webhooks → Administrar); sin suscripción esto simplemente no se dispara.
 */
export function parseTemplateStatusUpdates(
  payload: MetaWebhookPayload
): TemplateStatusUpdate[] {
  const updates: TemplateStatusUpdate[] = [];
  if (payload.object !== "whatsapp_business_account") return updates;

  for (const entry of payload.entry) {
    for (const change of entry.changes as unknown as Array<{
      field: string;
      value: Record<string, unknown>;
    }>) {
      if (change.field !== "message_template_status_update") continue;
      const v = change.value ?? {};
      const name = typeof v.message_template_name === "string" ? v.message_template_name : null;
      const event = typeof v.event === "string" ? v.event : null;
      if (!name || !event) continue;

      updates.push({
        metaTemplateId:
          v.message_template_id != null ? String(v.message_template_id) : null,
        templateName: name,
        language:
          typeof v.message_template_language === "string"
            ? v.message_template_language
            : null,
        status: event.toUpperCase(),
        reason: typeof v.reason === "string" && v.reason !== "NONE" ? v.reason : null,
      });
    }
  }

  return updates;
}

/**
 * Verifies the webhook subscription challenge from Meta.
 */
export function verifyWebhookChallenge(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  expectedToken: string
): { valid: boolean; challenge?: string } {
  if (mode === "subscribe" && token === expectedToken && challenge) {
    return { valid: true, challenge };
  }
  return { valid: false };
}
