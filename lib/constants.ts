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
