/**
 * Shared Tailwind class tokens for the clinical history modal family.
 *
 * Goal: every "Add / Create" action across the side panels (Prescriptions,
 * Exam Orders, Treatment Plans, Follow-ups) uses the same touch-friendly size
 * and prominence so the doctor can spot them in one glance and tap them
 * reliably even on a touchscreen.
 *
 * Sizing rationale:
 *  - h-9 (36px) for panel-level CTAs: dense EHR-friendly but well above the
 *    20–22px tap target the panels had before (failed WCAG 2.5.5 / 2.5.8).
 *  - h-11 (44px) for the global "Firmar nota" CTA: a stricter WCAG AA target
 *    plus extra prominence because firmar is irreversible.
 */

export const CLINICAL_PANEL_CTA =
  "inline-flex items-center justify-center gap-1.5 h-9 px-3.5 text-xs font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export const CLINICAL_PANEL_CTA_ICON = "h-4 w-4";

export const CLINICAL_PANEL_CTA_VARIANTS = {
  violet: "bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 dark:text-violet-400",
  cyan: "bg-cyan-500/10 text-cyan-600 hover:bg-cyan-500/20 dark:text-cyan-400",
  blue: "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400",
  red: "bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400",
} as const;

/** Primary save action — used by SOAP form and side-panel forms. */
export const CLINICAL_PRIMARY_CTA =
  "inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity";

/** Sign action — h-11 for stronger touch target + amber ring when ready. */
export const CLINICAL_SIGN_CTA =
  "inline-flex items-center justify-center gap-2 h-11 px-5 text-sm font-semibold rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 transition-colors shadow-sm";

/** Visual emphasis when "ready to sign" — adds a soft amber ring. */
export const CLINICAL_SIGN_CTA_READY =
  "ring-2 ring-amber-500/30 ring-offset-2 ring-offset-background";

/** Locked badge — amber communicates "blocked / attention" better than emerald. */
export const CLINICAL_SIGNED_BADGE =
  "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-amber-500/40 bg-amber-500/15 text-xs font-medium text-amber-700 dark:text-amber-300";
