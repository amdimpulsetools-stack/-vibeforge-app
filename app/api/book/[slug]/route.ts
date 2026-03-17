import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bookingLimiter = rateLimit({ max: 30, windowMs: 60 * 1000 });

/**
 * GET /api/book/[slug]
 *
 * Public endpoint — returns organization info, active doctors,
 * services, schedules, and available slots for the booking page.
 * No authentication required.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = bookingLimiter(`book:${ip}`);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { status: 429 }
    );
  }

  const supabase = createAdminClient();

  // 1. Fetch organization by slug
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, slug, logo_url, address, organization_type, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (orgError || !org) {
    return NextResponse.json(
      { error: "Organización no encontrada" },
      { status: 404 }
    );
  }

  // 2. Check booking settings
  const { data: bookingSettings } = await supabase
    .from("booking_settings")
    .select("*")
    .eq("organization_id", org.id)
    .eq("is_enabled", true)
    .single();

  if (!bookingSettings) {
    return NextResponse.json(
      { error: "Reserva en línea no habilitada" },
      { status: 403 }
    );
  }

  // 3. Fetch active doctors with their schedules
  const { data: doctors } = await supabase
    .from("doctors")
    .select("id, full_name, specialty, photo_url")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("full_name");

  // 4. Fetch doctor services
  const doctorIds = (doctors || []).map((d) => d.id);
  const { data: doctorServices } = await supabase
    .from("doctor_services")
    .select("doctor_id, service_id")
    .in("doctor_id", doctorIds.length > 0 ? doctorIds : ["__none__"]);

  // 5. Fetch active services
  const serviceIds = [
    ...new Set((doctorServices || []).map((ds) => ds.service_id)),
  ];
  const { data: services } = await supabase
    .from("services")
    .select("id, name, duration_minutes, base_price, modality")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .in("id", serviceIds.length > 0 ? serviceIds : ["__none__"])
    .order("name");

  // 6. Fetch doctor schedules
  const { data: schedules } = await supabase
    .from("doctor_schedules")
    .select("doctor_id, day_of_week, start_time, end_time")
    .in("doctor_id", doctorIds.length > 0 ? doctorIds : ["__none__"]);

  // 7. Fetch offices
  const { data: offices } = await supabase
    .from("offices")
    .select("id, name")
    .eq("organization_id", org.id)
    .eq("is_active", true)
    .order("display_order");

  // 8. Fetch clinic phone & email from global variables
  const { data: globalVars } = await supabase
    .from("global_variables")
    .select("key, current_value")
    .eq("organization_id", org.id)
    .in("key", ["clinic_phone", "clinic_email"]);

  const clinicPhone =
    globalVars?.find((v) => v.key === "clinic_phone")?.current_value || "";
  const clinicEmail =
    globalVars?.find((v) => v.key === "clinic_email")?.current_value || "";

  // 9. Fetch existing appointments for the next N days (for slot availability)
  const today = new Date().toISOString().split("T")[0];
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + bookingSettings.max_advance_days);
  const maxDateStr = maxDate.toISOString().split("T")[0];

  const { data: existingAppointments } = await supabase
    .from("appointments")
    .select("doctor_id, office_id, appointment_date, start_time, end_time")
    .eq("organization_id", org.id)
    .in("status", ["scheduled", "confirmed"])
    .gte("appointment_date", today)
    .lte("appointment_date", maxDateStr);

  // 10. Fetch schedule blocks
  const { data: scheduleBlocks } = await supabase
    .from("schedule_blocks")
    .select("office_id, block_date, start_time, end_time, all_day")
    .eq("organization_id", org.id)
    .gte("block_date", today)
    .lte("block_date", maxDateStr);

  return NextResponse.json({
    organization: {
      name: org.name,
      slug: org.slug,
      logo_url: org.logo_url,
      address: org.address,
      phone: clinicPhone,
      email: clinicEmail,
    },
    booking_settings: {
      max_advance_days: bookingSettings.max_advance_days,
      min_lead_hours: bookingSettings.min_lead_hours,
      welcome_message: bookingSettings.welcome_message,
      require_email: bookingSettings.require_email,
      require_phone: bookingSettings.require_phone,
      require_dni: bookingSettings.require_dni,
      accent_color: bookingSettings.accent_color,
    },
    doctors: doctors || [],
    services: services || [],
    doctor_services: doctorServices || [],
    schedules: schedules || [],
    offices: offices || [],
    existing_appointments: existingAppointments || [],
    schedule_blocks: scheduleBlocks || [],
  });
}
