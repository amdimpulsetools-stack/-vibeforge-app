import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminDashboard } from "./admin-dashboard";
import { DoctorDashboardWrapper } from "./doctor-dashboard-wrapper";
import { OwnerDoctorSection } from "./owner-doctor-section";
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  eachDayOfInterval,
  getDay,
} from "date-fns";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role, organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) redirect("/login");

  // Get display name from user_profiles (updated by user in account page)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const displayName = profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "";

  const role = membership.role as "owner" | "admin" | "receptionist" | "doctor";

  // Doctor role: show personal dashboard
  if (role === "doctor") {
    return (
      <DoctorDashboardWrapper
        userName={displayName}
      />
    );
  }

  // Receptionist: redirect to scheduler (their primary workspace)
  if (role === "receptionist") redirect("/scheduler");

  // Date ranges
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");
  const lastMonthStart = format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
  const lastMonthEnd = format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
  const weekStart = format(subDays(now, 6), "yyyy-MM-dd");
  const prevWeekStart = format(subDays(now, 13), "yyyy-MM-dd");
  const prevWeekEnd = format(subDays(now, 7), "yyyy-MM-dd");
  const yesterday = format(subDays(now, 1), "yyyy-MM-dd");

  // Single RPC call for all dashboard data
  const { data: stats } = await supabase.rpc("get_admin_dashboard_stats", {
    p_today: today,
    p_month_start: monthStart,
    p_month_end: monthEnd,
    p_last_month_start: lastMonthStart,
    p_last_month_end: lastMonthEnd,
    p_week_start: weekStart,
    p_prev_week_start: prevWeekStart,
    p_prev_week_end: prevWeekEnd,
    p_yesterday: yesterday,
  });

  // Fallback if RPC fails
  if (!stats) redirect("/scheduler");

  // ── Helpers ────────────────────────────────────────────────────
  const computeGrowth = (current: number, previous: number) =>
    previous > 0
      ? Math.round(((current - previous) / previous) * 100)
      : current > 0
        ? 100
        : 0;

  const slotsPerDoctorPerDay = 12;

  const countWorkingDays = (start: Date, end: Date) =>
    eachDayOfInterval({ start, end }).filter((d) => {
      const day = getDay(d);
      return day !== 0 && day !== 6;
    }).length;

  // ── Extract stats ────────────────────────────────────────────
  const activeDoctors = stats.active_doctors ?? 0;
  const thisMonthAppts = stats.this_month_appts ?? 0;
  const completedMonth = stats.completed_month ?? 0;
  const cancelledMonth = stats.cancelled_month ?? 0;
  const noShowsMonth = stats.no_shows_month ?? 0;
  const todayAppts = stats.today_appts ?? 0;

  // ── MONTH metrics ──
  const revenueThisMonth = Number(stats.revenue_this_month ?? 0);
  const revenueLastMonth = Number(stats.revenue_last_month ?? 0);
  const monthWorkingDays = countWorkingDays(startOfMonth(now), endOfMonth(now));
  const monthCapacity = activeDoctors * monthWorkingDays * slotsPerDoctorPerDay;
  const monthNonCancelled = thisMonthAppts - cancelledMonth;

  const monthData = {
    revenue: revenueThisMonth,
    revenueGrowth: computeGrowth(revenueThisMonth, revenueLastMonth),
    completedCount: completedMonth,
    cancelledCount: cancelledMonth,
    cancelledRate: thisMonthAppts > 0 ? Math.round((cancelledMonth / thisMonthAppts) * 100) : 0,
    noShowCount: noShowsMonth,
    noShowRate: thisMonthAppts > 0 ? Math.round((noShowsMonth / thisMonthAppts) * 100) : 0,
    occupancyRate: monthCapacity > 0
      ? Math.min(100, Math.round((monthNonCancelled / monthCapacity) * 100))
      : 0,
    occupancyGrowth: (() => {
      const lastMonthAppts = stats.last_month_appts ?? 0;
      const lastMonthWorkingDays = countWorkingDays(startOfMonth(subMonths(now, 1)), endOfMonth(subMonths(now, 1)));
      const lastMonthCapacity = activeDoctors * lastMonthWorkingDays * slotsPerDoctorPerDay;
      const lastRate = lastMonthCapacity > 0 ? Math.round((lastMonthAppts / lastMonthCapacity) * 100) : 0;
      const currentRate = monthCapacity > 0 ? Math.round((monthNonCancelled / monthCapacity) * 100) : 0;
      return computeGrowth(currentRate, lastRate);
    })(),
    newPatients: stats.new_patients_this_month ?? 0,
    newPatientsGrowth: computeGrowth(stats.new_patients_this_month ?? 0, stats.new_patients_last_month ?? 0),
    recurringPatients: stats.recurring_patients_month ?? 0,
    recurringGrowth: computeGrowth(stats.recurring_patients_month ?? 0, stats.recurring_patients_last_month ?? 0),
    pendingDebt: Math.max(0, Number(stats.pending_debt_month ?? 0)),
    debtorCount: stats.debtor_count_month ?? 0,
  };

  // ── WEEK metrics ──
  const weekTotal = stats.week_total ?? 0;
  const weekCompleted = stats.week_completed ?? 0;
  const weekCancelled = stats.week_cancelled ?? 0;
  const weekNoShows = stats.week_no_shows ?? 0;
  const weekRevenue = Number(stats.revenue_this_week ?? 0);
  const weekWorkingDays = countWorkingDays(subDays(now, 6), now);
  const weekCapacity = activeDoctors * weekWorkingDays * slotsPerDoctorPerDay;

  const weekData = {
    revenue: weekRevenue,
    revenueGrowth: computeGrowth(weekRevenue, Number(stats.revenue_prev_week ?? 0)),
    completedCount: weekCompleted,
    cancelledCount: weekCancelled,
    cancelledRate: weekTotal > 0 ? Math.round((weekCancelled / weekTotal) * 100) : 0,
    noShowCount: weekNoShows,
    noShowRate: weekTotal > 0 ? Math.round((weekNoShows / weekTotal) * 100) : 0,
    occupancyRate: weekCapacity > 0
      ? Math.min(100, Math.round(((weekTotal - weekCancelled) / weekCapacity) * 100))
      : 0,
    occupancyGrowth: 0,
    newPatients: stats.new_patients_this_month ?? 0, // approximate
    newPatientsGrowth: 0,
    recurringPatients: stats.recurring_patients_month ?? 0,
    recurringGrowth: 0,
    pendingDebt: Math.max(0, Number(stats.pending_debt_week ?? 0)),
    debtorCount: stats.debtor_count_week ?? 0,
  };

  // ── TODAY metrics ──
  const todayCompleted = stats.today_completed ?? 0;
  const todayCancelled = stats.today_cancelled ?? 0;
  const todayNoShows = stats.today_no_shows ?? 0;
  const todayRevenue = Number(stats.revenue_today ?? 0);
  const todayIsWorkday = getDay(now) !== 0 && getDay(now) !== 6;
  const todayCapacity = todayIsWorkday ? activeDoctors * slotsPerDoctorPerDay : 0;

  const todayData = {
    revenue: todayRevenue,
    revenueGrowth: computeGrowth(todayRevenue, Number(stats.revenue_yesterday ?? 0)),
    completedCount: todayCompleted,
    cancelledCount: todayCancelled,
    cancelledRate: todayAppts > 0 ? Math.round((todayCancelled / todayAppts) * 100) : 0,
    noShowCount: todayNoShows,
    noShowRate: todayAppts > 0 ? Math.round((todayNoShows / todayAppts) * 100) : 0,
    occupancyRate: todayCapacity > 0
      ? Math.min(100, Math.round(((todayAppts - todayCancelled) / todayCapacity) * 100))
      : 0,
    occupancyGrowth: 0,
    newPatients: 0,
    newPatientsGrowth: 0,
    recurringPatients: 0,
    recurringGrowth: 0,
    pendingDebt: Math.max(0, Number(stats.pending_debt_today ?? 0)),
    debtorCount: stats.debtor_count_today ?? 0,
  };

  // ── Top treatments (expanded to 5) ──
  const topTreatments = (stats.top_treatments ?? []) as Array<{ name: string; count: number; revenue: number }>;

  // ── Receptionist performance ──
  const receptionistPerformance = (stats.receptionist_performance ?? []) as Array<{
    name: string;
    completed: number;
    total: number;
  }>;

  // Check if the owner/admin also has a linked doctor record
  const { data: linkedDoctor } = await supabase
    .from("doctors")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const userName = displayName;

  return (
    <>
      <AdminDashboard
        userName={userName}
        periodData={{
          month: monthData,
          week: weekData,
          today: todayData,
        }}
        receptionistPerformance={receptionistPerformance}
        topTreatments={topTreatments}
        monthlyRevenueGoal={Number(stats.monthly_revenue_goal ?? 0)}
      />
      {linkedDoctor && (
        <OwnerDoctorSection userName={userName} />
      )}
    </>
  );
}
