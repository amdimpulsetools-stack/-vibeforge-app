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

      return NextResponse.redirect(`${origin}${next}`);
    }
    // exchange failed — forward a descriptive code
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}

