export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Yenda";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const ITEMS_PER_PAGE = 10;

// Version tag stamped on Terms / Privacy pages. Bump this whenever the
// content of /terms or /privacy changes — it is persisted on the user's
// profile at signup so we have a paper trail of *which* version they
// accepted. Format is the publication date for the docs (YYYY-MM-DD).
export const TERMS_VERSION = "2026-04-29";

export const USER_ROLES = {
  ADMIN: "admin",
  USER: "user",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// Organization member roles (matches DB constraint)
export const ORG_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  RECEPTIONIST: "receptionist",
  DOCTOR: "doctor",
} as const;

export const ORG_ROLE_LABELS: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  receptionist: "Recepcionista",
  doctor: "Doctor",
};

// Organization types
export const ORG_TYPES = {
  INDEPENDIENTE: "independiente",
  CENTRO_MEDICO: "centro_medico",
  CLINICA: "clinica",
} as const;

export const ORG_TYPE_LABELS: Record<string, string> = {
  independiente: "Independiente",
  centro_medico: "Centro Médico",
  clinica: "Clínica",
};

// Plan slugs (canonical post-mig 133). El repo histórico usaba dos slugs
// intercambiables para el plan base — 'starter' (migrations 020-112) e
// 'independiente' (migration 003 + lib/constants ORG_TYPES). La consolidación
// a 'independiente' se hizo en migration 133, pero hay orgs legacy en DBs
// no migradas todavía. Estos helpers aceptan AMBOS slugs como equivalentes
// para mantener compatibilidad sin riesgo de regresión.
export const PLAN_SLUG_INDEPENDIENTE = "independiente";
export const PLAN_SLUG_PROFESSIONAL = "professional";
export const PLAN_SLUG_ENTERPRISE = "enterprise";

const INDEPENDIENTE_LEGACY_SLUGS = new Set(["independiente", "starter"]);

/** True si el slug corresponde al plan base (Independiente / starter legacy). */
export function isIndependientePlanSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return INDEPENDIENTE_LEGACY_SLUGS.has(slug);
}

/** True si el slug corresponde a un tier pago (Centro Médico o Clínica). */
export function isPaidPlanSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return slug === PLAN_SLUG_PROFESSIONAL || slug === PLAN_SLUG_ENTERPRISE;
}
