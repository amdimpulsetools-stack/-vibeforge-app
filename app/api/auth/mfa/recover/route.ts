import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRecoveryCode, clearRecoveryCodes } from "@/lib/auth/mfa";
import { emailLimiter } from "@/lib/rate-limit";

/**
 * POST /api/auth/mfa/recover
 *
 * Lost-device flow. The user submits email + password + one
 * unused recovery code. If all three check out:
 *   1. Validate the recovery code (consumes it — single use).
 *   2. DELETE every MFA factor on the user. This is the only
 *      way to short-circuit Supabase's AAL2 requirement without
 *      the actual TOTP code.
 *   3. Wipe remaining recovery codes — they're paired with the
 *      deleted factor and now meaningless.
 *   4. Return success. Client redirects to /login with a flash
 *      "Tu 2FA fue removido, volvé a configurarlo".
 *
 * Caller does NOT get a session here — they have to sign in
 * normally afterwards. This is intentional: it gives the user a
 * clean entry point and avoids edge cases around partial AAL
 * states.
 */

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  recovery_code: z.string().min(4).max(60),
});

export async function POST(request: NextRequest) {
  // Tight rate-limit — 5 attempts per minute per IP. The endpoint
  // is unauthenticated by design (the user can't log in without
  // it) so we have to defend against credential-stuffing here.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  // emailLimiter = 3/min — strict because this is an unauthenticated
  // endpoint that effectively bypasses MFA, prime target for stuffing.
  const rl = emailLimiter(`mfa-recover:${ip}`);
  if (!rl.success) {
    return NextResponse.json(
      { error: "too_many_requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) },
      },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { email, password, recovery_code } = parsed.data;

  // Step 1: validate password using an EPHEMERAL ssr client that
  // doesn't touch the response cookies. We don't want to issue a
  // session here — we just need to know if email+password is
  // valid and which user that is.
  const ephemeralCookies = new Map<string, string>();
  const ephemeral = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Array.from(ephemeralCookies.entries()).map(([name, value]) => ({
            name,
            value,
          }));
        },
        setAll(cookies: { name: string; value: string }[]) {
          for (const c of cookies) ephemeralCookies.set(c.name, c.value);
        },
      },
    },
  );

  const signIn = await ephemeral.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.user) {
    // Generic message — don't leak whether email exists.
    return NextResponse.json(
      { error: "invalid_credentials" },
      { status: 401 },
    );
  }

  const userId = signIn.data.user.id;

  // Step 2: validate the recovery code. consumeRecoveryCode marks
  // it used iff the hash matches, in a single round trip.
  const valid = await consumeRecoveryCode(userId, recovery_code);
  if (!valid) {
    // Important: we already authenticated the user against the
    // password successfully — but we did NOT issue a session
    // (we used an ephemeral client). So a wrong recovery code
    // just returns 401, no partial state leaks.
    return NextResponse.json(
      { error: "invalid_recovery_code" },
      { status: 401 },
    );
  }

  // Step 3: delete every MFA factor for this user.
  const admin = createAdminClient();
  const { data: factorList } = await admin.auth.admin.mfa.listFactors({
    userId,
  });
  for (const f of factorList?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ userId, id: f.id });
  }

  // Step 4: clear remaining recovery codes.
  await clearRecoveryCodes(userId);

  // Done. Client redirects to /login with a flash message — user
  // logs in normally (no MFA challenge now) and re-enrolls from
  // /account/security.
  return NextResponse.json({ ok: true });
}
