import { NextRequest, NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "missing_slug" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const session = await getPortalSession(slug);
  if (!session) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, slug, logo_url")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    let portalSettings = null;
    if (org) {
      const { data: settings } = await supabase
        .from("booking_settings")
        .select("portal_enabled, accent_color, portal_welcome_message")
        .eq("organization_id", org.id)
        .single();
      portalSettings = settings;
    }

    return NextResponse.json({
      authenticated: false,
      organization: org ? { name: org.name, slug: org.slug, logo_url: org.logo_url } : null,
      portal_settings: portalSettings,
    });
  }

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
    .select("portal_enabled, portal_allow_cancel, portal_allow_reschedule, portal_min_cancel_hours, portal_welcome_message, accent_color, allow_online_booking")
    .eq("organization_id", session.organization_id)
    .single();

  // Clinic contact info (from global_variables) — used by the contact modal
  // when online booking is disabled. Scoped to this organization.
  const { data: vars } = await supabase
    .from("global_variables")
    .select("key, value")
    .eq("organization_id", session.organization_id)
    .in("key", ["clinic_phone", "clinic_email"]);

  const contact = {
    phone: vars?.find((v) => v.key === "clinic_phone")?.value || null,
    email: vars?.find((v) => v.key === "clinic_email")?.value || null,
  };

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
    clinic_contact: contact,
  });
}
