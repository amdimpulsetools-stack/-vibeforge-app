// Google Calendar integration — org-level, one-way (Yenda → Google).
//
// Single source of truth: Yenda. Google Calendar is a read-only mirror that
// the front desk and the doctors can glance at on their phones. We never
// pull from Google.
//
// Uses raw fetch instead of the `googleapis` SDK to keep the bundle small
// and avoid a heavy dependency for what amounts to four endpoints.
//
// Token lifecycle:
//   - Access tokens last ~1h. We refresh transparently when expired
//     (60s safety margin) using the refresh_token.
//   - If refresh fails (revoked from Google, deleted account), we mark the
//     integration `is_active = false` and stop hitting the API. The owner
//     gets prompted to reconnect from Settings → Integraciones.
//
// All sync calls are best-effort: a failure to push to Google never blocks
// the underlying mutation in Yenda.

import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/encryption";

// ── Types ───────────────────────────────────────────────────────────────────

export interface GCalIntegration {
  id: string;
  organization_id: string;
  connected_by_user_id: string | null;
  google_account_email: string;
  google_calendar_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  expires_at: string;
  scope: string;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_error: string | null;
  last_sync_error_at: string | null;
}

export interface GCalEventInput {
  /** Title shown in Google. */
  summary: string;
  /** Free-form description (multi-line). */
  description?: string;
  /** Where the appointment takes place (office name). */
  location?: string;
  /** ISO 8601, e.g. "2026-04-28T10:00:00-05:00" */
  startISO: string;
  endISO: string;
  /** IANA timezone (defaults to America/Lima for the Peruvian market). */
  timeZone?: string;
  /** "confirmed" | "tentative" | "cancelled" */
  status?: "confirmed" | "tentative" | "cancelled";
}

// ── Constants ──────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_CAL_BASE = "https://www.googleapis.com/calendar/v3";

// Only the events scope. Principle of least privilege — we cannot read or
// modify any other Google data this way.
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const DEFAULT_TZ = "America/Lima";

// Refresh 60s before actual expiration to avoid edge-of-window 401s.
const REFRESH_MARGIN_MS = 60 * 1000;

// ── Env helpers ────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[google-calendar] Missing env var: ${name}. ` +
        "Configure it in .env.local (and Vercel) before using this integration."
    );
  }
  return v;
}

function getRedirectUri(req?: Request): string {
  // Prefer explicit env override; fall back to request origin.
  const explicit = process.env.GOOGLE_REDIRECT_URI;
  if (explicit) return explicit;
  if (req) {
    const url = new URL(req.url);
    return `${url.origin}/api/integrations/google/callback`;
  }
  // Last-resort default (production).
  return "https://yenda.app/api/integrations/google/callback";
}

// ── OAuth ──────────────────────────────────────────────────────────────────

/**
 * Generates the URL to redirect the user to Google's consent screen.
 * `state` should be a signed value tying the callback back to the
 * organization that initiated the flow (use it to look up the org server-side).
 */
export function buildAuthorizationUrl(opts: {
  state: string;
  redirectUri: string;
}): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // forces refresh_token issue
    prompt: "consent", // force the consent screen so refresh_token is always returned
    state: opts.state,
    include_granted_scopes: "true",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

/** Exchanges an OAuth authorization code for access + refresh tokens. */
export async function exchangeCodeForTokens(opts: {
  code: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as TokenResponse;
  if (!json.refresh_token) {
    // Without a refresh token we can't keep syncing past 1h. Force-prompt
    // (prompt=consent above) usually guarantees this; if it's still missing
    // the user already granted access without offline mode previously and
    // needs to revoke from Google account settings + reconnect.
    throw new Error(
      "Google did not return a refresh_token. Revoke the previous grant " +
        "at https://myaccount.google.com/permissions and connect again."
    );
  }
  return json;
}

/** Fetches the connected Google account's email (for display in UI). */
export async function fetchUserInfo(accessToken: string): Promise<{ email: string }> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo failed (${res.status})`);
  }
  return (await res.json()) as { email: string };
}

/** Revokes a token at Google's side. Best-effort (we don't fail if Google rejects). */
export async function revokeToken(token: string): Promise<void> {
  await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: "POST",
  }).catch(() => undefined);
}

// ── Token refresh ─────────────────────────────────────────────────────────

async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number; scope: string }> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Refresh failed (${res.status}): ${text}`);
  }
  return (await res.json()) as { access_token: string; expires_in: number; scope: string };
}

// ── Integration access (server-side, admin client) ─────────────────────────

export async function getIntegration(
  organizationId: string
): Promise<GCalIntegration | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("google_calendar_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();
  return (data as unknown as GCalIntegration) ?? null;
}

/**
 * Returns a valid access token for the org's Google Calendar integration,
 * refreshing it transparently if needed. Returns null if the org has no
 * active integration. Throws on refresh failure (caller decides whether to
 * mark integration inactive).
 */
async function getValidAccessToken(integration: GCalIntegration): Promise<string> {
  const expiresAtMs = new Date(integration.expires_at).getTime();
  const stillValid = expiresAtMs - REFRESH_MARGIN_MS > Date.now();

  if (stillValid) {
    return decrypt(integration.access_token_encrypted);
  }

  // Need to refresh
  const refreshTokenPlain = decrypt(integration.refresh_token_encrypted);
  const refreshed = await refreshAccessToken(refreshTokenPlain);

  const supabase = createAdminClient();
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase
    .from("google_calendar_integrations")
    .update({
      access_token_encrypted: encrypt(refreshed.access_token),
      expires_at: newExpiresAt,
      scope: refreshed.scope,
    })
    .eq("id", integration.id);

  return refreshed.access_token;
}

async function markSyncSuccess(integrationId: string) {
  const supabase = createAdminClient();
  await supabase
    .from("google_calendar_integrations")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_error: null,
      last_sync_error_at: null,
    })
    .eq("id", integrationId);
}

async function markSyncError(integrationId: string, err: unknown, deactivate = false) {
  const supabase = createAdminClient();
  const message = err instanceof Error ? err.message : String(err);
  await supabase
    .from("google_calendar_integrations")
    .update({
      last_sync_error: message.slice(0, 500),
      last_sync_error_at: new Date().toISOString(),
      ...(deactivate ? { is_active: false } : {}),
    })
    .eq("id", integrationId);
}

// ── Calendar API (events) ──────────────────────────────────────────────────

/**
 * Creates an event in Google. Returns the Google event ID, or null if the
 * org has no active integration (no-op so callers can ignore the result).
 *
 * Best-effort: a failure here is logged on the integration row and surfaced
 * in the UI but does NOT throw.
 */
export async function createEvent(
  organizationId: string,
  event: GCalEventInput
): Promise<string | null> {
  const integration = await getIntegration(organizationId);
  if (!integration) return null;

  try {
    const accessToken = await getValidAccessToken(integration);
    const res = await fetch(
      `${GOOGLE_CAL_BASE}/calendars/${encodeURIComponent(integration.google_calendar_id)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventToGoogle(event)),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google create event failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as { id: string };
    await markSyncSuccess(integration.id);
    return json.id;
  } catch (err) {
    // Token revoked / refresh failed → deactivate so we stop hammering Google.
    const isAuthError =
      err instanceof Error && /401|invalid_grant|invalid_token/.test(err.message);
    await markSyncError(integration.id, err, isAuthError);
    return null;
  }
}

/** Updates an existing event (move, change details). Best-effort. */
export async function updateEvent(
  organizationId: string,
  googleEventId: string,
  event: GCalEventInput
): Promise<boolean> {
  const integration = await getIntegration(organizationId);
  if (!integration) return false;
  try {
    const accessToken = await getValidAccessToken(integration);
    const res = await fetch(
      `${GOOGLE_CAL_BASE}/calendars/${encodeURIComponent(integration.google_calendar_id)}/events/${encodeURIComponent(googleEventId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventToGoogle(event)),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google update event failed (${res.status}): ${text}`);
    }
    await markSyncSuccess(integration.id);
    return true;
  } catch (err) {
    const isAuthError =
      err instanceof Error && /401|invalid_grant|invalid_token/.test(err.message);
    await markSyncError(integration.id, err, isAuthError);
    return false;
  }
}

/** Marks the event as cancelled on Google (does NOT delete — preserves history). */
export async function cancelEvent(
  organizationId: string,
  googleEventId: string
): Promise<boolean> {
  return updateEvent(organizationId, googleEventId, {
    summary: "",
    startISO: new Date().toISOString(),
    endISO: new Date().toISOString(),
    status: "cancelled",
  });
}

// ── Mappers ────────────────────────────────────────────────────────────────

function eventToGoogle(input: GCalEventInput): Record<string, unknown> {
  const tz = input.timeZone || DEFAULT_TZ;
  // For a `cancelled` patch we only send status; sending fake start/end would
  // overwrite the existing dates (we don't want that).
  if (input.status === "cancelled") {
    return { status: "cancelled" };
  }
  return {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.startISO, timeZone: tz },
    end: { dateTime: input.endISO, timeZone: tz },
    status: input.status ?? "confirmed",
  };
}

/**
 * Builds an ISO 8601 string with timezone offset for Lima from a date + time
 * stored in the DB (date as YYYY-MM-DD, time as HH:MM:SS, both local-time
 * in the clinic's timezone). We don't import a TZ library; for Peru (no DST)
 * the offset is a stable -05:00.
 */
export function toLimaISO(dateStr: string, timeStr: string): string {
  // Normalize to HH:MM:SS
  const parts = timeStr.split(":");
  const hh = (parts[0] || "00").padStart(2, "0");
  const mm = (parts[1] || "00").padStart(2, "0");
  const ss = (parts[2] || "00").padStart(2, "0");
  return `${dateStr}T${hh}:${mm}:${ss}-05:00`;
}
