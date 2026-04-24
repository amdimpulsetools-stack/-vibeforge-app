// Returns the current org's Google Calendar integration status (for the UI
// card on Settings → Integraciones).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ connected: false }, { status: 200 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.organization_id) {
    return NextResponse.json({ connected: false });
  }

  const { data: integration } = await supabase
    .from("google_calendar_integrations")
    .select(
      "google_account_email, connected_at, last_sync_at, last_sync_error, last_sync_error_at, is_active"
    )
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    email: integration.google_account_email,
    connected_at: integration.connected_at,
    last_sync_at: integration.last_sync_at,
    last_sync_error: integration.last_sync_error,
    last_sync_error_at: integration.last_sync_error_at,
    is_active: integration.is_active,
  });
}
