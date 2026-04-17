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

  return { addons, loading, hasAddon, toggleAddon, refetch };
}
