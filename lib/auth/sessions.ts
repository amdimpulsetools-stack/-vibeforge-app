import { createAdminClient } from "@/lib/supabase/admin";
import type { OrgRole } from "@/types/admin";
import {
  SESSION_LIMITS,
  DEFAULT_SESSION_LIMIT,
  maxLimitFromRoles,
  invalidateSessionCache,
} from "./session-limits";

// ============================================================
// Server-side session CRUD.
//
// All writes go through the admin client (service role). Reads
// in the middleware path bypass this file and query directly
// for latency. UI reads go through the API endpoints which use
// this file.
// ============================================================

export interface AuthSessionRow {
  id: string;
  user_id: string;
  device_id: string;
  device_label: string | null;
  ip_address: string | null;
  ip_country: string | null;
  ip_city: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

export type RevokedReason =
  | "user_explicit"
  | "limit_exceeded"
  | "logout_all"
  | "recovery_email"
  | "admin_action"
  | "expired_inactive";

// ── Role lookup ─────────────────────────────────────────────────

// Multi-org user: returns ALL active roles. The caller decides
// the limit via maxLimitFromRoles. Inactive memberships are
// excluded so a deactivated doctor doesn't keep their 2-device
// slot.
export async function getActiveRolesForUser(userId: string): Promise<OrgRole[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error || !data) return [];
  return data
    .map((r) => r.role as string)
    .filter((r): r is OrgRole => r in SESSION_LIMITS);
}

export async function getSessionLimitForUser(userId: string): Promise<number> {
  const roles = await getActiveRolesForUser(userId);
  if (roles.length === 0) return DEFAULT_SESSION_LIMIT;
  return maxLimitFromRoles(roles);
}

// ── Listing ─────────────────────────────────────────────────────

export async function listActiveSessions(userId: string): Promise<AuthSessionRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("auth_sessions")
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false });
  if (error || !data) return [];
  return data as unknown as AuthSessionRow[];
}

// ── Upsert / register ───────────────────────────────────────────

export interface RegisterSessionInput {
  userId: string;
  deviceId: string;
  deviceLabel: string;
  ip: string | null;
  ipCountry: string | null;
  ipCity: string | null;
  userAgent: string | null;
}

export interface RegisterSessionResult {
  ok: boolean;
  // "created" — first time we see this (user, device)
  // "refreshed" — already exists, last_seen_at bumped
  // "limit_exceeded" — caller must prompt user to revoke one
  // "error" — a DB write failed. NOT a real limit hit; the caller
  //   should fail-open (let the user through) and log, never show
  //   the device-limit dialog (which would render empty + trap them).
  outcome: "created" | "refreshed" | "limit_exceeded" | "error";
  session?: AuthSessionRow;
  // When limit_exceeded, the existing active sessions for the user
  // so the UI can let them pick which to close.
  existingSessions?: AuthSessionRow[];
  limit?: number;
}

// Register or refresh a session.
//
// Logic:
//   1. Check if (user, device) already has a row.
//      - If yes and not revoked → bump last_seen + IP/geo → "refreshed".
//      - If yes but revoked → reactivate (subject to limit check below).
//   2. Otherwise: count active sessions for the user.
//      - If under limit → insert new row → "created".
//      - If at/over limit → return existing sessions, no insert.
export async function registerSession(
  input: RegisterSessionInput,
): Promise<RegisterSessionResult> {
  const admin = createAdminClient();

  // 1. Look up existing row for this (user, device).
  const { data: existing } = await admin
    .from("auth_sessions")
    .select("*")
    .eq("user_id", input.userId)
    .eq("device_id", input.deviceId)
    .maybeSingle();

  const nowIso = new Date().toISOString();

  // 1a. Active existing session → just refresh metadata.
  if (existing && !existing.revoked_at) {
    const { data: updated, error } = await admin
      .from("auth_sessions")
      .update({
        last_seen_at: nowIso,
        ip_address: input.ip,
        ip_country: input.ipCountry,
        ip_city: input.ipCity,
        user_agent: input.userAgent,
        device_label: input.deviceLabel,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) {
      // A DB write failed — this is NOT the user hitting their device
      // limit. Surface it as "error" so the caller fails open instead of
      // showing an empty, inescapable device-limit dialog.
      console.error("[registerSession] session write failed:", error.message);
      return { ok: false, outcome: "error" };
    }
    return {
      ok: true,
      outcome: "refreshed",
      session: updated as unknown as AuthSessionRow,
    };
  }

  // 1b/2. Revoked-existing or never-seen device → need to enforce
  // the limit before reactivating/creating. Both paths share the
  // same limit math.
  const limit = await getSessionLimitForUser(input.userId);
  const activeSessions = await listActiveSessions(input.userId);

  if (activeSessions.length >= limit) {
    return {
      ok: false,
      outcome: "limit_exceeded",
      existingSessions: activeSessions,
      limit,
    };
  }

  // Reactivate revoked session — preserves the row id so
  // history is continuous in /account/devices.
  if (existing && existing.revoked_at) {
    const { data: updated, error } = await admin
      .from("auth_sessions")
      .update({
        last_seen_at: nowIso,
        created_at: nowIso, // treat as "fresh login" for clarity
        ip_address: input.ip,
        ip_country: input.ipCountry,
        ip_city: input.ipCity,
        user_agent: input.userAgent,
        device_label: input.deviceLabel,
        revoked_at: null,
        revoked_reason: null,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) {
      // A DB write failed — this is NOT the user hitting their device
      // limit. Surface it as "error" so the caller fails open instead of
      // showing an empty, inescapable device-limit dialog.
      console.error("[registerSession] session write failed:", error.message);
      return { ok: false, outcome: "error" };
    }
    return {
      ok: true,
      outcome: "created", // reactivated counts as "created" for email-trigger logic
      session: updated as unknown as AuthSessionRow,
    };
  }

  // New row.
  const { data: inserted, error } = await admin
    .from("auth_sessions")
    .insert({
      user_id: input.userId,
      device_id: input.deviceId,
      device_label: input.deviceLabel,
      ip_address: input.ip,
      ip_country: input.ipCountry,
      ip_city: input.ipCity,
      user_agent: input.userAgent,
    })
    .select()
    .single();
  if (error) return { ok: false, outcome: "limit_exceeded" };
  return {
    ok: true,
    outcome: "created",
    session: inserted as unknown as AuthSessionRow,
  };
}

// ── Revoke ──────────────────────────────────────────────────────

export async function revokeSession(
  userId: string,
  sessionId: string,
  reason: RevokedReason,
): Promise<{ ok: boolean }> {
  const admin = createAdminClient();
  // Ownership check enforced inline — admin client bypasses RLS,
  // so we have to confirm the session belongs to the caller.
  const { data: row } = await admin
    .from("auth_sessions")
    .select("id, user_id, device_id, revoked_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!row) return { ok: false };
  if (row.user_id !== userId) return { ok: false };
  if (row.revoked_at) return { ok: true }; // idempotent

  const { error } = await admin
    .from("auth_sessions")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason,
    })
    .eq("id", sessionId);
  if (error) return { ok: false };

  invalidateSessionCache(userId, row.device_id);
  return { ok: true };
}

export async function revokeAllSessions(
  userId: string,
  reason: RevokedReason,
  exceptSessionId?: string,
): Promise<{ ok: boolean; count: number }> {
  const admin = createAdminClient();
  let query = admin
    .from("auth_sessions")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason,
    })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (exceptSessionId) {
    query = query.neq("id", exceptSessionId);
  }
  const { data, error } = await query.select("id");
  if (error) return { ok: false, count: 0 };
  invalidateSessionCache(userId);
  return { ok: true, count: data?.length ?? 0 };
}

// ── Middleware fast-path ────────────────────────────────────────

// Used by lib/supabase/middleware.ts. Bypasses the in-memory
// cache (caller handles caching) and returns:
//   - true  → (user, device) has an active session
//   - false → no row exists OR row is revoked
//
// Critical that this is a single indexed query.
export async function isSessionActive(
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("auth_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) return true; // fail-open — don't lock users out on DB errors
  return !!data;
}

// Returns true ONLY when a row exists for (user, device) and its
// revoked_at is NOT NULL. "No row at all" returns false — that's
// the lazy-create scenario (the client-side <SessionRegister />
// component will create the row on next render).
//
// This is the function the middleware should call, not
// isSessionActive — the former conflates "missing row" with
// "explicitly revoked", which would lock out every existing user
// the moment the feature flag flips on (the auth_sessions table
// starts empty, so all users would be treated as revoked).
//
// Real production bug 2026-05-15: confusion between the two
// caused a sign-out loop for every authenticated user after
// ENABLE_DEVICE_LIMITS=true took effect for the first time.
export async function isSessionRevoked(
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("auth_sessions")
    .select("revoked_at")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (error) return false; // fail-open — don't lock users out
  return !!data?.revoked_at;
}

// Update last_seen_at without blocking the request path. Caller
// should fire-and-forget. Failure is silent.
export async function touchSessionLastSeen(
  userId: string,
  deviceId: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("auth_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .is("revoked_at", null);
}

// ── Device rename ───────────────────────────────────────────────

export async function renameSession(
  userId: string,
  sessionId: string,
  newLabel: string,
): Promise<{ ok: boolean }> {
  const admin = createAdminClient();
  const trimmed = newLabel.trim().slice(0, 60);
  if (!trimmed) return { ok: false };
  const { data: row } = await admin
    .from("auth_sessions")
    .select("user_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!row || row.user_id !== userId) return { ok: false };
  const { error } = await admin
    .from("auth_sessions")
    .update({ device_label: trimmed })
    .eq("id", sessionId);
  return { ok: !error };
}
