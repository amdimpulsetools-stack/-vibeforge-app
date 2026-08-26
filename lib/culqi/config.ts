// Configuración Culqi por organización (mig 229).
//
// Mismo modelo que NubeFact (lib/einvoice/index.ts): cada clínica
// conecta SU propia cuenta Culqi. La llave secreta se guarda cifrada
// AES-256-GCM (lib/encryption.ts) y SOLO se descifra aquí, server-side.
// JAMÁS loguear ni devolver la llave secreta al cliente.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/encryption";

export interface CulqiConfig {
  organizationId: string;
  /** Llave pública (pk_test_/pk_live_) — apta para el navegador. */
  publicKey: string;
  /** Llave secreta DESCIFRADA (sk_test_/sk_live_) — solo server-side. */
  secretKey: string;
  enabled: boolean;
  connectedAt: string | null;
}

interface CulqiConfigRow {
  organization_id: string;
  public_key: string;
  secret_key_encrypted: string;
  enabled: boolean;
  connected_at: string | null;
}

/** true si la llave pública es de modo test (pk_test_...). */
export function isTestPublicKey(publicKey: string): boolean {
  return publicKey.startsWith("pk_test_");
}

/**
 * Lee la config Culqi de una org con service role (bypassa RLS: la
 * usan rutas públicas y validaciones de staff no-admin). Devuelve la
 * llave secreta ya descifrada. `null` si la org nunca conectó Culqi.
 */
export async function loadCulqiConfig(
  organizationId: string
): Promise<CulqiConfig | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("culqi_config")
    .select("organization_id, public_key, secret_key_encrypted, enabled, connected_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as CulqiConfigRow;
  if (!row.public_key || !row.secret_key_encrypted) return null;

  return {
    organizationId: row.organization_id,
    publicKey: row.public_key,
    secretKey: decrypt(row.secret_key_encrypted),
    enabled: row.enabled,
    connectedAt: row.connected_at,
  };
}

/**
 * Como loadCulqiConfig pero solo devuelve configs habilitadas.
 * Es lo que usan la creación de links y el cobro público.
 */
export async function getEnabledCulqiConfig(
  organizationId: string
): Promise<CulqiConfig | null> {
  const config = await loadCulqiConfig(organizationId);
  if (!config || !config.enabled) return null;
  return config;
}

/**
 * Crea/actualiza la config Culqi de una org, cifrando la llave secreta.
 * Recibe el client del USUARIO (lib/supabase/server): la RLS de
 * culqi_config (solo owner/admin) es la que autoriza la escritura.
 * `secretKey` opcional en updates (mantener la llave guardada).
 */
export async function saveCulqiConfig(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    publicKey: string;
    secretKey?: string;
    enabled?: boolean;
    connectedBy?: string;
  }
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = {
    organization_id: params.organizationId,
    public_key: params.publicKey.trim(),
  };
  if (params.secretKey !== undefined) {
    payload.secret_key_encrypted = encrypt(params.secretKey.trim());
  }
  if (params.enabled !== undefined) payload.enabled = params.enabled;
  if (params.connectedBy !== undefined) {
    payload.connected_by = params.connectedBy;
    payload.connected_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("culqi_config")
    .upsert(payload, { onConflict: "organization_id" });

  // Nunca incluir llaves en el mensaje de error.
  return { error: error ? error.message : null };
}

/**
 * Desconecta Culqi: borra la fila completa (llave cifrada incluida).
 * Los payment_links y patient_payments existentes se conservan.
 */
export async function deleteCulqiConfig(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("culqi_config")
    .delete()
    .eq("organization_id", organizationId);
  return { error: error ? error.message : null };
}
