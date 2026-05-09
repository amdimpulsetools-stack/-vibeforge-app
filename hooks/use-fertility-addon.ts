"use client";

import { useOrgAddons } from "@/hooks/use-org-addons";
import { FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY } from "@/types/fertility";

const FERTILITY_ADDON_KEYS: string[] = [
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
];

/**
 * Compact wrapper around `useOrgAddons` that returns whether the current
 * org has any fertility addon active. Use this instead of repeating
 * `hasAnyAddon([FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])` inline.
 *
 * Pairs with `<FertilityAddonGate>` for declarative gating.
 */
export function useFertilityAddon(): { active: boolean; loading: boolean } {
  const { hasAnyAddon, loading } = useOrgAddons();
  return {
    active: hasAnyAddon(FERTILITY_ADDON_KEYS),
    loading,
  };
}
