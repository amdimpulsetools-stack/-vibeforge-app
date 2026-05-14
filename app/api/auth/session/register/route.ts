import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { registerSession } from "@/lib/auth/sessions";
import { deviceLabelFromUserAgent } from "@/lib/auth/user-agent";
import { DEVICE_ID_COOKIE, deviceLimitsEnabled } from "@/lib/auth/session-limits";
import { sendNewDeviceEmail } from "@/lib/auth/new-device-email";

/**
 * POST /api/auth/session/register
 *
 * Called by the client right after a successful login (or on
 * first mount of a dashboard page if the device_id cookie is
 * missing). Registers or refreshes the (user, device) session.
 *
 * Behaviour:
 *   - 200 + { outcome: "created" | "refreshed", session }
 *     when the session was registered/refreshed under the limit.
 *   - 409 + { outcome: "limit_exceeded", limit, sessions }
 *     when the user already has `limit` active sessions and this
 *     is a NEW device. Client should show the device-limit modal
 *     letting the user pick which existing session to revoke.
 *
 * The device_id comes from the body (sent by the client which
 * generates it as a localStorage UUID). We also mirror it into
 * a cookie so middleware can read it on subsequent requests
 * without needing JS.
 */

const schema = z.object({
  device_id: z.string().uuid("device_id must be a UUID"),
});

export async function POST(request: NextRequest) {
  // Feature-flagged off until production validation is done.
  if (!deviceLimitsEnabled()) {
    return NextResponse.json({ outcome: "disabled" }, { status: 200 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // ── Forensic context ────────────────────────────────────────
  const userAgent = request.headers.get("user-agent");
  const deviceLabel = deviceLabelFromUserAgent(userAgent);
  // Vercel + most proxies set x-forwarded-for. Fall back to
  // x-real-ip. Both can be spoofed in non-Vercel deploys, but
  // the IP is informational only (display in /account/devices).
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  // Vercel exposes geo headers in production. Hosts other than
  // Vercel will see null here — display falls back to "—".
  const ipCountry = request.headers.get("x-vercel-ip-country") || null;
  const ipCity = (() => {
    const raw = request.headers.get("x-vercel-ip-city");
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();

  const result = await registerSession({
    userId: user.id,
    deviceId: parsed.data.device_id,
    deviceLabel,
    ip,
    ipCountry,
    ipCity,
    userAgent,
  });

  // Mirror device_id to cookie so middleware can read it later
  // (middleware runs on edge and has no localStorage access).
  // Set on every response — cheap, and corrects drift between
  // localStorage and cookie if the user cleared one but not
  // the other.
  if (result.ok && result.session) {
    // Fire the "new device detected" email only on first-time
    // registrations (or reactivation of a previously revoked
    // device), not on simple refreshes — otherwise every page
    // load would spam the user. Fire-and-forget via after()
    // so we don't block the response.
    if (result.outcome === "created") {
      after(async () => {
        await sendNewDeviceEmail({
          userId: user.id,
          deviceLabel,
          ipCity,
          ipCountry,
          loggedAt: new Date(),
        });
      });
    }

    const response = NextResponse.json({
      outcome: result.outcome,
      session: result.session,
    });
    response.cookies.set(DEVICE_ID_COOKIE, parsed.data.device_id, {
      httpOnly: false, // client needs to read to sync localStorage if missing
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year — device IDs are long-lived
    });
    return response;
  }

  // ── 409 limit exceeded ──────────────────────────────────────
  if (result.outcome === "limit_exceeded") {
    return NextResponse.json(
      {
        outcome: "limit_exceeded",
        limit: result.limit,
        sessions: (result.existingSessions ?? []).map((s) => ({
          id: s.id,
          device_label: s.device_label,
          ip_city: s.ip_city,
          ip_country: s.ip_country,
          last_seen_at: s.last_seen_at,
          created_at: s.created_at,
        })),
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ error: "register_failed" }, { status: 500 });
}
