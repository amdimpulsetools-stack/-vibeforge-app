"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";

/**
 * ¿Un doctor ve "Conversaciones" en el menú? Solo si la clínica activó
 * wa_inbox_settings.doctors_enabled (mig 275). La consulta corre SOLO
 * para doctores de orgs con el addon (enabled=false en cualquier otro
 * caso): administración, recepción y orgs sin el módulo no pagan nada.
 */
export function useInboxDoctorAccess(enabled: boolean): boolean {
  const { organizationId } = useOrganization();
  const { data } = useQuery({
    queryKey: ["inbox-doctor-access", organizationId],
    enabled: enabled && !!organizationId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await createClient()
        .from("wa_inbox_settings")
        .select("doctors_enabled")
        .eq("organization_id", organizationId as string)
        .maybeSingle();
      return Boolean((data as { doctors_enabled?: boolean } | null)?.doctors_enabled);
    },
  });
  return data ?? false;
}
