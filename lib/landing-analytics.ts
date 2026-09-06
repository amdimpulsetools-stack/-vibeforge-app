import { track } from "@vercel/analytics";

/**
 * Eventos de la landing (brief ítem 7). Tres, ni uno más: los que contestan
 * "¿el tráfico de LinkedIn pide demo o se registra solo, y con qué perfil?".
 *
 * `track` de @vercel/analytics ya está montado en app/layout.tsx (<Analytics />).
 * Se envuelve en try/catch porque el script se bloquea con cualquier ad-blocker
 * y una excepción dentro de un onClick cancelaría la navegación del CTA: nunca
 * se pierde un clic por culpa de la medición.
 */
export type LandingEvent =
  | "cta_demo_click"
  | "cta_trial_click"
  | "perfil_select";

export function trackLanding(
  event: LandingEvent,
  props?: Record<string, string>
): void {
  try {
    track(event, props);
  } catch {
    // medición best-effort: el CTA sigue navegando
  }
}
