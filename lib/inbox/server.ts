import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { WhatsAppClient } from "@/lib/whatsapp/client";

/**
 * Candados de toda ruta de la bandeja (mig 275), en orden:
 *   1. sesión válida,
 *   2. membresía ACTIVA,
 *   3. addon `captacion` (CRM WhatsApp + Captación),
 *   4. rol: doctor solo si la clínica activó "Doctores pueden ver
 *      Conversaciones" (wa_inbox_settings.doctors_enabled).
 * Recién entonces se escribe con service role (las tablas de mensajes
 * no tienen políticas de escritura para el navegador).
 */
export interface InboxContext {
  userId: string;
  orgId: string;
  role: string;
  isAdmin: boolean;
  admin: SupabaseClient;
  settings: InboxSettings;
}

export interface InboxSettings {
  doctors_enabled: boolean;
  ai_enabled: boolean;
  ai_model: "claude-haiku-4-5" | "claude-sonnet-5-5";
  ai_tone: "calido" | "formal";
  ai_use_emojis: boolean;
  ai_signature: string | null;
  ai_rules: string | null;
  ai_hidden_service_ids: string[];
  /** Guía de conversación (mig 276). {} = fórmula sugerida. */
  ai_playbook: Record<string, unknown>;
}

export const DEFAULT_INBOX_SETTINGS: InboxSettings = {
  doctors_enabled: false,
  ai_enabled: true,
  ai_model: "claude-haiku-4-5",
  ai_tone: "calido",
  ai_use_emojis: true,
  ai_signature: null,
  ai_rules: null,
  ai_hidden_service_ids: [],
  ai_playbook: {},
};

export async function requireInbox(req: Request): Promise<InboxContext | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // La org la manda el cliente (?org=, la que el usuario tiene abierta) y
  // aquí se exige membresía ACTIVA en ella. Nunca `.limit(1)` sin orden:
  // con dos clínicas elegiría una arbitraria (ver lib/followups/org-scope.ts).
  const requestedOrg = new URL(req.url).searchParams.get("org");
  let membersQuery = supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (requestedOrg) membersQuery = membersQuery.eq("organization_id", requestedOrg);
  const { data: members } = await membersQuery.limit(2);
  if (!members || members.length === 0) {
    return NextResponse.json({ error: "No perteneces a esta organización" }, { status: 403 });
  }
  if (members.length > 1) {
    return NextResponse.json({ error: "Falta indicar la organización" }, { status: 400 });
  }
  const member = members[0];

  const orgId = member.organization_id as string;
  const role = (member.role as string) ?? "member";
  const admin = createAdminClient();

  const [{ data: grant }, { data: settingsRow }] = await Promise.all([
    admin
      .from("organization_addons")
      .select("enabled")
      .eq("organization_id", orgId)
      .eq("addon_key", "captacion")
      .maybeSingle(),
    admin.from("wa_inbox_settings").select("*").eq("organization_id", orgId).maybeSingle(),
  ]);
  if (!grant?.enabled) {
    return NextResponse.json({ error: "addon_not_enabled" }, { status: 403 });
  }
  const settings: InboxSettings = { ...DEFAULT_INBOX_SETTINGS, ...(settingsRow ?? {}) };
  if (role === "doctor" && !settings.doctors_enabled) {
    return NextResponse.json({ error: "Sin acceso a Conversaciones" }, { status: 403 });
  }

  return {
    userId: user.id,
    orgId,
    role,
    isAdmin: role === "owner" || role === "admin",
    admin,
    settings,
  };
}

export function isInboxError(x: InboxContext | NextResponse): x is NextResponse {
  return x instanceof NextResponse;
}

/** Cliente de Meta de la org (token descifrado SOLO en el servidor). */
export async function getOrgWhatsApp(
  admin: SupabaseClient,
  orgId: string,
): Promise<WhatsAppClient | null> {
  const { data: config } = await admin
    .from("whatsapp_config")
    .select("access_token, waba_id, phone_number_id, is_active")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .maybeSingle();
  if (!config?.access_token || !config.waba_id || !config.phone_number_id) return null;
  return new WhatsAppClient({
    accessToken: decrypt(config.access_token as string),
    wabaId: config.waba_id as string,
    phoneNumberId: config.phone_number_id as string,
  });
}

/** La conversación existe y es de la org (nunca confiar en el id del cliente). */
export async function loadConversation(admin: SupabaseClient, orgId: string, conversationId: string) {
  const { data } = await admin
    .from("wa_conversations")
    .select("id, organization_id, phone_normalized, display_name, patient_id, last_inbound_at, last_message_id, inbox_status")
    .eq("id", conversationId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return data as
    | {
        id: string;
        organization_id: string;
        phone_normalized: string | null;
        display_name: string | null;
        patient_id: string | null;
        last_inbound_at: string | null;
        last_message_id: string | null;
        inbox_status: string;
      }
    | null;
}
