/**
 * Plugin registry — source of truth for which plugins exist.
 *
 * `org_plugins` rows reference plugins by `plugin_key`. The runtime
 * resolver (`active.ts`) looks the key up here to find the plugin's
 * metadata + render hook. Rows pointing at unknown keys are no-ops.
 *
 * To add a new plugin:
 *   1. Implement the render function (in `lib/budget-pdf/render-*.ts`
 *      or a per-plugin folder).
 *   2. Add an entry below with its key, addons, applies_to, defaults
 *      and the render adapter.
 *   3. Install on an org by inserting into `org_plugins` (founder UI
 *      at `/founder-dashboard/plugins`).
 */

import { renderBudgetHtmlPdf } from "@/lib/budget-pdf/render-html";
import {
  resolveVitraConfig,
  VITRA_DEFAULT_CONFIG,
} from "@/lib/budget-pdf/data/vitra-overrides";
import type { Plugin } from "./types";

// ── budget_pdf_vitra ──────────────────────────────────────────────
// First Capa-2 PDF plugin. Wraps the per-treatment Handlebars
// templates (FIV / CRIO / IIU / TED) + the Vitra brand defaults.
// Expand `applies_to.treatment_types` as we ship OVODON / ROPA / etc.
// templates (each one is a new .hbs + data file + router entry in
// render-html.ts, but the plugin key stays the same — Vitra's row in
// org_plugins doesn't need to be touched when we widen coverage).
const budgetPdfVitra: Plugin = {
  family: "budget_pdf",
  key: "budget_pdf_vitra",
  name: "Presupuestos Vitra",
  description:
    "Templates HTML personalizados para NATURVITRA S.A.C. (FIV, CRIO, IIU, TED, DUO STIM, ROPA y Ovodonación+NGS).",
  requires_addons: ["fertility_basic", "fertility_premium"],
  applies_to: {
    treatment_types: [
      "FIV",
      "CRIO",
      "IIU",
      "TED",
      "DUOSTIM",
      "ROPA",
      "OVODONACION",
    ],
  },
  default_config: VITRA_DEFAULT_CONFIG as unknown as Record<string, unknown>,
  // Contact data resolves: explicit JSONB config → real org data
  // (organizations.*, editable in Ajustes) → empty. Never seeded.
  render: (props, config) =>
    renderBudgetHtmlPdf(props, resolveVitraConfig(config, props.org)),
};

export const PLUGINS: Record<string, Plugin> = {
  [budgetPdfVitra.key]: budgetPdfVitra,
};

/**
 * Convenience accessor — returns `undefined` if the key isn't known
 * to the runtime (safe for org_plugins rows with stale keys).
 */
export function getPluginByKey(key: string): Plugin | undefined {
  return PLUGINS[key];
}
