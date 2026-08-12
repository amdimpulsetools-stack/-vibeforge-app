/**
 * Facturación de módulos — helpers puros compartidos por API y UI.
 *
 * Reglas comerciales (mig 210) que se leen SIEMPRE del catálogo
 * `addons` (columnas monthly_price / included_from_plan). Este archivo
 * no contiene precios: contiene la ARITMÉTICA de esas columnas, para
 * que server y cliente decidan idéntico sin duplicar `if`s.
 *
 * Es intencionalmente client-safe (sin imports de Supabase ni de MP):
 * lo importan tanto rutas de API como `settings/modulos-tab.tsx`.
 */

import {
  PLAN_SLUG_ENTERPRISE,
  PLAN_SLUG_INDEPENDIENTE,
  PLAN_SLUG_PROFESSIONAL,
} from "@/lib/constants";

/**
 * Namespace de addon_type para módulos dentro de `plan_addons`.
 * Los cupos extra usan 'extra_member' / 'extra_office'; los módulos
 * usan 'module_<key>' para no chocar con la lógica de límites de cupos
 * que filtra por esos dos valores exactos.
 */
export const MODULE_ADDON_TYPE_PREFIX = "module_";

export function moduleAddonType(addonKey: string): string {
  return `${MODULE_ADDON_TYPE_PREFIX}${addonKey}`;
}

export function isModuleAddonType(addonType: string | null | undefined): boolean {
  return typeof addonType === "string" && addonType.startsWith(MODULE_ADDON_TYPE_PREFIX);
}

/** 'module_almacen' → 'almacen'. Devuelve null si no es un addon de módulo. */
export function moduleKeyFromAddonType(addonType: string | null | undefined): string | null {
  if (!isModuleAddonType(addonType)) return null;
  return (addonType as string).slice(MODULE_ADDON_TYPE_PREFIX.length) || null;
}

/**
 * Jerarquía de planes. 'starter' es el slug legacy del plan base
 * (consolidado a 'independiente' en mig 133, pero hay DBs sin migrar y
 * `addons.min_plan` todavía guarda 'starter' en varias filas).
 */
const PLAN_RANK: Record<string, number> = {
  starter: 0,
  [PLAN_SLUG_INDEPENDIENTE]: 0,
  [PLAN_SLUG_PROFESSIONAL]: 1,
  [PLAN_SLUG_ENTERPRISE]: 2,
};

export function planRank(slug: string | null | undefined): number | null {
  if (!slug) return null;
  const rank = PLAN_RANK[slug];
  return rank === undefined ? null : rank;
}

/**
 * Nombres COMERCIALES reales de los planes. El badge de la card de
 * módulos mostraba "Plan Enterprise+" / "Plan starter+" — slugs
 * internos que ningún cliente reconoce (en /plans se llaman
 * Independiente, Centro Médico y Clínica).
 */
export const PLAN_SLUG_LABELS: Record<string, string> = {
  starter: "Independiente",
  [PLAN_SLUG_INDEPENDIENTE]: "Independiente",
  [PLAN_SLUG_PROFESSIONAL]: "Centro Médico",
  [PLAN_SLUG_ENTERPRISE]: "Clínica",
};

export function planLabel(slug: string | null | undefined): string {
  if (!slug) return "tu plan";
  return PLAN_SLUG_LABELS[slug] ?? slug;
}

/** Fila del catálogo `addons` con las columnas de precio de mig 210. */
export interface ModulePricingRow {
  monthly_price?: number | string | null;
  included_from_plan?: string | null;
}

export interface ModuleBilling {
  /** Precio mensual del catálogo, o null si el addon no tiene cobro directo. */
  price: number | null;
  /** Slug del plan desde el cual va incluido (null = nunca incluido). */
  includedFromPlan: string | null;
  /** true si el plan actual de la org ya lo cubre sin cobro extra. */
  includedInPlan: boolean;
  /** true si activar este addon en este plan DEBE pasar por cobro. */
  requiresPayment: boolean;
}

function toPrice(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Resuelve, para una org en un plan dado, si el módulo se cobra.
 *
 * Si el plan de la org no se puede resolver (org sin suscripción, slug
 * desconocido) se asume el rango más bajo: un addon con precio se cobra.
 * Falla hacia "cobrar", nunca hacia "regalar el módulo".
 */
export function resolveModuleBilling(
  addon: ModulePricingRow | null | undefined,
  planSlug: string | null | undefined,
): ModuleBilling {
  const price = toPrice(addon?.monthly_price);
  const includedFromPlan = addon?.included_from_plan ?? null;

  if (price === null) {
    // Sin precio en el catálogo → módulo incluido en cualquier plan,
    // que es el comportamiento histórico de los 14 addons existentes.
    return {
      price: null,
      includedFromPlan,
      includedInPlan: true,
      requiresPayment: false,
    };
  }

  const orgRank = planRank(planSlug) ?? 0;
  const includedRank = planRank(includedFromPlan);
  const includedInPlan = includedRank !== null && orgRank >= includedRank;

  return {
    price,
    includedFromPlan,
    includedInPlan,
    requiresPayment: !includedInPlan,
  };
}

/** "S/39" · "S/39.50" — sin decimales cuando el precio es entero. */
export function formatPen(amount: number | string | null | undefined): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "S/0";
  return Number.isInteger(n) ? `S/${n}` : `S/${n.toFixed(2)}`;
}
