"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import type { Database } from "@/types/database";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];
type OrgRole = "owner" | "admin" | "member";

interface OrganizationContextType {
  organizationId: string | null;
  organization: Organization | null;
  orgRole: OrgRole | null;
  isOrgAdmin: boolean;
  loading: boolean;
}

const OrganizationContext = createContext<OrganizationContextType>({
  organizationId: null,
  organization: null,
  orgRole: null,
  isOrgAdmin: false,
  loading: true,
});

export function OrganizationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: userLoading } = useUser();
  const [state, setState] = useState<OrganizationContextType>({
    organizationId: null,
    organization: null,
    orgRole: null,
    isOrgAdmin: false,
    loading: true,
  });

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    const fetchOrg = async () => {
      const supabase = createClient();

      // Try to fetch existing org membership
      const { data, error } = await supabase
        .from("organization_members")
        .select("organization_id, role, organizations(*)")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (data) {
        const org = data.organizations as unknown as Organization;
        const role = data.role as OrgRole;
        setState({
          organizationId: data.organization_id,
          organization: org,
          orgRole: role,
          isOrgAdmin: role === "owner" || role === "admin",
          loading: false,
        });
        return;
      }

      // No org membership found — attempt self-healing via RPC
      console.warn("No organization membership found, attempting auto-repair...");
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "ensure_user_has_org"
      );

      if (rpcError) {
        console.error("Failed to auto-create organization:", rpcError.message);
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      // Re-fetch org membership after self-healing
      const { data: retryData } = await supabase
        .from("organization_members")
        .select("organization_id, role, organizations(*)")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (retryData) {
        const org = retryData.organizations as unknown as Organization;
        const role = retryData.role as OrgRole;
        setState({
          organizationId: retryData.organization_id,
          organization: org,
          orgRole: role,
          isOrgAdmin: role === "owner" || role === "admin",
          loading: false,
        });
      } else {
        setState((s) => ({ ...s, loading: false }));
      }
    };

    fetchOrg();
  }, [user, userLoading]);

  return (
    <OrganizationContext.Provider value={state}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}
