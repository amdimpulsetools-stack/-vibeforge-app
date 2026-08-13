"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { usePlan, type OrgUsage } from "@/hooks/use-plan";
import { useOrgRole } from "@/hooks/use-org-role";
import { useOrganization } from "@/components/organization-provider";

const RESOURCE_LABELS: Partial<Record<keyof OrgUsage, string>> = {
  members: "miembros",
  doctors: "especialistas",
  offices: "consultorios",
  admins: "administradores",
  receptionists: "recepcionistas",
  doctor_members: "especialistas (miembros)",
};

/** Estar al tope es un estado PERMANENTE (1/1 consultorios lo es para
 *  siempre en Independiente), así que sin throttle el aviso se repite en
 *  cada carga de página. 24h por org: recuerda sin taladrar. */
const REMIND_EVERY_MS = 24 * 60 * 60 * 1000;

function alreadyWarnedRecently(orgId: string): boolean {
  try {
    const raw = localStorage.getItem(`plan-limit-warned:${orgId}`);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < REMIND_EVERY_MS;
  } catch {
    return false; // localStorage bloqueado: mejor avisar de más que nunca
  }
}

function markWarned(orgId: string) {
  try {
    localStorage.setItem(`plan-limit-warned:${orgId}`, String(Date.now()));
  } catch {
    /* sin persistencia: el ref de sesión evita el spam dentro de la visita */
  }
}

export function PlanLimitWarner() {
  const { plan, usage, loading, isNearLimit, isAtLimit, getLimit } = usePlan();
  // Plan-limit warnings are only actionable by owners/admins (they
  // control the subscription). Doctors/receptionists can't upgrade
  // or buy addons, so surfacing these toasts to them is just noise.
  const { isAdmin, loading: roleLoading } = useOrgRole();
  const { organizationId } = useOrganization();
  const warned = useRef(false);

  useEffect(() => {
    if (loading || roleLoading || !plan || !usage || !organizationId || warned.current)
      return;
    // Suppress the notification for non-admin/owner roles.
    if (!isAdmin) return;
    if (alreadyWarnedRecently(organizationId)) return;
    warned.current = true;

    const resources: (keyof OrgUsage)[] = [
      "members",
      "doctors",
      "offices",
    ];

    let shown = false;
    for (const resource of resources) {
      const limit = getLimit(resource);
      if (limit === null) continue;

      const current = usage[resource];
      const label = RESOURCE_LABELS[resource] ?? resource;

      if (isAtLimit(resource)) {
        shown = true;
        toast.warning(`Has alcanzado el límite de ${label}`, {
          description: `${current}/${limit} — Considera cambiar a un plan superior.`,
          duration: 8000,
        });
      } else if (isNearLimit(resource)) {
        shown = true;
        toast.info(`Te estás acercando al límite de ${label}`, {
          description: `${current}/${limit} usados en tu plan ${plan.name}.`,
          duration: 6000,
        });
      }
    }
    // Solo se agenda el recordatorio si algo se mostró: si hoy no hay
    // límites cerca, la próxima visita vuelve a evaluar desde cero.
    if (shown) markWarned(organizationId);
  }, [
    loading,
    roleLoading,
    isAdmin,
    organizationId,
    plan,
    usage,
    isNearLimit,
    isAtLimit,
    getLimit,
  ]);

  return null;
}
