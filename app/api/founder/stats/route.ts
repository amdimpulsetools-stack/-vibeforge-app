import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/founder/stats — platform-wide stats (bypasses RLS)
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_founder")
    .eq("id", user.id)
    .single();

  if (!profile?.is_founder) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

  const [orgsRes, usersRes, doctorsRes, patientsRes, apptsRes, monthApptsRes, subsRes, aiRes, ticketsRes, paymentsRes] = await Promise.all([
    admin.from("organizations").select("id, is_active"),
    admin.from("user_profiles").select("id"),
    admin.from("doctors").select("id"),
    admin.from("patients").select("id"),
    admin.from("appointments").select("id"),
    admin.from("appointments").select("id").gte("appointment_date", monthStart),
    admin.from("organization_subscriptions").select("id, status"),
    admin.from("ai_query_usage").select("id").gte("created_at", new Date(now.getFullYear(), now.getMonth(), 1).toISOString()),
    admin.from("support_tickets").select("id").eq("status", "open"),
    admin.from("patient_payments").select("amount"),
  ]);

  const orgs = orgsRes.data ?? [];
  const subs = subsRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  return NextResponse.json({
    totalOrgs: orgs.length,
    activeOrgs: orgs.filter((o) => o.is_active).length,
    totalUsers: usersRes.data?.length ?? 0,
    totalDoctors: doctorsRes.data?.length ?? 0,
    totalPatients: patientsRes.data?.length ?? 0,
    totalAppointments: apptsRes.data?.length ?? 0,
    monthlyAppointments: monthApptsRes.data?.length ?? 0,
    totalRevenue,
    activeSubscriptions: subs.filter((s) => s.status === "active").length,
    trialingOrgs: subs.filter((s) => s.status === "trialing").length,
    aiQueriesThisMonth: aiRes.data?.length ?? 0,
    openTickets: ticketsRes.data?.length ?? 0,
  });
}
