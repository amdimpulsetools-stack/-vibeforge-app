import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminDashboard } from "./admin-dashboard";
import { DoctorDashboardWrapper } from "./doctor-dashboard-wrapper";
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

  const role = membership.role as "owner" | "admin" | "receptionist" | "doctor";

  // Doctor role: show personal dashboard
  if (role === "doctor") {
    return (
      <DoctorDashboardWrapper
        userName={user.user_metadata?.full_name || user.email || ""}
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

  // Single RPC call replaces ~17 parallel queries
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

  // Fallback if RPC fails (e.g. not yet migrated)
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

  // ── Extract stats from RPC response ────────────────────────────
  const totalPatients = stats.total_patients ?? 0;
  const activeDoctors = stats.active_doctors ?? 0;
  const todayAppts = stats.today_appts ?? 0;
  const thisMonthAppts = stats.this_month_appts ?? 0;
  const lastMonthAppts = stats.last_month_appts ?? 0;
  const activeOffices = stats.active_offices ?? 0;
  const completedMonth = stats.completed_month ?? 0;
  const cancelledMonth = stats.cancelled_month ?? 0;
  const noShows = stats.no_shows ?? 0;
  const newPatientsThisMonth = stats.new_patients_this_month ?? 0;
  const newPatientsLastMonth = stats.new_patients_last_month ?? 0;

  const growth = computeGrowth(thisMonthAppts, lastMonthAppts);
  const patientGrowth = computeGrowth(newPatientsThisMonth, newPatientsLastMonth);
  const noShowRate = thisMonthAppts > 0 ? Math.round((noShows / thisMonthAppts) * 100) : 0;

  // ── MONTH financial ────────────────────────────────────────────
  const revenueThisMonth = Number(stats.revenue_this_month ?? 0);
  const revenueLastMonth = Number(stats.revenue_last_month ?? 0);
  const monthWorkingDays = countWorkingDays(startOfMonth(now), endOfMonth(now));
  const monthCapacity = activeDoctors * monthWorkingDays * slotsPerDoctorPerDay;

  const monthFinancial = {
    revenue: revenueThisMonth,
    revenueGrowth: computeGrowth(revenueThisMonth, revenueLastMonth),
    avgTicket: completedMonth > 0 ? Math.round(revenueThisMonth / completedMonth) : 0,
    completedCount: completedMonth,
    completionRate: thisMonthAppts > 0 ? Math.round((completedMonth / thisMonthAppts) * 100) : 0,
    cancelledCount: cancelledMonth,
    cancellationRate: thisMonthAppts > 0 ? Math.round((cancelledMonth / thisMonthAppts) * 100) : 0,
    occupancyRate: monthCapacity > 0
      ? Math.min(100, Math.round(((thisMonthAppts - cancelledMonth) / monthCapacity) * 100))
      : 0,
  };

  // ── WEEK financial ─────────────────────────────────────────────
  const weekRevenue = Number(stats.revenue_this_week ?? 0);
  const weekTotal = stats.week_total ?? 0;
  const weekCompletedCount = stats.week_completed ?? 0;
  const weekCancelled = stats.week_cancelled ?? 0;
  const weekWorkingDays = countWorkingDays(subDays(now, 6), now);
  const weekCapacity = activeDoctors * weekWorkingDays * slotsPerDoctorPerDay;

  const weekFinancial = {
    revenue: weekRevenue,
    revenueGrowth: computeGrowth(weekRevenue, Number(stats.revenue_prev_week ?? 0)),
    avgTicket: weekCompletedCount > 0 ? Math.round(weekRevenue / weekCompletedCount) : 0,
    completedCount: weekCompletedCount,
    completionRate: weekTotal > 0 ? Math.round((weekCompletedCount / weekTotal) * 100) : 0,
    cancelledCount: weekCancelled,
    cancellationRate: weekTotal > 0 ? Math.round((weekCancelled / weekTotal) * 100) : 0,
    occupancyRate: weekCapacity > 0
      ? Math.min(100, Math.round(((weekTotal - weekCancelled) / weekCapacity) * 100))
      : 0,
  };

  // ── TODAY financial ────────────────────────────────────────────
  const todayRevenue = Number(stats.revenue_today ?? 0);
  const todayCompletedCount = stats.today_completed ?? 0;
  const todayCancelled = stats.today_cancelled ?? 0;
  const todayIsWorkday = getDay(now) !== 0 && getDay(now) !== 6;
  const todayCapacity = todayIsWorkday ? activeDoctors * slotsPerDoctorPerDay : 0;

  const todayFinancial = {
    revenue: todayRevenue,
    revenueGrowth: computeGrowth(todayRevenue, Number(stats.revenue_yesterday ?? 0)),
    avgTicket: todayCompletedCount > 0 ? Math.round(todayRevenue / todayCompletedCount) : 0,
    completedCount: todayCompletedCount,
    completionRate: todayAppts > 0 ? Math.round((todayCompletedCount / todayAppts) * 100) : 0,
    cancelledCount: todayCancelled,
    cancellationRate: todayAppts > 0 ? Math.round((todayCancelled / todayAppts) * 100) : 0,
    occupancyRate: todayCapacity > 0
      ? Math.min(100, Math.round(((todayAppts - todayCancelled) / todayCapacity) * 100))
      : 0,
  };

  // ── Top treatments ─────────────────────────────────────────────
  const allTreatments = (stats.top_treatments ?? []) as Array<{ name: string; count: number; revenue: number }>;
  const topTreatmentsByCount = [...allTreatments]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const topTreatmentsByRevenue = [...allTreatments]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  // ── Heatmap ────────────────────────────────────────────────────
  const heatmapRaw = (stats.heatmap ?? []) as Array<{ day: number; hour: number; count: number }>;
  const heatmapMap = new Map<string, number>();
  for (const h of heatmapRaw) {
    heatmapMap.set(`${h.day}-${h.hour}`, h.count);
  }
  const heatmapData: { day: number; hour: number; count: number }[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 8; hour <= 20; hour++) {
      const key = `${day}-${hour}`;
      heatmapData.push({ day, hour, count: heatmapMap.get(key) ?? 0 });
    }
  }

  return (
    <AdminDashboard
      userName={user.user_metadata?.full_name || user.email || ""}
      stats={{
        totalPatients,
        activeDoctors,
        todayAppts,
        thisMonthAppts,
        growth,
        activeOffices,
        newPatientsThisMonth,
        patientGrowth,
        noShows,
        noShowRate,
      }}
      financialByPeriod={{
        month: monthFinancial,
        week: weekFinancial,
        today: todayFinancial,
      }}
      todayAppointments={(stats.upcoming_appointments ?? []) as any}
      topTreatmentsByCount={topTreatmentsByCount}
      topTreatmentsByRevenue={topTreatmentsByRevenue}
      heatmapData={heatmapData}
    />
  );
}
