// OAuth callback. Receives `code` + `state` from Google, verifies the state
// signature, exchanges the code for tokens, encrypts them, and persists the
// integration. Then redirects back to Settings → Integraciones.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/encryption";
import { exchangeCodeForTokens, fetchUserInfo } from "@/lib/google-calendar";

export const runtime = "nodejs";

function verifyState(state: string, secret: string): null | {
  organizationId: string;
  userId: string;
} {
  const idx = state.lastIndexOf(".");
  if (idx === -1) return null;
  const payload = state.slice(0, idx);
  const sig = state.slice(idx + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  // Constant-time compare
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const [organizationId, userId] = payload.split(":");
  if (!organizationId || !userId) return null;
  return { organizationId, userId };
}

function settingsRedirect(req: NextRequest, status: "ok" | "error", reason?: string) {
  const url = new URL("/settings", req.url);
  url.searchParams.set("tab", "integraciones");
  url.searchParams.set("gcal", status);
  if (reason) url.searchParams.set("gcal_reason", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || !state) {
    return settingsRedirect(req, "error", error || "missing_code");
  }

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    return settingsRedirect(req, "error", "server_misconfigured");
  }

  const verified = verifyState(state, secret);
  if (!verified) {
    return settingsRedirect(req, "error", "invalid_state");
  }

  try {
    const redirectUri = `${url.origin}/api/integrations/google/callback`;
    const tokens = await exchangeCodeForTokens({ code, redirectUri });
    const info = await fetchUserInfo(tokens.access_token);

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const supabase = createAdminClient();

    // Upsert by org. If the org already had an integration we replace it
    // (e.g. they reconnected with a different Google account).
    const { error: upsertErr } = await supabase
      .from("google_calendar_integrations")
      .upsert(
        {
          organization_id: verified.organizationId,
          connected_by_user_id: verified.userId,
          google_account_email: info.email,
          google_calendar_id: "primary",
          access_token_encrypted: encrypt(tokens.access_token),
          refresh_token_encrypted: encrypt(tokens.refresh_token!),
          expires_at: expiresAt,
          scope: tokens.scope,
          is_active: true,
          last_sync_error: null,
          last_sync_error_at: null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" }
      );
    if (upsertErr) throw upsertErr;

    return settingsRedirect(req, "ok");
  } catch (err) {
    console.error("[gcal callback]", err);
    const reason = err instanceof Error ? err.message.slice(0, 100) : "exchange_failed";
    return settingsRedirect(req, "error", reason);
  }
}
