"use client";

import { useOrgRole } from "@/hooks/use-org-role";
import type { OrgRole } from "@/types/admin";

interface RoleGateProps {
  /** Minimum role required to see children: "admin" = admin + owner, "owner" = owner only */
  minRole: OrgRole;
  /** Content to render when the user has the required role */
  children: React.ReactNode;
  /** Optional fallback when the user doesn't have the role (defaults to null) */
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children based on the user's org role.
 *
 * Usage:
 *   <RoleGate minRole="admin">
 *     <button>Delete</button>
 *   </RoleGate>
 */
export function RoleGate({ minRole, children, fallback = null }: RoleGateProps) {
  const { hasMinRole, loading } = useOrgRole();

  if (loading) return null;
  if (!hasMinRole(minRole)) return <>{fallback}</>;

  return <>{children}</>;
}
