"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/components/organization-provider";

export interface Addon {
  key: string;
  name: string;
  description: string | null;
  category: "specialty" | "workflow" | "clinical";
  specialties: string[];
  icon: string | null;
  is_premium: boolean;
  min_plan: string;
  sort_order: number;
  enabled: boolean;
  activated_at: string | null;
  settings: Record<string, unknown>;
  recommended: boolean;
}

// Referencia estable para no crear un [] nuevo en cada render sin data.
const EMPTY_ADDONS: Addon[] = [];

export function useOrgAddons() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();

  // Deduplicado y cacheado vía React Query (staleTime 5 min del QueryProvider):
  // los ~10 consumidores comparten un único fetch a /api/addons por org.
  const { data, isPending } = useQuery<Addon[]>({
    queryKey: ["addons", organizationId],
    enabled: !!organizationId,
    queryFn: () =>
      // BUG FIX (2026-05-14): we used to call /api/addons without
      // org_id. The endpoint then fell back to .limit(1).single() and
      // picked an arbitrary membership — for a doctor with multi-org
      // access, that could resolve to the wrong org and report the
      // wrong addon state. Pass the active org explicitly.
      fetch(`/api/addons?org_id=${encodeURIComponent(organizationId as string)}`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [] as Addon[]),
  });

  const addons = data ?? EMPTY_ADDONS;

  // Semántica de loading idéntica a la versión anterior: sin org el hook
  // nunca resolvía (refetch hacía early-return y loading quedaba en true).
  const loading = !organizationId || isPending;

  const refetch = useCallback(() => {
    if (!organizationId) return;
    queryClient.invalidateQueries({ queryKey: ["addons", organizationId] });
  }, [queryClient, organizationId]);

  /** Actualiza el caché de la key ['addons', orgId] con un patch por addon_key. */
  const patchAddon = useCallback(
    (key: string, patch: (a: Addon) => Addon) => {
      queryClient.setQueryData<Addon[]>(["addons", organizationId], (prev) =>
        prev?.map((a) => (a.key === key ? patch(a) : a))
      );
    },
    [queryClient, organizationId]
  );

  const hasAddon = useCallback(
    (key: string) => addons.some((a) => a.key === key && a.enabled),
    [addons]
  );

  const hasAnyAddon = useCallback(
    (keys: string[]) =>
      addons.some((a) => keys.includes(a.key) && a.enabled),
    [addons]
  );

  /**
   * For mutually-exclusive addon tiers (addons sharing a tier_group),
   * returns the active addon_key in that group for this org, or null.
   * The catalog response does not include tier_group, so the caller
   * must pass the candidate keys belonging to the group.
   */
  const getActiveTierInGroup = useCallback(
    (groupKeys: string[]) => {
      const active = addons.find((a) => groupKeys.includes(a.key) && a.enabled);
      return active?.key ?? null;
    },
    [addons]
  );

  const toggleAddon = useCallback(
    async (key: string, enabled: boolean) => {
      const res = await fetch("/api/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addon_key: key, enabled }),
      });
      if (res.ok) {
        patchAddon(key, (a) => ({
          ...a,
          enabled,
          activated_at: enabled ? new Date().toISOString() : a.activated_at,
        }));
      }
      return res.ok;
    },
    [patchAddon]
  );

  /**
   * Activates an addon via the new tier-aware endpoint. Returns the
   * full activation payload so the caller can redirect to setup_url.
   * On 409 (tier conflict) or other errors, returns { ok: false, error }.
   */
  const activateAddon = useCallback(
    async (
      key: string
    ): Promise<
      | {
          ok: true;
          addon_key: string;
          requires_setup: boolean;
          setup_url?: string;
          warnings?: string[];
        }
      | { ok: false; status: number; error: string; conflicting_addon_key?: string }
    > => {
      const res = await fetch(`/api/addons/${encodeURIComponent(key)}/activate`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        patchAddon(key, (a) => ({
          ...a,
          enabled: true,
          activated_at: new Date().toISOString(),
        }));
        return {
          ok: true,
          addon_key: body.addon_key ?? key,
          requires_setup: !!body.requires_setup,
          setup_url: body.setup_url,
          warnings: body.warnings,
        };
      }
      return {
        ok: false,
        status: res.status,
        error: body.error ?? "Error al activar el addon",
        conflicting_addon_key: body.conflicting_addon_key,
      };
    },
    [patchAddon]
  );

  const deactivateAddon = useCallback(
    async (key: string): Promise<boolean> => {
      const res = await fetch(`/api/addons/${encodeURIComponent(key)}/deactivate`, {
        method: "POST",
      });
      if (res.ok) {
        patchAddon(key, (a) => ({ ...a, enabled: false }));
      }
      return res.ok;
    },
    [patchAddon]
  );

  return {
    addons,
    loading,
    hasAddon,
    hasAnyAddon,
    getActiveTierInGroup,
    toggleAddon,
    activateAddon,
    deactivateAddon,
    refetch,
  };
}
