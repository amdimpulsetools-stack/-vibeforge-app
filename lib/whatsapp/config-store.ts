import type { SupabaseClient } from "@supabase/supabase-js";
import { encrypt } from "@/lib/encryption";

/**
 * Camino ÚNICO de guardado de whatsapp_config.
 *
 * Tanto el wizard manual (PUT /api/whatsapp/config) como el Embedded
 * Signup de Meta (POST /api/whatsapp/embedded-signup) pasan por aquí:
 * un solo upsert por organization_id y un solo punto donde se cifran
 * los secretos (access_token y register_pin, AES-256-GCM vía
 * lib/encryption.ts). No dupliques esta lógica en las rutas.
 */

/** Centinela que la UI reenvía cuando el secreto guardado no cambia. */
export const MASKED_SECRET = "••••••••";

export interface WhatsAppConfigPatch {
  waba_id?: string;
  phone_number_id?: string;
  /** En claro — se cifra aquí. El centinela `MASKED_SECRET` se ignora. */
  access_token?: string;
  webhook_verify_token?: string;
  is_active?: boolean;
  // ── Embedded Signup (mig 234) ──
  connected_via?: "manual" | "embedded_signup";
  coexistence?: boolean;
  /** PIN de 6 dígitos en claro — se cifra aquí. */
  register_pin?: string;
  registration_status?: "registered" | "pending" | null;
  display_phone_number?: string | null;
  verified_name?: string | null;
  business_verified?: boolean;
}

export async function upsertWhatsAppConfig(
  supabase: SupabaseClient,
  organizationId: string,
  patch: WhatsAppConfigPatch
) {
  const payload: Record<string, unknown> = {
    organization_id: organizationId,
  };

  if (patch.waba_id !== undefined) payload.waba_id = patch.waba_id;
  if (patch.phone_number_id !== undefined) payload.phone_number_id = patch.phone_number_id;
  if (patch.access_token !== undefined && patch.access_token !== MASKED_SECRET) {
    payload.access_token = encrypt(patch.access_token);
  }
  if (patch.webhook_verify_token !== undefined) payload.webhook_verify_token = patch.webhook_verify_token;
  if (patch.is_active !== undefined) payload.is_active = patch.is_active;
  if (patch.connected_via !== undefined) payload.connected_via = patch.connected_via;
  if (patch.coexistence !== undefined) payload.coexistence = patch.coexistence;
  if (patch.register_pin !== undefined && patch.register_pin !== MASKED_SECRET) {
    payload.register_pin = encrypt(patch.register_pin);
  }
  if (patch.registration_status !== undefined) payload.registration_status = patch.registration_status;
  if (patch.display_phone_number !== undefined) payload.display_phone_number = patch.display_phone_number;
  if (patch.verified_name !== undefined) payload.verified_name = patch.verified_name;
  if (patch.business_verified !== undefined) payload.business_verified = patch.business_verified;

  return supabase
    .from("whatsapp_config")
    .upsert(payload, { onConflict: "organization_id" })
    .select()
    .single();
}

/**
 * Enmascara los secretos antes de devolver la fila al browser: el token
 * y el PIN cifrados jamás salen del servidor (ni siquiera cifrados).
 */
export function maskWhatsAppConfig<
  T extends { access_token?: string | null; register_pin?: string | null },
>(config: T): T {
  return {
    ...config,
    access_token: config.access_token ? MASKED_SECRET : null,
    register_pin: config.register_pin ? MASKED_SECRET : null,
  };
}
