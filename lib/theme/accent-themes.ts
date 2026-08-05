/**
 * Temas de acento por organización (mig 190 → `organizations.accent_theme`).
 *
 * ── Cómo funciona ─────────────────────────────────────────────────────
 * Tailwind 4 compila `bg-emerald-500` a
 * `background-color: var(--color-emerald-500)` y `bg-emerald-500/10` a
 * `color-mix(in oklab, var(--color-emerald-500) 10%, transparent)`. Es
 * decir: las ~850 clases emerald hardcodeadas del dashboard YA son
 * variables CSS. Redefinir las 11 custom properties de la escala + los 4
 * tokens shadcn de marca (--primary / --primary-foreground / --ring /
 * --glow-primary, por modo claro y oscuro) recolorea el dashboard entero
 * sin tocar una sola clase.
 *
 * ── Por qué `:root:root` ──────────────────────────────────────────────
 * Especificidad (0,2,0) y sin `@layer`, así que gana sobre `@layer theme`
 * (donde Tailwind define la escala) y sobre `:root`/`.dark` de
 * globals.css SIN depender del orden de inserción de las hojas de estilo.
 * `:root:root.dark` hace lo propio para el modo oscuro.
 *
 * ── Por qué `:root` y no un wrapper con data-attribute ────────────────
 * Los portales de Radix (Dialog, Popover, DropdownMenu, Sheet) y Sonner
 * se montan en `document.body`, fuera del árbol del layout. Un atributo
 * en el shell del dashboard dejaría todos los modales y toasts en verde.
 *
 * ── Seguridad ─────────────────────────────────────────────────────────
 * Los CSS de abajo son STRINGS LITERALES constantes. NUNCA se interpola
 * en ellos ningún dato que venga de la base o del usuario, y el consumidor
 * valida la clave contra `isAccentTheme()` antes de indexar el mapa. Por
 * eso el `dangerouslySetInnerHTML` del layout no es una vía de inyección.
 *
 * ── Lo que NO se temiza ───────────────────────────────────────────────
 * La escala `--color-success-*` (definida en app/globals.css) es verde
 * fijo: "pagado", "activo", "completado", "confirmado", "firmado" siguen
 * siendo verdes en Océano y en Arena. Igual que rojo = destructivo,
 * ámbar = advertencia, azul = informativo.
 * Tampoco se temizan: landing, /login y demás páginas de auth, emails,
 * PDFs y el portal público de reservas — cada uno tiene su propio color
 * y ninguno cuelga del layout del dashboard.
 */

export type AccentThemeKey = "emerald" | "ocean" | "sand";

export interface AccentThemeMeta {
  key: AccentThemeKey;
  /** Etiqueta visible en Settings. */
  label: string;
  /** Color del círculo de muestra en el selector (independiente del tema activo). */
  swatchColor: string;
  /** Una línea de descripción para el selector. */
  description: string;
}

export const DEFAULT_ACCENT_THEME: AccentThemeKey = "emerald";

/**
 * Metadata para la UI del selector. El orden es el orden en que se
 * pintan los swatches.
 */
export const ACCENT_THEMES: AccentThemeMeta[] = [
  {
    key: "emerald",
    label: "Esmeralda",
    swatchColor: "oklch(69.6% 0.17 162.48)",
    description: "El verde de siempre",
  },
  {
    key: "ocean",
    label: "Océano",
    swatchColor: "oklch(69.6% 0.165 237)",
    description: "Celeste sereno",
  },
  {
    key: "sand",
    label: "Arena",
    swatchColor: "oklch(69.6% 0.118 42)",
    description: "Terracota cálido",
  },
];

/**
 * Paleta "Océano" — base `sky` re-anclada a la curva de luminosidad de
 * emerald (mismos L que Tailwind usa para emerald-50..950), de modo que
 * cada shade pesa visualmente lo mismo que el verde al que sustituye y
 * ningún contraste texto/fondo se degrada.
 * Se eligió sky y no `blue` (309 usos de blue-* en el dashboard son
 * estado *informativo* y colisionarían) ni `cyan` (lee como teal, poco
 * diferenciado del esmeralda).
 * Contraste en oscuro ≈ 7.1:1 (AAA).
 */
const OCEAN_CSS = `:root:root{
--color-emerald-50:oklch(97.9% 0.014 236.6);
--color-emerald-100:oklch(95.0% 0.028 236.8);
--color-emerald-200:oklch(90.5% 0.059 233.0);
--color-emerald-300:oklch(84.5% 0.106 231.5);
--color-emerald-400:oklch(76.5% 0.152 233.5);
--color-emerald-500:oklch(69.6% 0.165 237.0);
--color-emerald-600:oklch(59.6% 0.157 241.5);
--color-emerald-700:oklch(50.8% 0.136 242.7);
--color-emerald-800:oklch(43.2% 0.108 241.0);
--color-emerald-900:oklch(37.8% 0.087 241.0);
--color-emerald-950:oklch(26.2% 0.060 243.2);
--primary:oklch(0.55 0.160 240);
--primary-foreground:oklch(0.98 0.005 240);
--ring:oklch(0.55 0.160 240);
--glow-primary:oklch(0.55 0.160 240 / 0.08);
}
:root:root.dark{
--primary:oklch(0.72 0.168 236);
--primary-foreground:oklch(0.10 0.035 236);
--ring:oklch(0.72 0.168 236);
--glow-primary:oklch(0.72 0.168 236 / 0.12);
}`;

/**
 * Paleta "Arena" — rampa de hue 84 → 31: el extremo claro es arena
 * desaturada y el medio/oscuro vira a terracota. Tiene precedente real
 * en el producto (el terracota de Vitra en
 * lib/budget-pdf/data/vitra-overrides.ts cae entre los shades 500-600).
 * Contraste en oscuro ≈ 7.4:1 (shade 500) / 5.1:1 (600).
 * En claro, `text-*-600` queda ≈3.7:1 — exactamente la misma paridad que
 * el esmeralda actual, así que no es una regresión, pero sí un ticket
 * aparte (subir a -700 en superficies claras).
 * Riesgo conocido: arena-500 (H42) es vecino del ámbar de advertencia
 * (H70); revisar visualmente badges de warning junto al acento.
 */
const SAND_CSS = `:root:root{
--color-emerald-50:oklch(97.9% 0.010 84.0);
--color-emerald-100:oklch(95.0% 0.020 82.0);
--color-emerald-200:oklch(90.5% 0.038 79.0);
--color-emerald-300:oklch(84.5% 0.060 72.0);
--color-emerald-400:oklch(76.5% 0.085 55.0);
--color-emerald-500:oklch(69.6% 0.118 42.0);
--color-emerald-600:oklch(59.6% 0.142 34.0);
--color-emerald-700:oklch(50.8% 0.132 31.0);
--color-emerald-800:oklch(43.2% 0.110 31.0);
--color-emerald-900:oklch(37.8% 0.090 32.0);
--color-emerald-950:oklch(26.2% 0.060 34.0);
--primary:oklch(0.55 0.140 36);
--primary-foreground:oklch(0.98 0.006 60);
--ring:oklch(0.55 0.140 36);
--glow-primary:oklch(0.55 0.140 36 / 0.08);
}
:root:root.dark{
--primary:oklch(0.72 0.115 45);
--primary-foreground:oklch(0.10 0.030 40);
--ring:oklch(0.72 0.115 45);
--glow-primary:oklch(0.72 0.115 45 / 0.12);
}`;

/**
 * CSS de override por tema. `emerald` es la cadena vacía a propósito:
 * es lo que globals.css ya define, así que el default no inyecta nada.
 */
export const ACCENT_CSS: Record<AccentThemeKey, string> = {
  emerald: "",
  ocean: OCEAN_CSS,
  sand: SAND_CSS,
};

/** Type guard: ¿este valor de la BD es una clave de tema conocida? */
export function isAccentTheme(value: unknown): value is AccentThemeKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(ACCENT_CSS, value)
  );
}

/** Normaliza cualquier valor a una clave válida (fallback: esmeralda). */
export function resolveAccentTheme(value: unknown): AccentThemeKey {
  return isAccentTheme(value) ? value : DEFAULT_ACCENT_THEME;
}
