// Initiates the Google OAuth flow for the current org's calendar integration.
//
// Only owners/admins of an org can connect/disconnect. We sign the org id in
// the OAuth `state` parameter so the callback can verify it without trusting
// query params from Google's redirect.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizationUrl } from "@/lib/google-calendar";

export const runtime = "nodejs";

function signState(payload: string, secret: string): string {
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Confirm user is an admin/owner of some org.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  if (!membership?.organization_id) {
    return NextResponse.json(
      { error: "Solo el owner o admin de la clínica puede conectar Google Calendar." },
      { status: 403 }
    );
  }

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  // State payload: "<orgId>:<userId>:<random>"; signed with the service role
  // key as HMAC secret. Random nonce prevents replay across sessions.
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${membership.organization_id}:${user.id}:${nonce}`;
  const state = signState(payload, secret);

  const redirectUri = `${new URL(req.url).origin}/api/integrations/google/callback`;
  const url = buildAuthorizationUrl({ state, redirectUri });

  return NextResponse.redirect(url);
}
