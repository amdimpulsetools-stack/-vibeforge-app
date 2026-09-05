"use client";

import { useCallback } from "react";
import { useOrganization } from "@/components/organization-provider";
import { resolveOrgTimezone, todayInTz } from "@/lib/org-time";

/**
 * "Hoy" según la zona horaria de la org activa (mig 240), para estampar
 * fechas civiles en cliente: payment_date, appointment_date por defecto,
 * mínimos de date pickers.
 *
 * Reemplaza a `new Date().toISOString().split("T")[0]`, que convierte a UTC
 * y a partir de las 19:00 hora Lima devolvía la fecha de MAÑANA (un cobro
 * de las 19:30 caía en el día siguiente en todos los dashboards).
 *
 * Mientras la org carga, cae a America/Lima (resolveOrgTimezone).
 */
export function useOrgToday(): { timezone: string; today: () => string } {
  const { organization } = useOrganization();
  const timezone = resolveOrgTimezone(
    (organization as { timezone?: string | null } | null)?.timezone,
  );
  const today = useCallback(() => todayInTz(timezone), [timezone]);
  return { timezone, today };
}
