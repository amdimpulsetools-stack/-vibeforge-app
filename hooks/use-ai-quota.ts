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

/**
 * @param enabled  Permite a superficies que montan el hook con su UI cerrada
 *                 (el panel del asistente vive siempre en el DOM, escondido
 *                 con un translate) posponer el RPC de cuota hasta que el
 *                 usuario abra el panel. Por defecto true: el resto de
 *                 consumidores no cambia.
 */
export function useAiQuota(enabled: boolean = true) {
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

  // El RPC de uso no necesita nada del plan: esperar a `planLoading` solo
  // encadenaba dos roundtrips que pueden ir a la vez. El plan se usa más
  // abajo, para el límite, y hasta que llegue `loading` sigue siendo true.
  useEffect(() => {
    if (!enabled || !organizationId) return;
    fetchUsage();
  }, [enabled, organizationId, fetchUsage]);

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
