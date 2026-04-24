import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPortalSession, hashToken } from "@/lib/portal-auth";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(1),
  slug: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const { token, slug } = parsed.data;
    const supabase = createAdminClient();

    // The raw token comes from the email link; we look up by its SHA-256 hash.
    const tokenHash = hashToken(token);
    const { data: tokenRow } = await supabase
      .from("patient_portal_tokens")
      .select("id, organization_id, email, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .single();

    if (!tokenRow) {
      return NextResponse.json({ error: "invalid_token" }, { status: 400 });
    }

    if (tokenRow.used_at) {
      return NextResponse.json({ error: "token_used" }, { status: 400 });
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json({ error: "token_expired" }, { status: 400 });
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("id, slug")
      .eq("id", tokenRow.organization_id)
      .eq("slug", slug)
      .single();

    if (!org) {
      return NextResponse.json({ error: "invalid_token" }, { status: 400 });
    }

    await supabase
      .from("patient_portal_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenRow.id);

    const email = tokenRow.email.toLowerCase().trim();

    // Two separate queries to avoid `+` and other special chars breaking .or()
    const { data: byEmail } = await supabase
      .from("patients")
      .select("id, first_name, last_name, dni, portal_email, portal_verified_at")
      .eq("organization_id", org.id)
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    let patient = byEmail;
    if (!patient) {
      const { data: byPortalEmail } = await supabase
        .from("patients")
        .select("id, first_name, last_name, dni, portal_email, portal_verified_at")
        .eq("organization_id", org.id)
        .eq("portal_email", email)
        .limit(1)
        .maybeSingle();
      patient = byPortalEmail;
    }

    const hasCompleteData = !!(
      patient &&
      patient.first_name &&
      patient.last_name &&
      patient.dni
    );

    if (patient && (!patient.portal_email || !patient.portal_verified_at)) {
      await supabase
        .from("patients")
        .update({
          portal_email: email,
          portal_verified_at: patient.portal_verified_at || new Date().toISOString(),
        })
        .eq("id", patient.id);
    }

    await createPortalSession(
      org.id,
      email,
      hasCompleteData ? patient!.id : null
    );

    return NextResponse.json({
      success: true,
      needs_registration: !hasCompleteData,
    });
  } catch (err) {
    console.error("[Portal] verify error:", err);
    return NextResponse.json(
      { error: "Error interno. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
