// POST — manual "Actualizar hoja ahora" for the current user's org.
// Runs the exact same mirror as the nightly cron, but for a single org and
// gated on the authenticated user's role (owner/admin only). A receptionist
// gets 403.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runSheetsMirrorForOrg } from "@/lib/google-sheets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Owner/admin of some org only.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  if (!membership?.organization_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await runSheetsMirrorForOrg(membership.organization_id);

  if (result.status === "error") {
    return NextResponse.json(result, { status: 502 });
  }
  if (result.status === "skipped") {
    // e.g. sheets_disabled or missing_drive_scope — 409 so the UI can react.
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json(result);
}
