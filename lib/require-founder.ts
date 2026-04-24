import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentFounder2FAUser } from "@/lib/founder-auth";

/**
 * Guard for founder API routes. Validates three independent layers:
 *
 *   1. Supabase auth — the request has an authenticated user.
 *   2. `user_profiles.is_founder = true` — the user has founder privileges.
 *   3. A valid `founder_2fa_session` cookie — the user completed 2FA within
 *      the last 4 hours.
 *
 * Before migration 104 + this helper, founder routes only checked (1) and
 * (2). The 2FA cookie was set by the login flow but never validated on
 * server — making it cosmetic. A compromised founder session (without 2FA)
 * could have hit every founder endpoint freely.
 *
 * Returns either:
 *   - `{ userId: string }` if all three layers pass
 *   - `{ error: NextResponse }` with the appropriate status code
 */
export async function requireFounder(): Promise<
  { userId: string } | { error: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_founder")
    .eq("id", user.id)
    .single();
  if (!profile?.is_founder) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const twoFaUserId = await getCurrentFounder2FAUser();
  if (!twoFaUserId || twoFaUserId !== user.id) {
    return {
      error: NextResponse.json(
        { error: "2FA required", code: "FOUNDER_2FA_MISSING" },
        { status: 403 }
      ),
    };
  }

  return { userId: user.id };
}
