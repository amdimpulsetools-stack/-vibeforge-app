import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";

// POST /api/onboarding/complete — marks the user's organization as onboarded.
// Used by:
//   1. The multi-step setup wizard when the user finishes.
//   2. The "Skip setup" shortcut (which still flags the org as onboarded so
//      middleware stops redirecting, but leaves a dashboard banner to nudge
//      the user to fill in the rest from Settings).
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) },
      }
    );
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No organization membership" }, { status: 403 });
  }

  // Only owner/admin can complete onboarding — invited members never see
  // the wizard, so this also guards against API misuse.
  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("organizations")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", membership.organization_id);

  if (error) {
    console.error("Onboarding complete error:", error);
    return NextResponse.json({ error: "Error al completar el onboarding" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
