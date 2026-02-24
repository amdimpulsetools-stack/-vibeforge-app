"use client";

import { useOrganization } from "@/components/organization-provider";
import type { OrgRole } from "@/types/admin";

interface UseOrgRoleReturn {
  /** Current user's org role: owner | admin | member | null (loading) */
  role: OrgRole | null;
  /** True while the org context is still loading */
  loading: boolean;
  /** Shorthand: role is owner or admin */
  isAdmin: boolean;
  /** Shorthand: role is owner */
  isOwner: boolean;
  /** Returns true if user's role is at least the given minimum */
  hasMinRole: (minRole: OrgRole) => boolean;
}

const ROLE_LEVEL: Record<OrgRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

export function useOrgRole(): UseOrgRoleReturn {
  const { orgRole, isOrgAdmin, loading } = useOrganization();

  const hasMinRole = (minRole: OrgRole): boolean => {
    if (!orgRole) return false;
    return ROLE_LEVEL[orgRole] >= ROLE_LEVEL[minRole];
  };

  return {
    role: orgRole,
    loading,
    isAdmin: isOrgAdmin,
    isOwner: orgRole === "owner",
    hasMinRole,
  };
}
