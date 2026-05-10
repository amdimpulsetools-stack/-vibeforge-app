"use client";

import { useCallback, useEffect, useState } from "react";
import { useFertilityAddon } from "@/hooks/use-fertility-addon";
import { useOrganization } from "@/components/organization-provider";

export interface FertilityAdvisor {
  /** organization_members.id */
  id: string;
  /** auth user id */
  user_id: string;
  /** Display label (full name when available, fallback "Asesora"). */
  full_name: string;
}

interface State {
  advisors: FertilityAdvisor[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Returns the list of organization members flagged as fertility
 * advisors (`organization_members.is_fertility_advisor = true`,
 * mig 137) for the current org. The list is fetched from the
 * addon-gated `/api/admin/fertility/advisors` endpoint, so:
 *
 *  - Returns `[]` if the org does not have a fertility addon active
 *    (the endpoint replies 403; we surface as an empty list, not an
 *    error, because the hook is meant to be consumed inside addon-
 *    gated UI anyway).
 *  - Available to any role within an addon-active org.
 *
 * Phase 3 will wire this into the "Asignar presupuesto" modal as the
 * asesora dropdown.
 */
export function useOrgFertilityAdvisors(): State {
  const { organizationId } = useOrganization();
  const { active: fertilityActive, loading: addonLoading } = useFertilityAddon();
  const [advisors, setAdvisors] = useState<FertilityAdvisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!organizationId) return;
    if (addonLoading) return;
    if (!fertilityActive) {
      setAdvisors([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch("/api/admin/fertility/advisors", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          // 403 from the addon gate falls through here. Surface as
          // empty list so consumers can render gracefully.
          setAdvisors([]);
          if (r.status !== 403) {
            setError(`HTTP ${r.status}`);
          }
          return;
        }
        const data = (await r.json()) as FertilityAdvisor[];
        setAdvisors(data);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Error de red");
        setAdvisors([]);
      })
      .finally(() => setLoading(false));
  }, [organizationId, addonLoading, fertilityActive]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { advisors, loading, error, refetch };
}
