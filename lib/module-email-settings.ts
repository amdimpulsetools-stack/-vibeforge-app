/**
 * Interruptor de los "consejos de uso" de los módulos.
 *
 * Vive en `organizations.settings.module_emails` (JSONB) y no en una tabla
 * ni en una columna nueva, por dos razones:
 *
 *   · es una preferencia de la ORGANIZACIÓN sobre correos que le mandamos
 *     nosotros, exactamente como `live_notifications` — mismo JSONB, misma
 *     forma de leerlo y de mergearlo;
 *   · no puede colgar de `cash_settings` (ahí viven los interruptores de
 *     Caja) porque los consejos también hablan de Almacén, y una org con
 *     Almacén y sin Caja no tiene fila donde guardarlo.
 *
 * ESPARSO Y ENCENDIDO POR DEFECTO: la ausencia de la clave significa
 * "encendido". Solo se persiste el apagado, así que una org que nunca tocó
 * nada tiene el JSONB limpio.
 *
 * Client-safe a propósito (sin server-only, sin Supabase): lo importan
 * tanto la pestaña de Ajustes como `lib/module-lifecycle-emails.ts`.
 */

export const MODULE_EMAIL_SETTINGS_KEY = "module_emails";

export interface ModuleEmailSettings {
  /** Consejos de uso / adopción. Ausente = encendido. */
  adoption_tips?: boolean;
}

export function readModuleEmailSettings(orgSettings: unknown): ModuleEmailSettings {
  if (!orgSettings || typeof orgSettings !== "object") return {};
  const block = (orgSettings as Record<string, unknown>)[MODULE_EMAIL_SETTINGS_KEY];
  if (!block || typeof block !== "object" || Array.isArray(block)) return {};
  return block as ModuleEmailSettings;
}

/** ¿Esta org quiere recibir los consejos de uso? Por defecto, sí. */
export function adoptionTipsEnabled(orgSettings: unknown): boolean {
  return readModuleEmailSettings(orgSettings).adoption_tips !== false;
}
