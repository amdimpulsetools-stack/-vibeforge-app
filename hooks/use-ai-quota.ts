"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { usePlan } from "@/hooks/use-plan";

const PLAN_AI_LIMITS: Record<string, number> = {
  starter: 50,
  independiente: 50,
  professional: 120,
  enterprise: 250,
};

export interface AiQuota {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
}

export function useAiQuota() {
  const { organizationId } = useOrganization();
  const { plan, loading: planLoading } = usePlan();
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();
    const { data } = await supabase.rpc("get_ai_query_usage_this_month", {
      org_id: organizationId,
    });
    setUsed((data as number) ?? 0);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    if (planLoading || !organizationId) return;
    fetchUsage();
  }, [organizationId, planLoading, fetchUsage]);

  const limit = plan?.max_ai_queries ?? PLAN_AI_LIMITS[plan?.slug ?? "starter"] ?? 50;
  const remaining = Math.max(0, limit - used);
  const percentage = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const quota: AiQuota = { used, limit, remaining, percentage };

  return {
    quota,
    loading: loading || planLoading,
    refetch: fetchUsage,
  };
}
