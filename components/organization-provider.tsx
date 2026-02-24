"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
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
  refetchOrg: () => void;
}

const OrganizationContext = createContext<OrganizationContextType>({
  organizationId: null,
  organization: null,
  orgRole: null,
  isOrgAdmin: false,
  loading: true,
  refetchOrg: () => {},
});

export function OrganizationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading: userLoading } = useUser();
  const [state, setState] = useState<Omit<OrganizationContextType, "refetchOrg">>({
    organizationId: null,
    organization: null,
    orgRole: null,
    isOrgAdmin: false,
    loading: true,
  });

  const fetchOrg = useCallback(async () => {
    if (!user) return;

    const supabase = createClient();

    // Try to fetch existing org membership
    const { data } = await supabase
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
    const { error: rpcError } = await supabase.rpc("ensure_user_has_org");

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
  }, [user]);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    fetchOrg();
  }, [user, userLoading, fetchOrg]);

  const refetchOrg = useCallback(() => {
    fetchOrg();
  }, [fetchOrg]);

  return (
    <OrganizationContext.Provider value={{ ...state, refetchOrg }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}
