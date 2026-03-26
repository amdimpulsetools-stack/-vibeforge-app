import { randomBytes } from "crypto";

export const FOUNDER_SESSION_COOKIE = "founder_2fa_session";
export const FOUNDER_SESSION_TTL = 4 * 60 * 60 * 1000; // 4 hours

interface SessionEntry {
  userId: string;
  expiresAt: number;
}

/**
 * In-memory store for founder 2FA sessions.
 * In production this should be replaced with Redis or a DB table.
 */
const sessions = new Map<string, SessionEntry>();

/**
 * Creates a new 2FA session token for a founder user.
 * Returns the random token string to be stored in a cookie.
 */
export function createFounder2FASession(userId: string): string {
  // Clean up expired sessions occasionally
  pruneExpiredSessions();

  const token = randomBytes(32).toString("hex");
  sessions.set(token, {
    userId,
    expiresAt: Date.now() + FOUNDER_SESSION_TTL,
  });

  return token;
}

/**
 * Validates whether a founder 2FA session token is still valid.
 */
export function validateFounder2FASession(token: string): boolean {
  const entry = sessions.get(token);
  if (!entry) return false;

  if (Date.now() > entry.expiresAt) {
    sessions.delete(token);
    return false;
  }

  return true;
}

/**
 * Removes expired sessions from the in-memory store.
 */
function pruneExpiredSessions() {
  const now = Date.now();
  for (const [token, entry] of sessions) {
    if (now > entry.expiresAt) {
      sessions.delete(token);
    }
  }
}
