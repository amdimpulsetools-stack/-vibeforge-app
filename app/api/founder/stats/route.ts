import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();
  const now = new Date();
  const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const prevMonthStartIso = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  // First moment of the current month — used as the open upper bound
  // for "previous month" (i.e. payments BEFORE this datetime).
  const prevMonthEndIso = monthStartIso;
  const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Every counter on the founder home was previously implemented as
  // ".select('id')" + ".length" — fetched all rows just to count.
  // head:true counts let Postgres compute them and ship the integer.
  const [
    orgsRes,                  // rows: needed for breakdown (is_active, created_at)
    activeOrgsCountRes,       // count only
    usersCountRes,            // count only
    doctorsCountRes,          // count only
    patientsCountRes,         // count only
    totalApptsCountRes,       // count only
    monthApptsCountRes,       // count only
    subsRes,                  // rows: needed for cancel/churn/trial breakdown
    aiQueriesThisMonthCountRes, // count only
    openTicketsCountRes,      // count only
    plansRes,                 // rows: needed to look up price_monthly by plan_id
    recentApptsRes,           // rows: dedupe org_ids to compute activation
    revenueRpcRes,            // RPC: total + month + prev_month sums
  ] = await Promise.all([
    admin.from("organizations").select("id, is_active"),
    admin.from("organizations")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    admin.from("user_profiles")
      .select("id", { count: "exact", head: true }),
    admin.from("doctors")
      .select("id", { count: "exact", head: true }),
    admin.from("patients")
      .select("id", { count: "exact", head: true }),
    admin.from("appointments")
      .select("id", { count: "exact", head: true }),
    admin.from("appointments")
      .select("id", { count: "exact", head: true })
      .gte("appointment_date", monthStartIso),
    admin.from("organization_subscriptions")
      .select("id, organization_id, status, plan_id, cancelled_at, trial_ends_at, created_at"),
    admin.from("ai_query_usage")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStartIso),
    admin.from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    admin.from("plans").select("id, price_monthly"),
    admin.from("appointments")
      .select("organization_id")
      .gte("appointment_date", thirtyDaysAgoIso),
    admin.rpc("founder_revenue_summary", {
      p_current_month_start: monthStartIso,
      p_prev_month_start: prevMonthStartIso,
      p_prev_month_end: prevMonthEndIso,
    }),
  ]);

  const orgs = orgsRes.data ?? [];
  const subs = subsRes.data ?? [];
  const plans = plansRes.data ?? [];
  const recentAppts = recentApptsRes.data ?? [];

  // Revenue sums come pre-aggregated from the RPC — no row payload.
  const rev = (revenueRpcRes.data ?? {
    total_revenue: 0,
    current_month_revenue: 0,
    prev_month_revenue: 0,
  }) as { total_revenue: number; current_month_revenue: number; prev_month_revenue: number };
  const totalRevenue = Number(rev.total_revenue ?? 0);
  const currentMonthRevenue = Number(rev.current_month_revenue ?? 0);
  const prevMonthRevenue = Number(rev.prev_month_revenue ?? 0);

  // Plan price lookup as Map (avoid .find() in the reduce)
  const planPriceById = new Map<string, number>();
  for (const p of plans) planPriceById.set(p.id as string, Number(p.price_monthly ?? 0));

  const activeSubs = subs.filter((s) => s.status === "active");
  const mrr = activeSubs.reduce(
    (sum, s) => sum + (planPriceById.get(s.plan_id as string) ?? 0),
    0,
  );

  const trialSubs = subs.filter((s) => s.status === "trialing");
  const churnedThisMonth = subs.filter(
    (s) => s.status === "cancelled" && s.cancelled_at && s.cancelled_at >= monthStartIso,
  ).length;
  const churnRate = activeSubs.length + churnedThisMonth > 0
    ? (churnedThisMonth / (activeSubs.length + churnedThisMonth)) * 100
    : 0;

  const allTrialsThatConverted = activeSubs.length;
  const allTrials = subs.length;
  const trialConversion = allTrials > 0
    ? (allTrialsThatConverted / allTrials) * 100
    : 0;

  const activeOrgIds = new Set(recentAppts.map((a) => a.organization_id as string));
  const activationRate = orgs.length > 0
    ? (activeOrgIds.size / orgs.length) * 100
    : 0;
  const dormantOrgs = orgs.filter((o) => o.is_active && !activeOrgIds.has(o.id as string)).length;

  const revenueDelta = prevMonthRevenue > 0
    ? ((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100
    : 0;

  return NextResponse.json({
    // Core counts (now head:true, no row payloads)
    totalOrgs: orgs.length,
    activeOrgs: activeOrgsCountRes.count ?? 0,
    totalUsers: usersCountRes.count ?? 0,
    totalDoctors: doctorsCountRes.count ?? 0,
    totalPatients: patientsCountRes.count ?? 0,
    totalAppointments: totalApptsCountRes.count ?? 0,
    monthlyAppointments: monthApptsCountRes.count ?? 0,
    totalRevenue,
    activeSubscriptions: activeSubs.length,
    trialingOrgs: trialSubs.length,
    aiQueriesThisMonth: aiQueriesThisMonthCountRes.count ?? 0,
    openTickets: openTicketsCountRes.count ?? 0,
    // SaaS metrics
    mrr,
    arr: mrr * 12,
    currentMonthRevenue,
    prevMonthRevenue,
    revenueDelta: Math.round(revenueDelta * 10) / 10,
    churnedThisMonth,
    churnRate: Math.round(churnRate * 10) / 10,
    trialConversion: Math.round(trialConversion * 10) / 10,
    activationRate: Math.round(activationRate * 10) / 10,
    dormantOrgs,
  });
}
