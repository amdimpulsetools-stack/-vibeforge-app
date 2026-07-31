/**
 * Plugin system — shared types.
 *
 * A "plugin" is a per-org opt-in to ultra-specific behavior that
 * doesn't belong in the global product surface. The first family is
 * Budget PDF plugins (custom templates for Vitra, Patricia, etc.);
 * future families can add their own discriminated shapes here.
 *
 * Plugins are curated by founders (the `org_plugins` table has
 * founder-only RLS on writes). Org admins do not see them in their
 * own UI — they are installed from `/founder-dashboard/plugins`.
 */

import type { BudgetPdfProps } from "@/lib/budget-pdf/document";

export type AddonRequirement = "fertility_basic" | "fertility_premium";

export type BudgetTreatmentType =
  | "FIV"
  | "IIU"
  | "INDUCCION"
  | "CRIO"
  | "TED"
  | "OVODONACION"
  | "ROPA"
  | "OTRO";

/**
 * Common metadata every plugin declares so the founder install UI
 * (and the runtime resolver) can introspect it.
 */
export interface PluginMeta {
  /** Stable registry key, conventionally `<domain>_<vendor>` e.g. `budget_pdf_vitra`. */
  key: string;
  name: string;
  description: string;
  /**
   * Org must have at least one of these addons active for the plugin
   * to be applicable at runtime. Empty array → no addon dependency.
   */
  requires_addons: AddonRequirement[];
}

/**
 * Family 1 — Budget PDF plugins. Each plugin owns the rendering of
 * one or more treatment types for the orgs that have it installed.
 * The resolver picks the FIRST matching plugin per request; we don't
 * support chaining multiple plugins for the same (org, treatment).
 */
export interface BudgetPdfPlugin extends PluginMeta {
  family: "budget_pdf";
  applies_to: {
    /**
     * Treatment types this plugin can render. Undefined = all.
     * Use the narrow subset that has templates implemented today
     * (e.g. ["FIV"] for budget_pdf_vitra until IIU/Ovodon land).
     */
    treatment_types?: BudgetTreatmentType[];
  };
  /**
   * Shape-agnostic default config. The org's installed row may
   * override any subset of these fields; merged at render time.
   */
  default_config: Record<string, unknown>;
  /**
   * Render hook. Receives the upstream props plus the merged config
   * (defaults overridden by the org's persisted JSONB). Returns the
   * final PDF buffer that gets uploaded to storage.
   */
  render: (
    props: BudgetPdfProps & { budgetId: string },
    config: Record<string, unknown>,
  ) => Promise<Buffer>;
}

/**
 * Discriminated union — extend with new families (whatsapp templates,
 * e-invoice formats, etc.) by adding more variants here and routing
 * on `family` in the resolver.
 */
export type Plugin = BudgetPdfPlugin;

/**
 * The runtime view of an installed plugin: the registry entry plus
 * the org's persisted config merged on top of the defaults.
 */
export interface ActivePlugin<T extends Plugin = Plugin> {
  plugin: T;
  config: Record<string, unknown>;
}
