import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Una persona manda" (regla dura 2 de Flows, mig 281): cualquier mensaje
 * enviado por alguien del equipo (desde Yenda o desde la app del celular)
 * pausa el bot N horas y cierra el run en curso. Módulo sin dependencias
 * para que send.ts e ingest.ts lo llamen sin ciclos. Best-effort y
 * tolerante a la 281 sin aplicar.
 */
export async function pauseBotForHuman(
  admin: SupabaseClient,
  orgId: string,
  conversationId: string,
  reason: "persona" | "aviso" | "manual" = "persona",
  hours?: number,
): Promise<void> {
  try {
    let h = hours;
    if (h == null) {
      const { data } = await admin.from("wa_inbox_settings").select("flows_pause_hours").eq("organization_id", orgId).maybeSingle();
      h = (data?.flows_pause_hours as number | undefined) ?? 12;
    }
    const until = new Date(Date.now() + Math.max(1, Math.min(168, h)) * 3600_000).toISOString();
    const { error } = await admin.from("wa_conversations").update({ bot_paused_until: until }).eq("id", conversationId).eq("organization_id", orgId);
    if (error) return; // 281 sin aplicar
    await admin
      .from("wa_flow_runs")
      .update({ status: "handed_off", ended_at: new Date().toISOString(), end_reason: reason, wake_at: null, claimed_at: null })
      .eq("conversation_id", conversationId)
      .in("status", ["running", "waiting_reply", "waiting_delay"]);
  } catch {
    /* best-effort */
  }
}

export async function resumeBot(admin: SupabaseClient, orgId: string, conversationId: string): Promise<void> {
  await admin.from("wa_conversations").update({ bot_paused_until: null }).eq("id", conversationId).eq("organization_id", orgId);
}
