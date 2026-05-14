import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  regenerateRecoveryCodes,
  countActiveRecoveryCodes,
} from "@/lib/auth/mfa";

/**
 * POST /api/auth/mfa/recovery-codes
 *
 * Generates a fresh set of 10 plaintext recovery codes, replacing
 * any previous ones. Plaintext is returned ONCE — never stored.
 *
 * Required preconditions:
 *   - User is authenticated.
 *   - User has at least one VERIFIED TOTP factor (we don't want
 *     to hand out recovery codes for a half-enrolled factor that
 *     can't be used to authenticate in the first place).
 *
 * The endpoint is called from two places:
 *   1. Right after a successful enroll (MfaEnrollDialog) to show
 *      the user their codes for the first time.
 *   2. From /account/security when the user clicks "Regenerar
 *      códigos" — this invalidates any old printout.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Require a verified TOTP factor before we hand out codes.
  // Use admin client because auth.admin.mfa.* lives there.
  const admin = createAdminClient();
  const { data: factorList } = await admin.auth.admin.mfa.listFactors({
    userId: user.id,
  });
  const hasVerified = (factorList?.factors ?? []).some(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  if (!hasVerified) {
    return NextResponse.json(
      { error: "mfa_not_enrolled" },
      { status: 400 },
    );
  }

  const result = await regenerateRecoveryCodes(user.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: "regenerate_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ codes: result.codes });
}

/**
 * GET /api/auth/mfa/recovery-codes
 *
 * Returns the count of unused codes for the calling user (not
 * the plaintext — plaintext is only available at generation
 * time). Used by /account/security to show a "Tenés N códigos
 * de recuperación restantes" indicator.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const count = await countActiveRecoveryCodes(user.id);
  return NextResponse.json({ active: count });
}
