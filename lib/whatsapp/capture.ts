/**
 * Módulo Captación — Fase 1: el capturador silencioso.
 *
 * Hasta el 12-ago-2026 el webhook SOLO procesaba acuses de recibo y los
 * mensajes entrantes de pacientes se descartaban (un "confirmo" a un
 * recordatorio se perdía en el vacío). Esto los guarda — nada más:
 * no responde, no notifica, no toca la operación de la recepcionista.
 *
 * Captura para TODAS las orgs con número conectado, tengan o no el
 * addon `captacion`: el addon gobierna qué se VE (UI, Fase 2), no qué
 * se OYE. El dato no es retroactivo — cada día sin capturar se pierde,
 * y el teaser de venta se construye sobre este historial.
 *
 * Reglas duras:
 *   · Idempotencia por wamid: Meta reintenta webhooks, y con varias
 *     apps suscritas a la misma WABA cada una recibe su propio ciclo
 *     de reintentos. El UNIQUE en base + upsert ignorante lo absorbe.
 *   · Rápido y best-effort: el webhook debe responder 200 en seguida
 *     o Meta degrada la suscripción. Un fallo aquí se loguea y jamás
 *     rompe el procesamiento de statuses que ya existía.
 *   · El PRIMER referral se congela en la conversación: es la campaña
 *     que trajo a esta persona, aunque después escriba veinte veces.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetaWebhookPayload, MetaInboundMessage } from "./types";

export interface CapturedInbound {
  phoneNumberId: string; // número de la clínica (resuelve la org)
  wamid: string;
  fromPhone: string; // ya viene solo dígitos con código de país
  displayName: string | null;
  type: string;
  body: string | null;
  referral: MetaInboundMessage["referral"] | null;
  receivedAt: string; // ISO
}

/** Extrae los mensajes entrantes del payload (los statuses siguen su vía). */
export function parseInboundMessages(
  payload: MetaWebhookPayload,
): CapturedInbound[] {
  const out: CapturedInbound[] = [];
  if (payload.object !== "whatsapp_business_account") return out;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      const messages = value.messages;
      if (!messages || messages.length === 0) continue;

      const nameByWaId = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id && c.profile?.name) nameByWaId.set(c.wa_id, c.profile.name);
      }

      for (const msg of messages) {
        if (!msg.id || !msg.from) continue;
        // Texto plano cuando lo hay; para botones, el texto del botón;
        // multimedia guarda solo el tipo (el binario es asunto de Fase 3).
        const body =
          msg.text?.body ?? msg.button?.text ?? null;

        out.push({
          phoneNumberId: value.metadata?.phone_number_id ?? "",
          wamid: msg.id,
          fromPhone: msg.from.replace(/\D/g, ""),
          displayName: nameByWaId.get(msg.from) ?? null,
          type: msg.type || "text",
          body,
          referral: msg.referral ?? null,
          receivedAt: new Date(parseInt(msg.timestamp, 10) * 1000).toISOString(),
        });
      }
    }
  }
  return out;
}

/**
 * Persiste los mensajes capturados. Devuelve cuántos se guardaron
 * (los duplicados por reintento no cuentan y no son error).
 */
export async function persistInboundMessages(
  admin: SupabaseClient,
  captured: CapturedInbound[],
): Promise<number> {
  if (captured.length === 0) return 0;

  // phone_number_id → organización, una sola consulta para el lote.
  const phoneIds = [...new Set(captured.map((c) => c.phoneNumberId).filter(Boolean))];
  if (phoneIds.length === 0) return 0;

  const { data: configs } = await admin
    .from("whatsapp_config")
    .select("organization_id, phone_number_id")
    .in("phone_number_id", phoneIds);

  const orgByPhoneId = new Map(
    (configs ?? []).map((c) => [c.phone_number_id as string, c.organization_id as string]),
  );

  let saved = 0;
  for (const msg of captured) {
    const orgId = orgByPhoneId.get(msg.phoneNumberId);
    // Número no registrado en Yenda (p. ej. otra app compartiendo la
    // misma WABA): nada que hacer, no es nuestro.
    if (!orgId) continue;

    try {
      // Conversación por teléfono×org. El referral solo se escribe si
      // la conversación aún no tiene uno (primer contacto manda).
      const { data: existing } = await admin
        .from("wa_conversations")
        .select("id, first_referral_ad_id, display_name")
        .eq("organization_id", orgId)
        .eq("phone_normalized", msg.fromPhone)
        .maybeSingle();

      let conversationId: string;

      if (existing) {
        conversationId = existing.id as string;
        const patch: Record<string, unknown> = { last_message_at: msg.receivedAt };
        if (!existing.display_name && msg.displayName) {
          patch.display_name = msg.displayName;
        }
        if (!existing.first_referral_ad_id && msg.referral?.source_id) {
          patch.first_referral_ad_id = msg.referral.source_id;
          patch.first_referral_headline = msg.referral.headline ?? null;
          patch.first_referral_source = msg.referral.source_type ?? null;
          patch.first_referral_at = msg.receivedAt;
        }
        await admin.from("wa_conversations").update(patch).eq("id", conversationId);
      } else {
        const { data: created, error: convErr } = await admin
          .from("wa_conversations")
          .insert({
            organization_id: orgId,
            phone_normalized: msg.fromPhone,
            display_name: msg.displayName,
            first_referral_ad_id: msg.referral?.source_id ?? null,
            first_referral_headline: msg.referral?.headline ?? null,
            first_referral_source: msg.referral?.source_type ?? null,
            first_referral_at: msg.referral ? msg.receivedAt : null,
            last_message_at: msg.receivedAt,
          })
          .select("id")
          .single();

        if (convErr || !created) {
          // Carrera entre dos reintentos simultáneos: el UNIQUE ganó en
          // el otro; relee y sigue.
          const { data: raced } = await admin
            .from("wa_conversations")
            .select("id")
            .eq("organization_id", orgId)
            .eq("phone_normalized", msg.fromPhone)
            .maybeSingle();
          if (!raced) continue;
          conversationId = raced.id as string;
        } else {
          conversationId = created.id as string;
        }
      }

      // upsert ignorante sobre wamid = idempotencia ante reintentos.
      const { error: msgErr, count } = await admin
        .from("wa_inbound_messages")
        .upsert(
          {
            conversation_id: conversationId,
            organization_id: orgId,
            wamid: msg.wamid,
            message_type: msg.type,
            body: msg.body,
            referral_json: msg.referral ?? null,
            received_at: msg.receivedAt,
          },
          { onConflict: "wamid", ignoreDuplicates: true, count: "exact" },
        );

      if (!msgErr && (count ?? 0) > 0) saved++;
    } catch (err) {
      console.error("[Captación] Error capturando mensaje entrante:", err);
      // best-effort: seguir con el resto del lote
    }
  }

  return saved;
}
