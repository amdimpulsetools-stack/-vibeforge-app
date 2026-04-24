import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    orgsRes,
    usersRes,
    doctorsRes,
    patientsRes,
    apptsRes,
    monthApptsRes,
    subsRes,
    aiRes,
    ticketsRes,
    paymentsRes,
    plansRes,
    recentApptsRes,
  ] = await Promise.all([
    admin.from("organizations").select("id, is_active, created_at"),
    admin.from("user_profiles").select("id"),
    admin.from("doctors").select("id"),
    admin.from("patients").select("id"),
    admin.from("appointments").select("id"),
    admin.from("appointments").select("id").gte("appointment_date", monthStart),
    admin.from("organization_subscriptions").select("id, organization_id, status, plan_id, cancelled_at, trial_ends_at, created_at"),
    admin.from("ai_query_usage").select("id").gte("created_at", new Date(now.getFullYear(), now.getMonth(), 1).toISOString()),
    admin.from("support_tickets").select("id").eq("status", "open"),
    admin.from("patient_payments").select("amount, created_at"),
    admin.from("plans").select("id, price_monthly"),
    admin.from("appointments").select("organization_id").gte("appointment_date", thirtyDaysAgo),
  ]);

  const orgs = orgsRes.data ?? [];
  const subs = subsRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const plans = plansRes.data ?? [];
  const recentAppts = recentApptsRes.data ?? [];

  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  // Current month revenue
  const currentMonthRevenue = payments
    .filter((p) => p.created_at >= monthStart)
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  // Previous month revenue
  const prevMonthRevenue = payments
    .filter((p) => p.created_at >= prevMonthStart && p.created_at <= prevMonthEnd)
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  // MRR from active subscriptions
  const activeSubs = subs.filter((s) => s.status === "active");
  const mrr = activeSubs.reduce((sum, s) => {
    const plan = plans.find((p) => p.id === s.plan_id);
    return sum + Number(plan?.price_monthly ?? 0);
  }, 0);

  // Trial orgs
  const trialSubs = subs.filter((s) => s.status === "trialing");

  // Churned this month
  const churnedThisMonth = subs.filter(
    (s) => s.status === "cancelled" && s.cancelled_at && s.cancelled_at >= monthStart
  ).length;

  // Churn rate (cancelled / (active + cancelled) this month)
  const churnRate = activeSubs.length + churnedThisMonth > 0
    ? ((churnedThisMonth / (activeSubs.length + churnedThisMonth)) * 100)
    : 0;

  // Trial → Paid conversion (all time)
  const allTrialsThatConverted = subs.filter((s) => s.status === "active").length;
  const allTrials = subs.length;
  const trialConversion = allTrials > 0 ? ((allTrialsThatConverted / allTrials) * 100) : 0;

  // Orgs with recent activity (appointments in last 30 days)
  const activeOrgIds = new Set(recentAppts.map((a) => a.organization_id));
  const activationRate = orgs.length > 0 ? ((activeOrgIds.size / orgs.length) * 100) : 0;

  // Orgs by health
  const dormantOrgs = orgs.filter((o) => o.is_active && !activeOrgIds.has(o.id)).length;

  // Revenue delta
  const revenueDelta = prevMonthRevenue > 0
    ? (((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
    : 0;

  return NextResponse.json({
    // Core
    totalOrgs: orgs.length,
    activeOrgs: orgs.filter((o) => o.is_active).length,
    totalUsers: usersRes.data?.length ?? 0,
    totalDoctors: doctorsRes.data?.length ?? 0,
    totalPatients: patientsRes.data?.length ?? 0,
    totalAppointments: apptsRes.data?.length ?? 0,
    monthlyAppointments: monthApptsRes.data?.length ?? 0,
    totalRevenue,
    activeSubscriptions: activeSubs.length,
    trialingOrgs: trialSubs.length,
    aiQueriesThisMonth: aiRes.data?.length ?? 0,
    openTickets: ticketsRes.data?.length ?? 0,
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
