import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const FOUNDER_SESSION_COOKIE = "founder_2fa_session";
export const FOUNDER_SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Creates a new 2FA session token for a founder user.
 * Persists it in the `founder_2fa_sessions` Supabase table (see migration
 * 104) so subsequent requests on any serverless lambda instance can verify
 * it — the previous in-memory Map broke on Vercel's multi-lambda runtime.
 *
 * Returns the random token string to be stored in the founder session cookie.
 */
export async function createFounder2FASession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + FOUNDER_SESSION_TTL_MS).toISOString();

  const admin = createAdminClient();
  await admin.from("founder_2fa_sessions").insert({
    token,
    user_id: userId,
    expires_at: expiresAt,
  });

  // Fire-and-forget cleanup of expired rows (amortized).
  admin
    .from("founder_2fa_sessions")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .then(() => {});

  return token;
}

/**
 * Validates a 2FA session token against the DB. Returns the user_id if the
 * token is valid and not expired, otherwise null.
 */
export async function validateFounder2FASession(
  token: string
): Promise<string | null> {
  if (!token || token.length < 32) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("founder_2fa_sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    // Expired — delete it opportunistically
    admin.from("founder_2fa_sessions").delete().eq("token", token).then(() => {});
    return null;
  }
  return data.user_id as string;
}

/**
 * Destroys a 2FA session token (on logout).
 */
export async function destroyFounder2FASession(token: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("founder_2fa_sessions").delete().eq("token", token);
}

/**
 * Reads the current request's founder_2fa_session cookie and validates it.
 * Returns the user_id if valid, otherwise null. Use from API routes or
 * server components.
 */
export async function getCurrentFounder2FAUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(FOUNDER_SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateFounder2FASession(token);
}
