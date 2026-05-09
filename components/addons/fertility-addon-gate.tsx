"use client";

import type { ReactNode } from "react";
import { useFertilityAddon } from "@/hooks/use-fertility-addon";

interface Props {
  children: ReactNode;
  /** Rendered when the addon is inactive. Defaults to `null`. */
  fallback?: ReactNode;
  /** Rendered while the addon list is loading. Defaults to `null` to
   *  avoid flicker — the children won't appear until the check resolves. */
  loadingFallback?: ReactNode;
}

/**
 * Declarative gate around any UI that should only be visible when the
 * current organization has the fertility addon (basic or premium) active.
 *
 * Pairs with `useFertilityAddon()`. Prefer this component to inlining
 * `hasAnyAddon([...])` checks in render trees.
 */
export function FertilityAddonGate({
  children,
  fallback = null,
  loadingFallback = null,
}: Props) {
  const { active, loading } = useFertilityAddon();
  if (loading) return <>{loadingFallback}</>;
  if (!active) return <>{fallback}</>;
  return <>{children}</>;
}
