"use client";

import { useOrganization } from "@/components/organization-provider";
import type { OrgRole } from "@/types/admin";

interface UseOrgRoleReturn {
  /** Current user's org role: owner | admin | receptionist | doctor | null (loading) */
  role: OrgRole | null;
  /** True while the org context is still loading */
  loading: boolean;
  /** Shorthand: role is owner or admin */
  isAdmin: boolean;
  /** Shorthand: role is owner */
  isOwner: boolean;
  /** Shorthand: role is receptionist */
  isReceptionist: boolean;
  /** Shorthand: role is doctor */
  isDoctor: boolean;
  /** Returns true if user's role is at least the given minimum */
  hasMinRole: (minRole: OrgRole) => boolean;
}

const ROLE_LEVEL: Record<OrgRole, number> = {
  doctor: 0,
  receptionist: 1,
  admin: 2,
  owner: 3,
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
    isReceptionist: orgRole === "receptionist",
    isDoctor: orgRole === "doctor",
    hasMinRole,
  };
}
