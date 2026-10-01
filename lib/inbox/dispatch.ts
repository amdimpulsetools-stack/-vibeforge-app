import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrgWhatsApp } from "./server";
import { sendFromInbox } from "./send";
import { isWindowOpen } from "./shared";

/**
 * Envía los programados vencidos (mig 275). La toma es atómica
 * (wa_claim_due_scheduled: FOR UPDATE SKIP LOCKED + status 'sending'),
 * así dos disparos simultáneos (cron + pestaña abierta) nunca envían dos
 * veces. El client_msg_id es el id del programado: aunque se reintente,
 * el UNIQUE de wa_messages impide el doble envío.
 *
 * Si al llegar la hora la ventana de 24 h se cerró y era texto libre,
 * NO se envía: queda 'needs_template' para que recepción elija plantilla.
 */
export async function dispatchDueScheduled(
  admin: SupabaseClient,
  opts: { orgId?: string | null; limit?: number } = {},
): Promise<{ claimed: number; sent: number; failed: number; needsTemplate: number }> {
  const { data: rows, error } = await admin.rpc("wa_claim_due_scheduled", {
    p_limit: opts.limit ?? 25,
    p_org: opts.orgId ?? null,
  });
  if (error || !rows) return { claimed: 0, sent: 0, failed: 0, needsTemplate: 0 };

  const due = rows as Array<{
    id: string;
    organization_id: string;
    conversation_id: string;
    kind: "text" | "template";
    body: string | null;
    template_id: string | null;
    template_vars: Record<string, string> | null;
    created_by: string | null;
  }>;
  let sent = 0;
  let failed = 0;
  let needsTemplate = 0;
  const clients = new Map<string, Awaited<ReturnType<typeof getOrgWhatsApp>>>();

  for (const s of due) {
    const { data: conv } = await admin
      .from("wa_conversations")
      .select("id, phone_normalized, last_inbound_at")
      .eq("id", s.conversation_id)
      .eq("organization_id", s.organization_id)
      .maybeSingle();
    if (!conv) {
      await admin.from("wa_scheduled_messages").update({ status: "failed", last_error: "Conversación no encontrada" }).eq("id", s.id);
      failed++;
      continue;
    }
    if (s.kind === "text" && !isWindowOpen(conv.last_inbound_at as string | null)) {
      await admin
        .from("wa_scheduled_messages")
        .update({ status: "needs_template", last_error: "La ventana de 24 h se cerró: elige una plantilla.", updated_at: new Date().toISOString() })
        .eq("id", s.id);
      needsTemplate++;
      continue;
    }
    if (!clients.has(s.organization_id)) clients.set(s.organization_id, await getOrgWhatsApp(admin, s.organization_id));
    const wa = clients.get(s.organization_id);
    if (!wa) {
      await admin.from("wa_scheduled_messages").update({ status: "failed", last_error: "WhatsApp no configurado" }).eq("id", s.id);
      failed++;
      continue;
    }
    const res = await sendFromInbox({
      admin,
      wa,
      orgId: s.organization_id,
      conversation: conv as { id: string; phone_normalized: string | null; last_inbound_at: string | null },
      kind: s.kind,
      body: s.body ?? undefined,
      templateId: s.template_id ?? undefined,
      templateVars: s.template_vars ?? undefined,
      clientMsgId: s.id,
      actorId: s.created_by,
      source: "scheduler",
      scheduledId: s.id,
    });
    if (res.ok) {
      await admin
        .from("wa_scheduled_messages")
        .update({ status: "sent", sent_message_id: res.messageId, last_error: null, updated_at: new Date().toISOString() })
        .eq("id", s.id);
      sent++;
    } else {
      await admin
        .from("wa_scheduled_messages")
        .update({ status: "failed", last_error: res.error.slice(0, 300), sent_message_id: res.messageId ?? null, updated_at: new Date().toISOString() })
        .eq("id", s.id);
      failed++;
    }
  }
  return { claimed: due.length, sent, failed, needsTemplate };
}
