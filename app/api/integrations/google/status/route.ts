// Returns the current org's Google Calendar integration status (for the UI
// card on Settings → Integraciones).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasDriveScope } from "@/lib/google-calendar";

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
      "google_account_email, connected_at, last_sync_at, last_sync_error, last_sync_error_at, is_active, scope, sheets_enabled, sheets_spreadsheet_id"
    )
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ connected: false });
  }

  const sheetsIntegration = integration as typeof integration & {
    scope?: string | null;
    sheets_enabled?: boolean | null;
    sheets_spreadsheet_id?: string | null;
  };

  return NextResponse.json({
    connected: true,
    email: integration.google_account_email,
    connected_at: integration.connected_at,
    last_sync_at: integration.last_sync_at,
    last_sync_error: integration.last_sync_error,
    last_sync_error_at: integration.last_sync_error_at,
    is_active: integration.is_active,
    // Google Sheets mirror (mig 179)
    sheets_enabled: !!sheetsIntegration.sheets_enabled,
    sheets_spreadsheet_id: sheetsIntegration.sheets_spreadsheet_id ?? null,
    has_drive_scope: hasDriveScope(sheetsIntegration.scope),
  });
}
