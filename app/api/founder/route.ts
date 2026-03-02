import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET /api/founder — platform-level stats (founder only)
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify caller is a founder
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_founder")
    .eq("id", user.id)
    .single();

  if (!profile?.is_founder) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Use service role client to bypass RLS for platform-wide queries
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Missing service role credentials" }, { status: 500 });
  }

  const admin = createAdminClient(supabaseUrl, serviceKey);

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const [
      orgsRes,
      usersRes,
      patientsRes,
      appointmentsRes,
      revenueRes,
    ] = await Promise.all([
      admin.from("organizations").select("id, name, slug, organization_type, created_at", { count: "exact" }),
      admin.from("user_profiles").select("id", { count: "exact" }),
      admin.from("patients").select("id", { count: "exact" }),
      admin
        .from("appointments")
        .select("id", { count: "exact" })
        .gte("appointment_date", monthStart)
        .lt("appointment_date", monthEnd),
      admin
        .from("appointments")
        .select("price_snapshot")
        .eq("status", "completed")
        .gte("appointment_date", monthStart)
        .lt("appointment_date", monthEnd),
    ]);

    // Calculate revenue
    const revenue = (revenueRes.data ?? []).reduce(
      (sum, a) => sum + (a.price_snapshot ?? 0),
      0
    );

    // Orgs by type
    const orgsByType: Record<string, number> = {};
    for (const org of orgsRes.data ?? []) {
      const t = org.organization_type ?? "independiente";
      orgsByType[t] = (orgsByType[t] ?? 0) + 1;
    }

    // Recent orgs (last 10)
    const recentOrgs = (orgsRes.data ?? [])
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map((org) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        organization_type: org.organization_type ?? "independiente",
        created_at: org.created_at,
        plan_name: null,
        plan_slug: null,
        sub_status: null,
      }));

    const stats = {
      total_organizations: orgsRes.count ?? 0,
      total_users: usersRes.count ?? 0,
      total_patients: patientsRes.count ?? 0,
      total_appointments_this_month: appointmentsRes.count ?? 0,
      orgs_by_plan: [],
      orgs_by_type: Object.entries(orgsByType).map(([organization_type, org_count]) => ({
        organization_type,
        org_count,
      })),
      revenue_this_month: revenue,
      recent_orgs: recentOrgs,
    };

    return NextResponse.json(stats);
  } catch (err) {
    console.error("Founder stats error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
