/**
 * Conversaciones (bandeja de WhatsApp, mig 275) — tipos y reglas que usan
 * igual el navegador y el servidor. Sin imports de servidor.
 */

/** Ventana de atención de Meta: texto libre solo dentro de 24 h desde el
 *  último mensaje de la paciente. Fuera de ella, solo plantillas. Es un
 *  INSTANTE (no una fecha civil): comparar contra Date.now() es correcto. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function windowExpiresAt(lastInboundAt: string | null | undefined): number | null {
  if (!lastInboundAt) return null;
  const t = new Date(lastInboundAt).getTime();
  return Number.isFinite(t) ? t + SERVICE_WINDOW_MS : null;
}

export function isWindowOpen(lastInboundAt: string | null | undefined, now: number = Date.now()): boolean {
  const exp = windowExpiresAt(lastInboundAt);
  return exp !== null && exp > now;
}

export type InboxDirection = "in" | "out" | "internal";
export type InboxMessageStatus =
  | "received"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "unknown";

export interface InboxMessage {
  id: string;
  conversation_id: string;
  direction: InboxDirection;
  source: string;
  type: string;
  body: string | null;
  template_name: string | null;
  media_mime: string | null;
  media_caption: string | null;
  meta_media_id: string | null;
  status: InboxMessageStatus;
  error_title: string | null;
  sent_by: string | null;
  ts: string;
}

export const INBOX_MESSAGE_COLUMNS =
  "id, conversation_id, direction, source, type, body, template_name, media_mime, media_caption, meta_media_id, status, error_title, sent_by, ts";

export interface InboxConversation {
  id: string;
  phone_normalized: string | null;
  display_name: string | null;
  patient_id: string | null;
  inbox_status: "open" | "closed";
  last_message_at: string;
  last_inbound_at: string | null;
  last_message_preview: string | null;
  last_message_dir: InboxDirection | null;
  unread_count: number;
  first_referral_headline: string | null;
  /** Cambia con cada escritura (mig 275/277): llave del sondeo por diferencias. */
  updated_at: string;
}

export const INBOX_CONVERSATION_COLUMNS =
  "id, phone_normalized, display_name, patient_id, inbox_status, last_message_at, last_inbound_at, last_message_preview, last_message_dir, unread_count, first_referral_headline, updated_at";

/** Orden de los estados de un saliente: un estado nunca retrocede
 *  (Meta no garantiza el orden de los webhooks). */
export const STATUS_RANK: Record<InboxMessageStatus, number> = {
  received: 0,
  unknown: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
};

/** Texto corto para la lista y para la IA cuando el mensaje no es texto. */
export function messagePreview(m: { type: string; body: string | null; media_caption?: string | null }): string {
  if (m.body && m.body.trim()) return m.body.trim();
  if (m.media_caption && m.media_caption.trim()) return m.media_caption.trim();
  const labels: Record<string, string> = {
    image: "📷 Foto",
    audio: "🎤 Nota de voz",
    video: "🎬 Video",
    document: "📄 Documento",
    sticker: "Sticker",
    location: "📍 Ubicación",
    contacts: "👤 Contacto",
    reaction: "Reacción",
    template: "Plantilla",
  };
  return labels[m.type] ?? `[${m.type}]`;
}

/** Iniciales para el avatar. */
export function initialsOf(name: string | null | undefined, fallback = "?"): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  return ((parts[0][0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** "+51 987 654 321" para mostrar. */
export function formatWaPhone(digits: string | null | undefined): string {
  if (!digits) return "";
  const d = digits.replace(/\D/g, "");
  if (d.startsWith("51") && d.length === 11) return `+51 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return `+${d}`;
}

/** Offset (ms) de una zona horaria en un instante dado. */
function tzOffsetMs(tz: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - at;
}

/**
 * "2026-10-05" + "09:30" en la hora de la CLÍNICA → instante ISO. Los
 * programados se eligen en el reloj de la org (CLAUDE.md: nunca el del
 * navegador ni UTC). Dos pasadas para cubrir cambios de horario.
 */
export function orgLocalToIso(ymd: string, hm: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  const t = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!m || !t) return null;
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]));
  let at = naive - tzOffsetMs(tz, naive);
  at = naive - tzOffsetMs(tz, at);
  return new Date(at).toISOString();
}
