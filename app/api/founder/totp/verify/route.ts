import { NextResponse } from "next/server";
import { verify as verifyTotp } from "otplib";
import { decrypt } from "@/lib/encryption";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createFounder2FASession,
  FOUNDER_SESSION_COOKIE,
  FOUNDER_SESSION_TTL,
} from "@/lib/founder-auth";

export async function POST(request: Request) {
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
      .select("is_founder, totp_secret, totp_enabled")
      .eq("id", user.id)
      .single();

    if (!profile?.is_founder) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!profile.totp_secret) {
      return NextResponse.json(
        { error: "TOTP not set up. Call /api/founder/totp/setup first." },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const code = body?.code as string;

    if (!code || !/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { error: "Invalid code. Must be a 6-digit number." },
        { status: 400 }
      );
    }

    // Decrypt secret and verify code
    const secret = decrypt(profile.totp_secret);
    const result = await verifyTotp({ token: code, secret });

    if (!result.valid) {
      return NextResponse.json(
        { error: "Invalid TOTP code" },
        { status: 401 }
      );
    }

    // Enable TOTP if first time verification
    if (!profile.totp_enabled) {
      const admin = createAdminClient();
      const { error: updateError } = await admin
        .from("user_profiles")
        .update({ totp_enabled: true })
        .eq("id", user.id);

      if (updateError) {
        console.error("Failed to enable TOTP:", updateError);
        return NextResponse.json(
          { error: "Failed to enable TOTP" },
          { status: 500 }
        );
      }
    }

    // Create 2FA session
    const sessionToken = createFounder2FASession(user.id);

    const response = NextResponse.json({ success: true });
    response.cookies.set(FOUNDER_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/founder-dashboard",
      maxAge: FOUNDER_SESSION_TTL / 1000, // maxAge is in seconds
    });

    return response;
  } catch (error) {
    console.error("TOTP verify error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
