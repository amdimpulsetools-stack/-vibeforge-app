import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  validateFounder2FASession,
  FOUNDER_SESSION_COOKIE,
} from "@/lib/founder-auth";

export async function GET() {
  try {
    const supabase = await createClient();

    // Check auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check is_founder
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("is_founder, totp_enabled")
      .eq("id", user.id)
      .single();

    if (!profile?.is_founder) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if 2FA session cookie is valid
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(FOUNDER_SESSION_COOKIE)?.value;
    const verified = sessionToken
      ? validateFounder2FASession(sessionToken)
      : false;

    return NextResponse.json({
      totpEnabled: profile.totp_enabled ?? false,
      verified,
    });
  } catch (error) {
    console.error("TOTP status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
