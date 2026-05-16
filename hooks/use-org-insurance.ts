"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import type {
  InsuranceCarrier,
  OrganizationInsuranceCarrier,
  OrganizationInsuranceCarrierWithName,
} from "@/types/insurance";

interface UseOrgInsuranceResult {
  enabled: boolean;
  carriers: OrganizationInsuranceCarrierWithName[];
  catalog: InsuranceCarrier[];
  loading: boolean;
  refetch: () => void;
}

/**
 * Loads the org's insurance state in one shot: the global enabled toggle, the
 * org's active carriers (with display names resolved from the catalog or
 * custom fields), and the global catalog for the "add carrier" flow.
 */
export function useOrgInsurance(): UseOrgInsuranceResult {
  const { organizationId } = useOrganization();
  const [enabled, setEnabled] = useState(false);
  const [carriers, setCarriers] = useState<OrganizationInsuranceCarrierWithName[]>([]);
  const [catalog, setCatalog] = useState<InsuranceCarrier[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const [settingsRes, carriersRes, catalogRes] = await Promise.all([
      supabase
        .from("organization_insurance_settings")
        .select("enabled")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("organization_insurance_carriers")
        .select("*, insurance_carriers(name, default_ruc)")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }),
      supabase
        .from("insurance_carriers")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
    ]);

    setEnabled(settingsRes.data?.enabled ?? false);

    const rows = (carriersRes.data ?? []) as (OrganizationInsuranceCarrier & {
      insurance_carriers: { name: string; default_ruc: string | null } | null;
    })[];
    setCarriers(
      rows.map((r) => ({
        ...r,
        display_name: r.insurance_carriers?.name ?? r.custom_name ?? "Sin nombre",
        display_ruc: r.insurance_carriers?.default_ruc ?? r.custom_ruc ?? null,
      })),
    );

    setCatalog((catalogRes.data ?? []) as InsuranceCarrier[]);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { enabled, carriers, catalog, loading, refetch: fetchAll };
}
