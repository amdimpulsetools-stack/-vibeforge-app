import type { OrgRole } from "@/types/admin";

// ============================================================
// Device session limits per role.
//
// Decision (sesión 2026-05-13 con Oscar): defaults generosos.
// Cubre la realidad — un owner power-user normalmente usa
// laptop + móvil + tablet; doctor tiene su laptop de la
// clínica + su móvil; recepción siempre opera en una sola
// PC del front-desk.
//
// Si una org pide ajuste (multi-clínica que comparte tablet
// para ronda médica, etc.), founders pueden override por
// user en un v2. No exponemos UI por-org en v1.
// ============================================================

export const SESSION_LIMITS: Record<OrgRole, number> = {
  owner: 3,
  admin: 2,
  doctor: 2,
  receptionist: 1,
};

// Fallback when user has no active membership yet (e.g. signup
// flow before they pick a plan, or after every membership got
// revoked). Most permissive of the four so signup → checkout
// never gets blocked by a session prompt.
export const DEFAULT_SESSION_LIMIT = 3;

// Multi-org user with different roles in different orgs gets
// the MOST permissive of their active roles. A doctor at
// Vitra who is also admin at another clinic gets 2 slots
// (admin>doctor in the table above, both = 2; example assumes
// admin role is higher in some configs).
export function maxLimitFromRoles(roles: readonly OrgRole[]): number {
  if (roles.length === 0) return DEFAULT_SESSION_LIMIT;
  return Math.max(...roles.map((r) => SESSION_LIMITS[r]));
}

// Cookie name used to mirror localStorage.yenda_device_id so
// middleware (running on edge) can read the device fingerprint.
// Set by the use-device-id hook on first mount of any page.
export const DEVICE_ID_COOKIE = "yenda_device_id";

// Feature flag — set to "true" in Vercel env to enable the
// whole device-limit enforcement. Default OFF in prod until
// we're confident no breakage.
//
// Case-insensitive on purpose: humans typo-set "TRUE" or "True"
// in dashboards (real bug 2026-05-14, where strict lowercase
// compare made the feature silently off for hours despite the
// env being set).
export function deviceLimitsEnabled(): boolean {
  return process.env.ENABLE_DEVICE_LIMITS?.toLowerCase() === "true";
}

// In-memory cache for "is this session revoked?" check.
// 30 second TTL — long enough to amortize the cost across
// rapid page navigation, short enough that a user-triggered
// revoke takes effect within half a minute.
//
// Map<`${userId}:${deviceId}`, { revoked: boolean; checkedAt: number }>
const sessionStatusCache = new Map<string, { revoked: boolean; checkedAt: number }>();
const CACHE_TTL_MS = 30_000;

export function getCachedSessionStatus(
  userId: string,
  deviceId: string,
): boolean | null {
  const key = `${userId}:${deviceId}`;
  const cached = sessionStatusCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.checkedAt > CACHE_TTL_MS) {
    sessionStatusCache.delete(key);
    return null;
  }
  return cached.revoked;
}

export function setCachedSessionStatus(
  userId: string,
  deviceId: string,
  revoked: boolean,
): void {
  sessionStatusCache.set(`${userId}:${deviceId}`, {
    revoked,
    checkedAt: Date.now(),
  });
}

export function invalidateSessionCache(userId: string, deviceId?: string): void {
  if (deviceId) {
    sessionStatusCache.delete(`${userId}:${deviceId}`);
    return;
  }
  // Invalidate every entry for this user (used on logout_all).
  for (const key of sessionStatusCache.keys()) {
    if (key.startsWith(`${userId}:`)) sessionStatusCache.delete(key);
  }
}
