"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { usePlan, type OrgUsage } from "@/hooks/use-plan";

const RESOURCE_LABELS: Partial<Record<keyof OrgUsage, string>> = {
  members: "miembros",
  doctors: "especialistas",
  offices: "consultorios",
  patients: "pacientes",
  appointments_this_month: "citas este mes",
  admins: "administradores",
  receptionists: "recepcionistas",
  doctor_members: "especialistas (miembros)",
};

export function PlanLimitWarner() {
  const { plan, usage, loading, isNearLimit, isAtLimit, getLimit } = usePlan();
  const warned = useRef(false);

  useEffect(() => {
    if (loading || !plan || !usage || warned.current) return;
    warned.current = true;

    const resources: (keyof OrgUsage)[] = [
      "members",
      "doctors",
      "offices",
      "patients",
      "appointments_this_month",
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
  }, [loading, plan, usage, isNearLimit, isAtLimit, getLimit]);

  return null;
}
