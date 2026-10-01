import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WhatsAppApiError, type WhatsAppClient } from "@/lib/whatsapp/client";
import { buildSendPayload, resolveVariableValues } from "@/lib/whatsapp/send";
import type { WhatsAppTemplate } from "@/lib/whatsapp/types";
import { isWindowOpen, messagePreview } from "./shared";

/**
 * Envío desde la bandeja (mig 275). Un solo camino para el composer, los
 * programados y (más adelante) la IA:
 *
 *   1. Reserva: INSERT de la fila con status 'sending' y client_msg_id
 *      UNIQUE por org. Un doble clic / reintento del navegador choca con
 *      el UNIQUE y devuelve la fila ya existente: jamás dos envíos.
 *   2. Meta: el id de la fila (uuid del servidor, único global) viaja como
 *      biz_opaque_callback_data, así un
 *      timeout de Graph se concilia solo cuando llegan los estados.
 *   3. Resultado: wamid + 'sent', o 'failed' con el motivo de Meta.
 *
 * Texto libre solo dentro de la ventana de 24 h (regla de Meta); fuera,
 * solo plantilla aprobada.
 */

export type SendKind = "text" | "template";

export interface SendParams {
  admin: SupabaseClient;
  wa: WhatsAppClient;
  orgId: string;
  conversation: {
    id: string;
    phone_normalized: string | null;
    last_inbound_at: string | null;
  };
  kind: SendKind;
  body?: string;
  templateId?: string;
  templateVars?: Record<string, string>;
  clientMsgId: string;
  actorId: string | null;
  source: "agent" | "scheduler";
  scheduledId?: string | null;
  aiSuggestionId?: string | null;
}

export type SendResult =
  | { ok: true; messageId: string; duplicate?: boolean }
  | { ok: false; status: number; error: string; code?: string; messageId?: string };

export async function sendFromInbox(p: SendParams): Promise<SendResult> {
  const { admin, wa, orgId, conversation } = p;
  const to = conversation.phone_normalized;
  if (!to) {
    return { ok: false, status: 422, error: "Esta conversación no tiene teléfono para responder.", code: "no_phone" };
  }

  let payload: Record<string, unknown>;
  let displayBody: string;
  let templateName: string | null = null;
  let templateLang: string | null = null;

  if (p.kind === "text") {
    const body = (p.body ?? "").trim();
    if (!body) return { ok: false, status: 400, error: "Mensaje vacío" };
    if (body.length > 4096) return { ok: false, status: 400, error: "Máximo 4.096 caracteres" };
    if (!isWindowOpen(conversation.last_inbound_at)) {
      return {
        ok: false,
        status: 409,
        code: "window_closed",
        error: "Pasaron más de 24 h desde el último mensaje de la paciente: solo se puede escribir con una plantilla aprobada.",
      };
    }
    payload = {
      recipient_type: "individual",
      to,
      type: "text",
      text: { body, preview_url: false },
    };
    displayBody = body;
  } else {
    if (!p.templateId) return { ok: false, status: 400, error: "Elige una plantilla" };
    const { data: template } = await admin
      .from("whatsapp_templates")
      .select("*")
      .eq("id", p.templateId)
      .eq("organization_id", orgId)
      .eq("status", "APPROVED")
      .maybeSingle();
    if (!template) {
      return { ok: false, status: 404, error: "Plantilla no encontrada o no aprobada por Meta" };
    }
    const tpl = template as unknown as WhatsAppTemplate;
    const values = resolveVariableValues(tpl, p.templateVars ?? {});
    try {
      payload = buildSendPayload(tpl, to, values) as unknown as Record<string, unknown>;
    } catch {
      return { ok: false, status: 422, error: "Teléfono inválido para WhatsApp", code: "invalid_phone" };
    }
    displayBody = (tpl.body_text ?? "").replace(/\{\{(\d+)\}\}/g, (_m, n: string) => values[n] ?? `{{${n}}}`);
    templateName = tpl.meta_template_name;
    templateLang = tpl.language;
  }
  // 1. Reserva (anti doble envío).
  const now = new Date().toISOString();
  const { data: claimed, error: claimErr } = await admin
    .from("wa_messages")
    .insert({
      organization_id: orgId,
      conversation_id: conversation.id,
      direction: "out",
      source: p.source,
      client_msg_id: p.clientMsgId,
      type: p.kind === "template" ? "template" : "text",
      body: displayBody,
      template_name: templateName,
      template_lang: templateLang,
      template_vars: p.kind === "template" ? (p.templateVars ?? {}) : null,
      status: "sending",
      sent_by: p.actorId,
      scheduled_id: p.scheduledId ?? null,
      ai_suggestion_id: p.aiSuggestionId ?? null,
      ts: now,
    })
    .select("id")
    .single();

  if (claimErr || !claimed) {
    if (claimErr?.code === "23505") {
      const { data: existing } = await admin
        .from("wa_messages")
        .select("id")
        .eq("organization_id", orgId)
        .eq("client_msg_id", p.clientMsgId)
        .maybeSingle();
      if (existing) return { ok: true, messageId: existing.id as string, duplicate: true };
    }
    return { ok: false, status: 500, error: "No se pudo registrar el mensaje" };
  }
  const messageId = claimed.id as string;
  payload.biz_opaque_callback_data = messageId;

  // 2. Meta.
  try {
    const res = await wa.sendMessage(payload);
    const wamid = res.messages?.[0]?.id ?? null;
    await admin
      .from("wa_messages")
      .update({ status: wamid ? "sent" : "unknown", wamid, sent_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("status", "sending");
    await admin.rpc("wa_inbox_touch", {
      p_conversation: conversation.id,
      p_message: messageId,
      p_dir: "out",
      p_ts: now,
      p_preview: messagePreview({ type: p.kind, body: displayBody }),
    });
    return { ok: true, messageId };
  } catch (err) {
    const code = err instanceof WhatsAppApiError ? String(err.code) : null;
    // Token vencido o sin permiso (190 = token inválido/expirado; 131005 =
    // acceso denegado; 10/200 = permiso faltante): la causa está en la
    // conexión, no en el mensaje. Se dice qué hacer en vez del texto crudo.
    const tokenProblem = code !== null && ["190", "131005", "10", "200"].includes(code);
    const title = tokenProblem
      ? `El token de WhatsApp venció o perdió permisos (#${code}). Reconecta en Ajustes → WhatsApp con un token permanente.`
      : err instanceof WhatsAppApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Error de Meta";
    // Un timeout de red no prueba que Meta no lo envió: queda 'unknown' y
    // el webhook de estados (biz_opaque_callback_data) lo concilia.
    const isNetwork = !(err instanceof WhatsAppApiError);
    await admin
      .from("wa_messages")
      .update({
        status: isNetwork ? "unknown" : "failed",
        failed_at: isNetwork ? null : new Date().toISOString(),
        error_code: code,
        error_title: title.slice(0, 300),
      })
      .eq("id", messageId);
    return { ok: false, status: 502, error: title, code: code ?? undefined, messageId };
  }
}
