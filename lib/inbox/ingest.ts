import type { SupabaseClient } from "@supabase/supabase-js";
import type { CapturedInbound } from "@/lib/whatsapp/capture";
import type { StatusUpdate } from "@/lib/whatsapp/webhook";
import type { MetaWebhookPayload } from "@/lib/whatsapp/types";
import { STATUS_RANK, messagePreview, type InboxMessageStatus } from "./shared";

/**
 * Ingesta de la bandeja (mig 275), llamada desde el webhook existente.
 * TODO es best-effort: un error aquí (o la 275 sin aplicar) se registra
 * y jamás afecta a la captura F1 ni a los estados de recordatorios.
 */

export async function mirrorInboundToInbox(
  admin: SupabaseClient,
  orgId: string,
  conversationId: string,
  msg: CapturedInbound,
): Promise<void> {
  try {
    const { data, error } = await admin
      .from("wa_messages")
      .upsert(
        {
          organization_id: orgId,
          conversation_id: conversationId,
          direction: "in",
          source: "patient",
          wamid: msg.wamid,
          type: msg.type || "text",
          body: msg.inboxBody ?? msg.body,
          reply_to_wamid: msg.replyToWamid ?? null,
          meta_media_id: msg.mediaId ?? null,
          media_mime: msg.mediaMime ?? null,
          media_caption: msg.mediaCaption ?? null,
          status: "received",
          ts: msg.receivedAt,
        },
        { onConflict: "wamid", ignoreDuplicates: true },
      )
      .select("id");
    if (error) {
      if (!isMissingRelation(error)) console.error("[Bandeja] espejo de entrante falló:", error.message);
      return;
    }
    const inserted = (data ?? [])[0] as { id: string } | undefined;
    // Contador de no leídos solo para filas realmente nuevas: el upsert
    // ignora duplicados, así un reintento de Meta no suma dos veces.
    if (inserted) {
      await admin.rpc("wa_inbox_touch", {
        p_conversation: conversationId,
        p_message: inserted.id,
        p_dir: "in",
        p_ts: msg.receivedAt,
        p_preview: messagePreview({ type: msg.type, body: msg.inboxBody ?? msg.body, media_caption: msg.mediaCaption }),
      });
    }
  } catch (err) {
    console.error("[Bandeja] espejo de entrante (excepción):", err);
  }
}

/**
 * Estados (sent / delivered / read / failed) sobre los salientes de la
 * bandeja. Independiente de whatsapp_message_logs (recordatorios), que
 * el webhook sigue actualizando igual que antes. Monótono: un 'delivered'
 * que llega después de un 'read' no lo retrocede.
 */
export async function applyInboxStatuses(admin: SupabaseClient, updates: StatusUpdate[]): Promise<void> {
  for (const u of updates) {
    try {
      let { data: row, error } = await admin
        .from("wa_messages")
        .select("id, status, wamid")
        .eq("wamid", u.wamid)
        .maybeSingle();
      if (error) {
        if (isMissingRelation(error)) return; // 275 sin aplicar: nada que hacer
        continue;
      }
      // Timeout al enviar: la fila quedó sin wamid ('unknown'). Meta nos
      // devuelve el id de la fila (generado por el servidor, no por el
      // navegador) en biz_opaque_callback_data.
      if (!row && u.callbackData && /^[0-9a-f-]{36}$/i.test(u.callbackData)) {
        const { data: byCallback } = await admin
          .from("wa_messages")
          .select("id, status, wamid")
          .eq("id", u.callbackData)
          .eq("direction", "out")
          .is("wamid", null)
          .maybeSingle();
        row = byCallback;
      }
      if (!row) continue; // es un recordatorio u otro envío: no es de la bandeja

      const next = u.status as InboxMessageStatus;
      const current = row.status as InboxMessageStatus;
      const at = new Date(parseInt(u.timestamp, 10) * 1000).toISOString();
      const patch: Record<string, unknown> = {};
      if (!row.wamid) patch.wamid = u.wamid;
      if ((STATUS_RANK[next] ?? 0) > (STATUS_RANK[current] ?? 0) || current === "unknown") {
        patch.status = next;
      }
      if (next === "sent") patch.sent_at = at;
      if (next === "delivered") patch.delivered_at = at;
      if (next === "read") patch.read_at = at;
      if (next === "failed") {
        patch.failed_at = at;
        patch.error_code = u.errorCode ?? null;
        patch.error_title = u.errorTitle ?? null;
      }
      if (Object.keys(patch).length > 0) {
        await admin.from("wa_messages").update(patch).eq("id", row.id);
      }
    } catch (err) {
      console.error("[Bandeja] estado no aplicado:", err);
    }
  }
}

function isMissingRelation(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

/**
 * Coexistence: lo que recepción escribe desde la app WhatsApp Business del
 * celular llega como `smb_message_echoes`. Se refleja en el hilo como
 * saliente (source 'business_app_echo') para que la bandeja muestre la
 * conversación completa y el aviso de "hilo cambió" lo tenga en cuenta.
 *
 * Solo en conversaciones que YA existen: no crea conversaciones de origen
 * saliente (los cohortes de Captación se mantienen). Idempotente por wamid.
 * Best-effort: nunca rompe el webhook.
 */
export async function mirrorEchoesToInbox(admin: SupabaseClient, payload: MetaWebhookPayload): Promise<number> {
  if (payload.object !== "whatsapp_business_account") return 0;
  const echoes: Array<{ phoneNumberId: string; to: string; wamid: string; ts: string; type: string; body: string | null; mediaId: string | null; mediaMime: string | null; caption: string | null }> = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "smb_message_echoes") continue;
      for (const e of change.value.message_echoes ?? []) {
        if (!e?.id || !e.to) continue;
        const media = e.image ?? e.audio ?? e.video ?? e.document ?? e.sticker ?? null;
        echoes.push({
          phoneNumberId: change.value.metadata?.phone_number_id ?? "",
          to: e.to.replace(/\D/g, ""),
          wamid: e.id,
          ts: new Date(parseInt(e.timestamp, 10) * 1000).toISOString(),
          type: e.type,
          body: e.text?.body ?? e.interactive?.button_reply?.title ?? e.reaction?.emoji ?? null,
          mediaId: media?.id ?? null,
          mediaMime: media?.mime_type ?? null,
          caption: media?.caption ?? null,
        });
      }
    }
  }
  if (echoes.length === 0) return 0;

  let mirrored = 0;
  try {
    const phoneIds = [...new Set(echoes.map((e) => e.phoneNumberId).filter(Boolean))];
    const { data: configs } = await admin
      .from("whatsapp_config")
      .select("organization_id, phone_number_id")
      .in("phone_number_id", phoneIds)
      .eq("is_active", true);
    const orgByPhoneId = new Map((configs ?? []).map((c) => [c.phone_number_id as string, c.organization_id as string]));

    for (const e of echoes) {
      const orgId = orgByPhoneId.get(e.phoneNumberId);
      if (!orgId) continue;
      const { data: conv } = await admin
        .from("wa_conversations")
        .select("id")
        .eq("organization_id", orgId)
        .eq("phone_normalized", e.to)
        .maybeSingle();
      if (!conv) continue;
      const { data, error } = await admin
        .from("wa_messages")
        .upsert(
          {
            organization_id: orgId,
            conversation_id: conv.id,
            direction: "out",
            source: "business_app_echo",
            type: e.type,
            wamid: e.wamid,
            body: e.body,
            meta_media_id: e.mediaId,
            media_mime: e.mediaMime,
            media_caption: e.caption,
            status: "sent",
            ts: e.ts,
          },
          { onConflict: "wamid", ignoreDuplicates: true },
        )
        .select("id");
      if (error) {
        if (isMissingRelation(error)) return mirrored;
        console.error("[Bandeja] eco de la app del celular falló:", error.message);
        continue;
      }
      const inserted = (data ?? [])[0] as { id: string } | undefined;
      if (!inserted) continue;
      mirrored++;
      await admin.rpc("wa_inbox_touch", {
        p_conversation: conv.id,
        p_message: inserted.id,
        p_dir: "out",
        p_ts: e.ts,
        p_preview: messagePreview({ type: e.type, body: e.body, media_caption: e.caption }),
      });
    }
  } catch (err) {
    console.error("[Bandeja] ecos (excepción):", err);
  }
  return mirrored;
}
