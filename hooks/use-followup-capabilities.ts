"use client";

import { useFertilityAddon } from "@/hooks/use-fertility-addon";

export interface FollowupCapabilities {
  /** La bandeja de seguimientos existe para todas las orgs (mig 182). */
  hasTray: boolean;
  /** Copy y vacíos narrados como un recorrido de tratamiento por etapas. */
  hasJourney: boolean;
  /** KPI de ingreso recuperado en la pestaña "Recuperados". */
  hasRevenueKpis: boolean;
  /** Catálogo de reglas por etapa (filtro por regla, stepper de la card). */
  hasStepTemplates: boolean;
  loading: boolean;
}

/**
 * Capacidades del módulo de seguimientos para la org activa.
 *
 * El módulo es core desde la mig 182, pero tres de sus capacidades siguen
 * siendo del Pack Fertilidad. La UI genérica pregunta por CAPACIDAD, no
 * por addon: así el siguiente vertical que aporte etapas o ingreso
 * atribuido se enchufa aquí y no hay que volver a tocar la bandeja.
 *
 * Hoy las tres se derivan del addon de fertilidad — es el único que las
 * aporta. Los usos que son de verdad sobre fertilidad (presupuestos,
 * tiers) siguen leyendo `useFertilityAddon` directamente.
 */
export function useFollowupCapabilities(): FollowupCapabilities {
  const { active, loading } = useFertilityAddon();

  return {
    hasTray: true,
    hasJourney: active,
    hasRevenueKpis: active,
    hasStepTemplates: active,
    loading,
  };
}
