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
  if (!session || !session.patient_id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const today = new Date().toISOString().split("T")[0];

  const [upcomingRes, pastRes] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, appointment_date, start_time, end_time, status, notes, origin, price_snapshot, doctors(full_name, specialty, photo_url), services(name, duration_minutes), offices(name)"
      )
      .eq("patient_id", session.patient_id)
      .eq("organization_id", session.organization_id)
      .gte("appointment_date", today)
      .in("status", ["scheduled", "confirmed"])
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(20),
    supabase
      .from("appointments")
      .select(
        "id, appointment_date, start_time, end_time, status, notes, origin, price_snapshot, doctors(full_name, specialty), services(name, duration_minutes), offices(name)"
      )
      .eq("patient_id", session.patient_id)
      .eq("organization_id", session.organization_id)
      .or(`appointment_date.lt.${today},status.in.(completed,cancelled,no_show)`)
      .order("appointment_date", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    upcoming: upcomingRes.data || [],
    past: pastRes.data || [],
  });
}
