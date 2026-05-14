import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { countActiveRecoveryCodes } from "@/lib/auth/mfa";

/**
 * GET /api/auth/mfa/status
 *
 * Returns the MFA state for the calling user:
 *   - enrolled:  has at least one VERIFIED totp factor
 *   - factor_id: convenience for the disable/regenerate flows
 *   - recovery_codes_active: how many unused codes are left
 *
 * Used by /account/security to decide which UI to render
 * (enroll vs manage). Owner/admin only — we hide the toggle
 * from doctor/receptionist in v1.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Role gate. We expose this endpoint only to owner/admin so a
  // doctor that somehow hits it doesn't get confusing data.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: factorList } = await admin.auth.admin.mfa.listFactors({
    userId: user.id,
  });

  const verified = (factorList?.factors ?? []).find(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );

  const recoveryCount = verified
    ? await countActiveRecoveryCodes(user.id)
    : 0;

  return NextResponse.json({
    enrolled: !!verified,
    factor_id: verified?.id ?? null,
    recovery_codes_active: recoveryCount,
  });
}
