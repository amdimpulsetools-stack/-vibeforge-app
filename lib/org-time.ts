/**
 * Fecha/hora "civil" de una organización — UNA fuente para el "hoy" de la org.
 *
 * Problema (mig 240): Vercel corre en UTC. `new Date()` / `toISOString()` en
 * el servidor (y en cliente `toISOString()` también convierte a UTC) hacen
 * que a partir de las 19:00 hora Lima el sistema crea que ya es "mañana":
 * el dashboard pedía los ingresos del día siguiente y las pantallas de cobro
 * estampaban `payment_date` de mañana. Ya había parches locales fijos a Lima
 * (lib/einvoice/mapper.ts todayInLima, farmacia/types.ts, crons); este módulo
 * los generaliza a la zona horaria de CADA org (organizations.timezone).
 *
 * - `todayInTz(tz)`  → "yyyy-MM-dd" del día civil en la zona de la org.
 * - `zonedNow(tz)`   → un Date cuyos campos LOCALES (getFullYear/getMonth/
 *                       getDate/getHours…) reproducen el reloj de pared de la
 *                       org. Sirve para date-fns (startOfMonth, subDays…) en
 *                       el servidor. NO es un instante real: no lo conviertas
 *                       con toISOString().
 *
 * Isomórfico (Intl, sin dependencias) — se usa en Server Components, rutas
 * API y componentes cliente.
 */

export const DEFAULT_ORG_TIMEZONE = "America/Lima";

/** Zonas ofrecidas en Ajustes. IANA; cualquier otra válida se acepta igual. */
export const ORG_TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "America/Lima", label: "Perú (Lima) · UTC−5" },
  { value: "America/Bogota", label: "Colombia (Bogotá) · UTC−5" },
  { value: "America/Guayaquil", label: "Ecuador (Guayaquil) · UTC−5" },
  { value: "America/Panama", label: "Panamá · UTC−5" },
  { value: "America/Mexico_City", label: "México (Ciudad de México) · UTC−6" },
  { value: "America/Guatemala", label: "Guatemala · UTC−6" },
  { value: "America/Costa_Rica", label: "Costa Rica · UTC−6" },
  { value: "America/El_Salvador", label: "El Salvador · UTC−6" },
  { value: "America/La_Paz", label: "Bolivia (La Paz) · UTC−4" },
  { value: "America/Caracas", label: "Venezuela (Caracas) · UTC−4" },
  { value: "America/Santo_Domingo", label: "Rep. Dominicana · UTC−4" },
  { value: "America/Santiago", label: "Chile (Santiago) · UTC−4/−3" },
  { value: "America/Asuncion", label: "Paraguay (Asunción) · UTC−4/−3" },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires) · UTC−3" },
  { value: "America/Montevideo", label: "Uruguay (Montevideo) · UTC−3" },
  { value: "America/Sao_Paulo", label: "Brasil (São Paulo) · UTC−3" },
  { value: "America/New_York", label: "EE. UU. (Este) · UTC−5/−4" },
  { value: "America/Los_Angeles", label: "EE. UU. (Pacífico) · UTC−8/−7" },
  { value: "Europe/Madrid", label: "España (Madrid) · UTC+1/+2" },
];

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Zona de la org con fallback seguro (columna nula, org vieja, valor corrupto). */
export function resolveOrgTimezone(raw: unknown): string {
  return isValidTimeZone(raw) ? raw : DEFAULT_ORG_TIMEZONE;
}

/** "yyyy-MM-dd" del día civil en `tz` para el instante `at` (default: ahora). */
export function todayInTz(tz: string, at: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveOrgTimezone(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA produce "YYYY-MM-DD" directamente.
  return fmt.format(at);
}

/**
 * Date con campos locales = reloj de pared de la org en el instante `at`.
 * Para aritmética de calendario con date-fns en el servidor (que corre en
 * UTC): `format(zonedNow(tz), "yyyy-MM-dd")`, `startOfMonth(zonedNow(tz))`…
 */
export function zonedNow(tz: string, at: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveOrgTimezone(tz),
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return new Date(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
}
