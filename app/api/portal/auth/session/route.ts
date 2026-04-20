import { NextRequest, NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "missing_slug" }, { status: 400 });
  }

  const session = await getPortalSession(slug);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  const supabase = createAdminClient();

  let patient = null;
  if (session.patient_id) {
    const { data } = await supabase
      .from("patients")
      .select("id, first_name, last_name, portal_email, portal_phone, dni")
      .eq("id", session.patient_id)
      .single();
    patient = data;
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name, slug, logo_url")
    .eq("id", session.organization_id)
    .single();

  const { data: settings } = await supabase
    .from("booking_settings")
    .select("portal_enabled, portal_allow_cancel, portal_allow_reschedule, portal_min_cancel_hours, portal_welcome_message, accent_color")
    .eq("organization_id", session.organization_id)
    .single();

  return NextResponse.json({
    authenticated: true,
    needs_registration: !session.patient_id,
    session: {
      id: session.id,
      email: session.email,
      organization_id: session.organization_id,
    },
    patient,
    organization: org,
    portal_settings: settings,
  });
}
