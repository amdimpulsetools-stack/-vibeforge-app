import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [orgsRes, membersRes, subsRes, apptsRes, recentApptsRes, paymentsRes, patientsRes] =
    await Promise.all([
      admin
        .from("organizations")
        .select("id, name, slug, is_active, organization_type, owner_id, created_at")
        .order("created_at", { ascending: false }),
      admin
        .from("organization_members")
        .select("organization_id, user_id, role"),
      admin
        .from("organization_subscriptions")
        .select("organization_id, status, plan_id, billing_cycle, current_period_end, cancelled_at, trial_ends_at, plans(name, price_monthly)"),
      admin
        .from("appointments")
        .select("organization_id"),
      admin
        .from("appointments")
        .select("organization_id")
        .gte("appointment_date", thirtyDaysAgo),
      admin
        .from("patient_payments")
        .select("organization_id, amount"),
      admin
        .from("patients")
        .select("organization_id"),
    ]);

  const orgs = orgsRes.data ?? [];
  const members = membersRes.data ?? [];
  const subs = subsRes.data ?? [];
  const allAppts = apptsRes.data ?? [];
  const recentAppts = recentApptsRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const patients = patientsRes.data ?? [];

  // Get owner profiles
  const ownerIds = [...new Set(orgs.map((o) => o.owner_id).filter(Boolean))];
  const { data: ownerProfiles } = ownerIds.length > 0
    ? await admin
        .from("user_profiles")
        .select("id, full_name, avatar_url")
        .in("id", ownerIds)
    : { data: [] };

  // Get owner auth emails
  const { data: authUsers } = ownerIds.length > 0
    ? await admin.auth.admin.listUsers()
    : { data: { users: [] } };
  const authUsersArr = Array.isArray(authUsers) ? authUsers : (authUsers as { users: unknown[] })?.users ?? [];

  const enriched = orgs.map((org) => {
    const orgMembers = members.filter((m) => m.organization_id === org.id);
    const orgSub = subs.find((s) => s.organization_id === org.id) as Record<string, unknown> | undefined;
    const orgAppts = allAppts.filter((a) => a.organization_id === org.id).length;
    const orgRecentAppts = recentAppts.filter((a) => a.organization_id === org.id).length;
    const orgRevenue = payments
      .filter((p) => p.organization_id === org.id)
      .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    const orgPatients = patients.filter((p) => p.organization_id === org.id).length;

    const ownerProfile = (ownerProfiles ?? []).find((p) => p.id === org.owner_id);
    const ownerAuth = authUsersArr.find((u: Record<string, unknown>) => u.id === org.owner_id) as Record<string, unknown> | undefined;

    const plan = orgSub?.plans as Record<string, unknown> | undefined;
    const mrr = plan?.price_monthly ? Number(plan.price_monthly) : 0;

    const doctors = orgMembers.filter((m) => m.role === "doctor").length;
    const receptionists = orgMembers.filter((m) => m.role === "receptionist").length;

    const subStatus = orgSub?.status as string | undefined;
    const cancelledAt = orgSub?.cancelled_at as string | undefined;
    const trialEnds = orgSub?.trial_ends_at as string | undefined;

    let healthStatus: "healthy" | "at_risk" | "dormant" | "churned" | "trial";
    if (subStatus === "cancelled" || (subStatus === "past_due" && cancelledAt)) {
      healthStatus = "churned";
    } else if (subStatus === "trialing") {
      healthStatus = "trial";
    } else if (orgRecentAppts === 0 && orgAppts > 0) {
      healthStatus = "dormant";
    } else if (orgRecentAppts < 3 && subStatus === "active") {
      healthStatus = "at_risk";
    } else {
      healthStatus = "healthy";
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.organization_type,
      is_active: org.is_active,
      created_at: org.created_at,
      owner: {
        id: org.owner_id,
        name: ownerProfile?.full_name ?? null,
        email: ownerAuth?.email ?? null,
        avatar_url: ownerProfile?.avatar_url ?? null,
      },
      plan: plan?.name ?? null,
      mrr,
      subscription_status: subStatus ?? null,
      trial_ends_at: trialEnds ?? null,
      team: { total: orgMembers.length, doctors, receptionists },
      patients: orgPatients,
      total_appointments: orgAppts,
      recent_appointments_30d: orgRecentAppts,
      total_revenue: orgRevenue,
      health_status: healthStatus,
    };
  });

  return NextResponse.json(enriched);
}
