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
