import type { createClient } from "@/lib/supabase/server";
import { resolveOrgTimezone, todayInTz } from "@/lib/org-time";

type SupaClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Fechas civiles de la org para las tarjetas "Por reprogramar" (mig 273).
 *
 * Vercel corre en UTC: `toISOString().slice(0,10)` o `setHours(0,0,0,0)`
 * daban "mañana" a partir de las 19:00 Lima. Estas utilidades trabajan con
 * el día civil de `organizations.timezone` (lib/org-time.ts). Se usan SOLO
 * en la regla core.reschedule_pending; el resto de seguimientos conserva su
 * cálculo de siempre.
 */

/** Zona de la org (fallback America/Lima si falta o es inválida). */
export async function loadOrgTimezone(
  supabase: SupaClient,
  organizationId: string
): Promise<string> {
  const { data } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", organizationId)
    .maybeSingle();
  return resolveOrgTimezone(
    (data as { timezone?: string | null } | null)?.timezone
  );
}

/** "yyyy-MM-dd" + n días (aritmética de calendario pura, sin zona). */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const t = Date.parse(`${dateStr}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Reloj de pared de `tz` en el instante `at`, expresado como ms "UTC". */
function wallClockMs(tz: string, at: number): number {
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
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
}

/**
 * Instante ISO del mediodía civil de `dateStr` en `tz` (mismo criterio que
 * la mig 273 para `expected_by`: mediodía para que ningún corrimiento de
 * zona lo mueva de día).
 */
export function orgNoonIso(dateStr: string, tz: string): string {
  const guess = Date.parse(`${dateStr}T12:00:00Z`);
  const offset = wallClockMs(tz, guess) - guess;
  return new Date(guess - offset).toISOString();
}

/** Hoy civil de la org + n días, al mediodía de la org (ISO). */
export function orgDaysFromTodayNoonIso(tz: string, days: number): string {
  return orgNoonIso(addDaysToDateStr(todayInTz(tz), days), tz);
}

/**
 * Diferencia en días civiles (zona de la org) entre el instante `iso` y hoy.
 * Negativo = vencido; 0 = hoy.
 */
export function civilDaysFromToday(iso: string, tz: string): number {
  const target = todayInTz(tz, new Date(iso));
  const today = todayInTz(tz);
  return Math.round(
    (Date.parse(`${target}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000
  );
}

/** ¿El instante `iso` cae en el día civil de hoy de la org? */
export function isOrgToday(iso: string | null | undefined, tz: string): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return todayInTz(tz, new Date(t)) === todayInTz(tz);
}
