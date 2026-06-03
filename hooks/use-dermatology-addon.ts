"use client";

import { useOrgAddons } from "@/hooks/use-org-addons";

/**
 * Thin wrapper over useOrgAddons for the `dermatology` specialty addon.
 * Unlike fertility (which is split into basic/premium tiers), dermatology
 * is a single addon key, so a plain hasAddon check is enough.
 *
 * Returns { active, loading } so callers can render a tab/panel only once
 * the addon state is known (avoids a flash of the tab on first paint).
 */
export function useDermatologyAddon(): { active: boolean; loading: boolean } {
  const { hasAddon, loading } = useOrgAddons();
  return { active: hasAddon("dermatology"), loading };
}
