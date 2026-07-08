"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { usePlan, type OrgUsage } from "@/hooks/use-plan";
import { useOrgRole } from "@/hooks/use-org-role";

const RESOURCE_LABELS: Partial<Record<keyof OrgUsage, string>> = {
  members: "miembros",
  doctors: "especialistas",
  offices: "consultorios",
  admins: "administradores",
  receptionists: "recepcionistas",
  doctor_members: "especialistas (miembros)",
};

export function PlanLimitWarner() {
  const { plan, usage, loading, isNearLimit, isAtLimit, getLimit } = usePlan();
  // Plan-limit warnings are only actionable by owners/admins (they
  // control the subscription). Doctors/receptionists can't upgrade
  // or buy addons, so surfacing these toasts to them is just noise.
  const { isAdmin, loading: roleLoading } = useOrgRole();
  const warned = useRef(false);

  useEffect(() => {
    if (loading || roleLoading || !plan || !usage || warned.current) return;
    // Suppress the notification for non-admin/owner roles.
    if (!isAdmin) return;
    warned.current = true;

    const resources: (keyof OrgUsage)[] = [
      "members",
      "doctors",
      "offices",
    ];

    for (const resource of resources) {
      const limit = getLimit(resource);
      if (limit === null) continue;

      const current = usage[resource];
      const label = RESOURCE_LABELS[resource] ?? resource;

      if (isAtLimit(resource)) {
        toast.warning(`Has alcanzado el límite de ${label}`, {
          description: `${current}/${limit} — Considera cambiar a un plan superior.`,
          duration: 8000,
        });
      } else if (isNearLimit(resource)) {
        toast.info(`Te estás acercando al límite de ${label}`, {
          description: `${current}/${limit} usados en tu plan ${plan.name}.`,
          duration: 6000,
        });
      }
    }
  }, [loading, roleLoading, isAdmin, plan, usage, isNearLimit, isAtLimit, getLimit]);

  return null;
}
