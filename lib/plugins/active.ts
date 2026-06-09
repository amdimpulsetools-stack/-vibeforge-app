/**
 * Runtime resolver — given (org, treatment) returns the active
 * plugin for that combination, or `null` to fall back to Capa 1.
 *
 * Flow:
 *   1. Fetch all enabled `org_plugins` rows for the org.
 *   2. For each row whose key is in the registry, check addon
 *      requirements and applicability.
 *   3. Return the FIRST matching plugin + its merged config. We
 *      don't support chaining multiple Capa-2 plugins for the same
 *      (org, treatment) — that would invite undefined precedence.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPluginByKey } from "./registry";
import type {
  ActivePlugin,
  AddonRequirement,
  BudgetPdfPlugin,
  BudgetTreatmentType,
} from "./types";

interface OrgPluginRow {
  plugin_key: string;
  config: Record<string, unknown> | null;
}

interface OrgAddonRow {
  addon_key: string;
}

async function orgHasAnyAddon(
  client: SupabaseClient,
  orgId: string,
  required: AddonRequirement[],
): Promise<boolean> {
  if (required.length === 0) return true;
  const { data } = await client
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", orgId)
    .eq("enabled", true)
    .in("addon_key", required)
    .limit(1);
  return ((data as OrgAddonRow[] | null) ?? []).length > 0;
}

/**
 * Returns the active Budget PDF plugin for the (org, treatment),
 * or null if there's no installed/applicable plugin (→ Capa 1).
 *
 * Pass an admin client — `org_plugins` reads work for any active
 * member of the org, but addon-check goes through `organization_addons`
 * which is also org-scoped; using admin avoids tangling with the
 * caller's RLS for routes that run with elevated privileges (the
 * budget PDF endpoint already uses an admin client downstream).
 */
export async function getActiveBudgetPdfPlugin(
  client: SupabaseClient,
  orgId: string,
  treatmentType: BudgetTreatmentType,
): Promise<ActivePlugin<BudgetPdfPlugin> | null> {
  const { data: rows } = await client
    .from("org_plugins")
    .select("plugin_key, config")
    .eq("organization_id", orgId)
    .eq("enabled", true);

  for (const row of (rows as OrgPluginRow[] | null) ?? []) {
    const plugin = getPluginByKey(row.plugin_key);
    if (!plugin || plugin.family !== "budget_pdf") continue;

    const hasAddon = await orgHasAnyAddon(
      client,
      orgId,
      plugin.requires_addons,
    );
    if (!hasAddon) continue;

    if (
      plugin.applies_to.treatment_types &&
      !plugin.applies_to.treatment_types.includes(treatmentType)
    ) {
      continue;
    }

    return { plugin, config: row.config ?? {} };
  }

  return null;
}
