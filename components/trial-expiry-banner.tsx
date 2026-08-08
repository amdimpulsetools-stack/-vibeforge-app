"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { usePlan } from "@/hooks/use-plan";
import { useOrgRole } from "@/hooks/use-org-role";
import { cn } from "@/lib/utils";

/**
 * Banner fijo de fin de trial — la contraparte visible dentro de la app de
 * los emails trial_ending_7d/2d del cron de billing (auditoría 2026-08-07:
 * sin aviso previo, la org amanecía expulsada al vencer el trial).
 *
 * Aparece solo cuando la suscripción está en trial y quedan ≤7 días, y solo
 * para owners/admins (los únicos que pueden activar el plan — mostrárselo a
 * doctores/recepción es ruido, mismo criterio que PlanLimitWarner). Ámbar a
 * ≤7 días, rojo a ≤2. A propósito NO es descartable: es un banner delgado y
 * su trabajo es exactamente no dejarse olvidar.
 */
export function TrialExpiryBanner() {
  const { subscription, daysRemaining, loading } = usePlan();
  const { isAdmin, loading: roleLoading } = useOrgRole();

  if (loading || roleLoading || !isAdmin) return null;
  if (subscription?.status !== "trialing") return null;
  if (daysRemaining == null || daysRemaining > 7) return null;

  const urgent = daysRemaining <= 2;
  const message =
    daysRemaining <= 0
      ? "Tu período de prueba termina hoy"
      : daysRemaining === 1
        ? "Tu período de prueba termina mañana"
        : `Tu período de prueba termina en ${daysRemaining} días`;

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm font-medium",
        urgent
          ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        {message} — tus datos quedan guardados, pero el acceso se pausará.
      </span>
      <Link
        href="/plans"
        className={cn(
          "inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90",
          urgent ? "bg-red-600" : "bg-amber-600"
        )}
      >
        Elegir mi plan
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
