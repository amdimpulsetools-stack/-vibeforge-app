"use client";

import { useCallback, useEffect, useState } from "react";
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

export function useOrgAddons() {
  const { organizationId } = useOrganization();
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!organizationId) return;
    setLoading(true);
    fetch("/api/addons")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Addon[]) => {
        setAddons(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [organizationId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

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
        setAddons((prev) =>
          prev.map((a) =>
            a.key === key
              ? { ...a, enabled, activated_at: enabled ? new Date().toISOString() : a.activated_at }
              : a
          )
        );
      }
      return res.ok;
    },
    []
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
        setAddons((prev) =>
          prev.map((a) =>
            a.key === key
              ? { ...a, enabled: true, activated_at: new Date().toISOString() }
              : a
          )
        );
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
    []
  );

  const deactivateAddon = useCallback(
    async (key: string): Promise<boolean> => {
      const res = await fetch(`/api/addons/${encodeURIComponent(key)}/deactivate`, {
        method: "POST",
      });
      if (res.ok) {
        setAddons((prev) =>
          prev.map((a) => (a.key === key ? { ...a, enabled: false } : a))
        );
      }
      return res.ok;
    },
    []
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
