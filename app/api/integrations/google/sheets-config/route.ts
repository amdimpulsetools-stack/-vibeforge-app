// PUT — toggle the Google Sheets backup (sheets_enabled) for the current org.
// Owner/admin only. Mirrors the role gating of the Calendar description config
// endpoint. The actual mirror writing happens via the cron or the
// sheets-refresh endpoint.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasDriveScope } from "@/lib/google-calendar";

export const runtime = "nodejs";

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.organization_id) {
    return NextResponse.json({ error: "no_org" }, { status: 403 });
  }
  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { enabled?: boolean };
  try {
    body = (await req.json()) as { enabled?: boolean };
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const enabled = !!body.enabled;

  const admin = createAdminClient();

  // Guard: enabling requires an active integration WITH the drive.file scope.
  const { data: integration } = await admin
    .from("google_calendar_integrations")
    .select("id, scope, is_active")
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  const row = integration as { id: string; scope: string | null; is_active: boolean } | null;
  if (!row || !row.is_active) {
    return NextResponse.json({ error: "not_connected" }, { status: 409 });
  }
  if (enabled && !hasDriveScope(row.scope)) {
    return NextResponse.json({ error: "missing_drive_scope" }, { status: 409 });
  }

  const { error } = await admin
    .from("google_calendar_integrations")
    .update({ sheets_enabled: enabled })
    .eq("id", row.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sheets_enabled: enabled });
}
