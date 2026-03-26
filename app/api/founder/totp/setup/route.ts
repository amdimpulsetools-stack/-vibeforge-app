import { NextResponse } from "next/server";
import { generateSecret, generateURI } from "otplib";
import QRCode from "qrcode";
import { encrypt } from "@/lib/encryption";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
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
      .select("is_founder")
      .eq("id", user.id)
      .single();

    if (!profile?.is_founder) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Generate TOTP secret
    const secret = generateSecret();

    // Encrypt and save to DB (using admin client to bypass RLS)
    const encryptedSecret = encrypt(secret);
    const admin = createAdminClient();

    const { error: updateError } = await admin
      .from("user_profiles")
      .update({ totp_secret: encryptedSecret })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to save TOTP secret:", updateError);
      return NextResponse.json(
        { error: "Failed to save TOTP secret" },
        { status: 500 }
      );
    }

    // Generate QR code URL using otplib keyuri equivalent
    const otpAuthUrl = generateURI({
      issuer: "VibeForge",
      label: user.email ?? user.id,
      secret,
    });
    const qrCode = await QRCode.toDataURL(otpAuthUrl);

    return NextResponse.json({ qrCode, secret });
  } catch (error) {
    console.error("TOTP setup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
