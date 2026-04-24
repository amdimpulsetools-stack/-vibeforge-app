// Disconnects the org's Google Calendar integration.
//
// 1) Looks up the row, decrypts the access token.
// 2) Best-effort revokes the token at Google's side.
// 3) Deletes the integration row.
//
// Existing google_event_id values on appointments are left untouched —
// the events stay on Google's side as a historical record. Re-connecting
// with a different account won't replay them; they remain orphaned IDs
// (harmless since we never re-use them on cancel/update without the
// active integration).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { revokeToken } from "@/lib/google-calendar";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  if (!membership?.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: integration } = await admin
    .from("google_calendar_integrations")
    .select("id, access_token_encrypted")
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  if (integration) {
    try {
      const accessToken = decrypt(integration.access_token_encrypted as string);
      await revokeToken(accessToken);
    } catch {
      // Best-effort. Decryption could fail if the key was rotated; we still
      // want to clean up the row.
    }

    await admin
      .from("google_calendar_integrations")
      .delete()
      .eq("id", integration.id);
  }

  return NextResponse.json({ success: true });
}
