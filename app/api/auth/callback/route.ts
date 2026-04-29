import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const inviteToken = searchParams.get("invite");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  // Prevent open redirect: only allow relative paths, block protocol-relative URLs
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  // Forward Supabase-provided errors (expired/used link, access denied, etc.)
  const supabaseError = searchParams.get("error");
  const supabaseErrorCode = searchParams.get("error_code");
  if (supabaseError || supabaseErrorCode) {
    const params = new URLSearchParams({
      error: supabaseErrorCode || supabaseError || "auth_failed",
    });
    return NextResponse.redirect(`${origin}/login?${params.toString()}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // If there's an invite token, accept the invitation
      if (inviteToken) {
        const { error: inviteError } = await supabase.rpc("accept_invitation", {
          invite_token: inviteToken,
        });
        if (inviteError) {
          console.error("Failed to accept invitation:", inviteError.message);
        }
      }

      // Backfill terms acceptance on user_profiles from auth metadata, and
      // gate first-time Google OAuth users behind /onboarding/accept-terms
      // when they never explicitly accepted.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const meta = user.user_metadata ?? {};
        const metaAcceptedAt =
          typeof meta.accepted_terms_at === "string" ? meta.accepted_terms_at : null;
        const metaTermsVer =
          typeof meta.accepted_terms_version === "string" ? meta.accepted_terms_version : null;
        const metaPrivacyAt =
          typeof meta.accepted_privacy_at === "string" ? meta.accepted_privacy_at : null;
        const metaPrivacyVer =
          typeof meta.accepted_privacy_version === "string" ? meta.accepted_privacy_version : null;

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("accepted_terms_at, accepted_privacy_at")
          .eq("id", user.id)
          .single();

        const profileAcceptedTerms = profile?.accepted_terms_at ?? null;
        const profileAcceptedPrivacy = profile?.accepted_privacy_at ?? null;

        // If profile is missing acceptance but auth metadata has it (email
        // signup path), copy it over now.
        if (!profileAcceptedTerms && metaAcceptedAt && metaTermsVer) {
          await supabase
            .from("user_profiles")
            .update({
              accepted_terms_at: metaAcceptedAt,
              accepted_terms_version: metaTermsVer,
              accepted_privacy_at: metaPrivacyAt ?? metaAcceptedAt,
              accepted_privacy_version: metaPrivacyVer ?? metaTermsVer,
            })
            .eq("id", user.id);
        } else if (!profileAcceptedTerms || !profileAcceptedPrivacy) {
          // Neither profile nor metadata have acceptance — typical for a
          // first-time Google OAuth signup. Force them through the consent
          // page before continuing to the requested `next`.
          if (!metaAcceptedAt || !metaTermsVer) {
            const acceptUrl = new URL(`${origin}/onboarding/accept-terms`);
            acceptUrl.searchParams.set("next", next);
            return NextResponse.redirect(acceptUrl.toString());
          }
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
    // exchange failed — forward a descriptive code
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
