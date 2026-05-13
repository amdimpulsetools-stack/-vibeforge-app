import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Parallel fetch of every table we aggregate. The previous version
  // also called `admin.auth.admin.listUsers()` here without pagination
  // — that pulls EVERY auth.users row across the whole project just
  // to read the owner email. user_profiles.email is already populated
  // by handle_new_user (mig 098+) so we read it from the table
  // instead — same data, no full-table fetch from auth.
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

  // Get owner profiles INCLUDING email — drops the auth.admin.listUsers call.
  const ownerIds = [...new Set(orgs.map((o) => o.owner_id).filter(Boolean))];
  const { data: ownerProfiles } = ownerIds.length > 0
    ? await admin
        .from("user_profiles")
        .select("id, full_name, avatar_url, email")
        .in("id", ownerIds)
    : { data: [] };

  // ── O(n²) → O(n) — index every collection by organization_id ──
  // The previous version ran `.filter()` over every collection for
  // every org. With 500+ orgs and ~100k rows per table it was
  // multi-second. Maps make the enrichment loop linear.
  const memberCountByOrg = new Map<string, { total: number; doctors: number; receptionists: number }>();
  for (const m of members) {
    const orgId = m.organization_id as string;
    const cur = memberCountByOrg.get(orgId) ?? { total: 0, doctors: 0, receptionists: 0 };
    cur.total++;
    if (m.role === "doctor") cur.doctors++;
    else if (m.role === "receptionist") cur.receptionists++;
    memberCountByOrg.set(orgId, cur);
  }

  const subByOrg = new Map<string, (typeof subs)[number]>();
  for (const s of subs) subByOrg.set(s.organization_id as string, s);

  const apptCountByOrg = new Map<string, number>();
  for (const a of allAppts) {
    const id = a.organization_id as string;
    apptCountByOrg.set(id, (apptCountByOrg.get(id) ?? 0) + 1);
  }

  const recentApptCountByOrg = new Map<string, number>();
  for (const a of recentAppts) {
    const id = a.organization_id as string;
    recentApptCountByOrg.set(id, (recentApptCountByOrg.get(id) ?? 0) + 1);
  }

  const revenueByOrg = new Map<string, number>();
  for (const p of payments) {
    const id = p.organization_id as string;
    revenueByOrg.set(id, (revenueByOrg.get(id) ?? 0) + Number(p.amount ?? 0));
  }

  const patientCountByOrg = new Map<string, number>();
  for (const p of patients) {
    const id = p.organization_id as string;
    patientCountByOrg.set(id, (patientCountByOrg.get(id) ?? 0) + 1);
  }

  const profileById = new Map<string, { full_name: string | null; avatar_url: string | null; email: string | null }>();
  for (const p of ownerProfiles ?? []) {
    profileById.set(p.id as string, {
      full_name: p.full_name as string | null,
      avatar_url: p.avatar_url as string | null,
      email: p.email as string | null,
    });
  }

  const enriched = orgs.map((org) => {
    const memberAgg = memberCountByOrg.get(org.id) ?? { total: 0, doctors: 0, receptionists: 0 };
    const orgSub = subByOrg.get(org.id) as Record<string, unknown> | undefined;
    const orgAppts = apptCountByOrg.get(org.id) ?? 0;
    const orgRecentAppts = recentApptCountByOrg.get(org.id) ?? 0;
    const orgRevenue = revenueByOrg.get(org.id) ?? 0;
    const orgPatients = patientCountByOrg.get(org.id) ?? 0;

    const ownerProfile = org.owner_id ? profileById.get(org.owner_id) : undefined;

    const plan = orgSub?.plans as Record<string, unknown> | undefined;
    const mrr = plan?.price_monthly ? Number(plan.price_monthly) : 0;

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
        email: ownerProfile?.email ?? null,
        avatar_url: ownerProfile?.avatar_url ?? null,
      },
      plan: plan?.name ?? null,
      mrr,
      subscription_status: subStatus ?? null,
      trial_ends_at: trialEnds ?? null,
      team: { total: memberAgg.total, doctors: memberAgg.doctors, receptionists: memberAgg.receptionists },
      patients: orgPatients,
      total_appointments: orgAppts,
      recent_appointments_30d: orgRecentAppts,
      total_revenue: orgRevenue,
      health_status: healthStatus,
    };
  });

  return NextResponse.json(enriched);
}
