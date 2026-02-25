import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminDashboard } from "./admin-dashboard";
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  eachDayOfInterval,
  parseISO,
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

  const role = membership.role as "owner" | "admin" | "member";
  if (role === "member") redirect("/scheduler");

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

  const [
    patientsRes,
    doctorsRes,
    todayApptsRes,
    thisMonthApptsRes,
    lastMonthApptsRes,
    todayListRes,
    patientsThisMonthRes,
    patientsLastMonthRes,
    officesRes,
    appointmentsCompletedMonthRes,
    appointmentsCancelledMonthRes,
    noShowsRes,
    topTreatmentsRawRes,
    heatmapRawRes,
    // Revenue: completed appointments this month with price_snapshot
    completedApptsThisMonthRes,
    // Revenue last month: completed appointments with price_snapshot
    completedApptsLastMonthRes,
    // Recent appointments (last 14 days) for week/today period calculations
    recentApptsRes,
  ] = await Promise.all([
    // Total patients
    supabase
      .from("patients")
      .select("*", { count: "exact", head: true }),
    // Active doctors
    supabase
      .from("doctors")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    // Today's appointment count
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("appointment_date", today),
    // This month's appointment count
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .gte("appointment_date", monthStart)
      .lte("appointment_date", monthEnd),
    // Last month's appointment count
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .gte("appointment_date", lastMonthStart)
      .lte("appointment_date", lastMonthEnd),
    // Next 3 upcoming appointments
    supabase
      .from("appointments")
      .select(
        "id, patient_name, appointment_date, start_time, end_time, status, doctors(full_name, color), offices(name), services(name)"
      )
      .gte("appointment_date", today)
      .in("status", ["scheduled", "confirmed"])
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(3),
    // New patients this month
    supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
      .gte("created_at", monthStart),
    // New patients last month
    supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
      .gte("created_at", lastMonthStart)
      .lt("created_at", monthStart),
    // Active offices count
    supabase
      .from("offices")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    // Completed appointments this month (count)
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .gte("appointment_date", monthStart)
      .lte("appointment_date", monthEnd)
      .eq("status", "completed"),
    // Cancelled appointments this month (count)
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .gte("appointment_date", monthStart)
      .lte("appointment_date", monthEnd)
      .eq("status", "cancelled"),
    // No-shows: past appointments this month still scheduled/confirmed
    supabase
      .from("appointments")
      .select("appointment_date")
      .gte("appointment_date", monthStart)
      .lt("appointment_date", today)
      .in("status", ["scheduled", "confirmed"]),
    // Top treatments: appointments this month with service info + base_price
    supabase
      .from("appointments")
      .select("service_id, services(name, base_price), price_snapshot, status")
      .gte("appointment_date", monthStart)
      .lte("appointment_date", monthEnd),
    // Heatmap: last 90 days appointments with start_time
    supabase
      .from("appointments")
      .select("appointment_date, start_time")
      .gte("appointment_date", format(subDays(now, 89), "yyyy-MM-dd"))
      .lte("appointment_date", today),
    // Revenue this month: price_snapshot with fallback to service base_price
    supabase
      .from("appointments")
      .select("appointment_date, price_snapshot, services(base_price)")
      .gte("appointment_date", monthStart)
      .lte("appointment_date", monthEnd)
      .eq("status", "completed"),
    // Revenue last month: price_snapshot with fallback to service base_price
    supabase
      .from("appointments")
      .select("appointment_date, price_snapshot, services(base_price)")
      .gte("appointment_date", lastMonthStart)
      .lte("appointment_date", lastMonthEnd)
      .eq("status", "completed"),
    // Recent appointments (last 14 days) with status for period calculations
    supabase
      .from("appointments")
      .select("appointment_date, status")
      .gte("appointment_date", prevWeekStart)
      .lte("appointment_date", today),
  ]);

  // Basic stats
  const totalPatients = patientsRes.count ?? 0;
  const activeDoctors = doctorsRes.count ?? 0;
  const todayAppts = todayApptsRes.count ?? 0;
  const thisMonthAppts = thisMonthApptsRes.count ?? 0;
  const lastMonthAppts = lastMonthApptsRes.count ?? 0;
  const activeOffices = officesRes.count ?? 0;

  const growth =
    lastMonthAppts > 0
      ? Math.round(((thisMonthAppts - lastMonthAppts) / lastMonthAppts) * 100)
      : thisMonthAppts > 0
        ? 100
        : 0;

  // ── Helpers ────────────────────────────────────────────────────
  const computeRevenue = (appts: any[]) =>
    appts.reduce((sum, a) => {
      const price = a.price_snapshot ?? Number((a.services as any)?.base_price ?? 0);
      return sum + price;
    }, 0);

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

  // ── Combined revenue data (both months) ──────────────────────
  const allCompletedAppts = [
    ...(completedApptsThisMonthRes.data ?? []),
    ...(completedApptsLastMonthRes.data ?? []),
  ];
  const recentAppts = recentApptsRes.data ?? [];

  // ── MONTH period ─────────────────────────────────────────────
  const revenueThisMonth = computeRevenue(completedApptsThisMonthRes.data ?? []);
  const revenueLastMonth = computeRevenue(completedApptsLastMonthRes.data ?? []);
  const completedMonth = appointmentsCompletedMonthRes.count ?? 0;
  const cancelledMonth = appointmentsCancelledMonthRes.count ?? 0;
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

  // ── WEEK period (last 7 days) ────────────────────────────────
  const weekCompletedAppts = allCompletedAppts.filter(
    (a) => a.appointment_date >= weekStart && a.appointment_date <= today
  );
  const prevWeekCompletedAppts = allCompletedAppts.filter(
    (a) => a.appointment_date >= prevWeekStart && a.appointment_date <= prevWeekEnd
  );
  const weekRevenue = computeRevenue(weekCompletedAppts);
  const weekRecentAppts = recentAppts.filter((a) => a.appointment_date >= weekStart);
  const weekTotal = weekRecentAppts.length;
  const weekCompletedCount = weekRecentAppts.filter((a) => a.status === "completed").length;
  const weekCancelled = weekRecentAppts.filter((a) => a.status === "cancelled").length;
  const weekWorkingDays = countWorkingDays(subDays(now, 6), now);
  const weekCapacity = activeDoctors * weekWorkingDays * slotsPerDoctorPerDay;

  const weekFinancial = {
    revenue: weekRevenue,
    revenueGrowth: computeGrowth(weekRevenue, computeRevenue(prevWeekCompletedAppts)),
    avgTicket: weekCompletedCount > 0 ? Math.round(weekRevenue / weekCompletedCount) : 0,
    completedCount: weekCompletedCount,
    completionRate: weekTotal > 0 ? Math.round((weekCompletedCount / weekTotal) * 100) : 0,
    cancelledCount: weekCancelled,
    cancellationRate: weekTotal > 0 ? Math.round((weekCancelled / weekTotal) * 100) : 0,
    occupancyRate: weekCapacity > 0
      ? Math.min(100, Math.round(((weekTotal - weekCancelled) / weekCapacity) * 100))
      : 0,
  };

  // ── TODAY period ─────────────────────────────────────────────
  const todayCompletedAppts = allCompletedAppts.filter((a) => a.appointment_date === today);
  const yesterdayCompletedAppts = allCompletedAppts.filter((a) => a.appointment_date === yesterday);
  const todayRevenue = computeRevenue(todayCompletedAppts);
  const todayRecentAppts = recentAppts.filter((a) => a.appointment_date === today);
  const todayTotal = todayAppts;
  const todayCompletedCount = todayRecentAppts.filter((a) => a.status === "completed").length;
  const todayCancelled = todayRecentAppts.filter((a) => a.status === "cancelled").length;
  const todayIsWorkday = getDay(now) !== 0 && getDay(now) !== 6;
  const todayCapacity = todayIsWorkday ? activeDoctors * slotsPerDoctorPerDay : 0;

  const todayFinancial = {
    revenue: todayRevenue,
    revenueGrowth: computeGrowth(todayRevenue, computeRevenue(yesterdayCompletedAppts)),
    avgTicket: todayCompletedCount > 0 ? Math.round(todayRevenue / todayCompletedCount) : 0,
    completedCount: todayCompletedCount,
    completionRate: todayTotal > 0 ? Math.round((todayCompletedCount / todayTotal) * 100) : 0,
    cancelledCount: todayCancelled,
    cancellationRate: todayTotal > 0 ? Math.round((todayCancelled / todayTotal) * 100) : 0,
    occupancyRate: todayCapacity > 0
      ? Math.min(100, Math.round(((todayTotal - todayCancelled) / todayCapacity) * 100))
      : 0,
  };

  // ── Operational stats (always monthly) ───────────────────────
  const newPatientsThisMonth = patientsThisMonthRes.count ?? 0;
  const newPatientsLastMonth = patientsLastMonthRes.count ?? 0;
  const patientGrowth = computeGrowth(newPatientsThisMonth, newPatientsLastMonth);

  const noShows = (noShowsRes.data ?? []).length;
  const noShowRate =
    thisMonthAppts > 0 ? Math.round((noShows / thisMonthAppts) * 100) : 0;

  // Top treatments
  const treatmentCounts = new Map<string, { count: number; revenue: number }>();
  for (const appt of topTreatmentsRawRes.data ?? []) {
    const svc = appt.services as any;
    const name = svc?.name ?? "Sin servicio";
    const entry = treatmentCounts.get(name) ?? { count: 0, revenue: 0 };
    entry.count++;
    if (appt.status === "completed") {
      entry.revenue += appt.price_snapshot ?? Number(svc?.base_price ?? 0);
    }
    treatmentCounts.set(name, entry);
  }
  const topTreatments = Array.from(treatmentCounts.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // Heatmap data (day of week x hour)
  const heatmapMap = new Map<string, number>();
  for (const appt of heatmapRawRes.data ?? []) {
    const date = parseISO(appt.appointment_date);
    const jsDay = getDay(date);
    const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
    const hour = parseInt(appt.start_time?.slice(0, 2) ?? "0", 10);
    if (hour >= 8 && hour <= 20) {
      const key = `${dayIndex}-${hour}`;
      heatmapMap.set(key, (heatmapMap.get(key) ?? 0) + 1);
    }
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
      todayAppointments={(todayListRes.data ?? []) as any}
      topTreatments={topTreatments}
      heatmapData={heatmapData}
    />
  );
}
