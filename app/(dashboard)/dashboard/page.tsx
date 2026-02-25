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
  const thirtyDaysAgo = format(subDays(now, 29), "yyyy-MM-dd");
  const sevenDaysAgo = format(subDays(now, 6), "yyyy-MM-dd");

  const [
    patientsRes,
    doctorsRes,
    todayApptsRes,
    thisMonthApptsRes,
    lastMonthApptsRes,
    todayListRes,
    paymentsThisMonthRes,
    paymentsLastMonthRes,
    patientsThisMonthRes,
    patientsLastMonthRes,
    last30ApptsRes,
    last30PaymentsRes,
    allPatientsWithOriginRes,
    officesRes,
    appointmentsCompletedMonthRes,
    appointmentsCancelledMonthRes,
    // New queries
    noShowsRes,
    topTreatmentsRawRes,
    heatmapRawRes,
    newPatientsLast7Res,
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
    // Today's appointment list
    supabase
      .from("appointments")
      .select(
        "id, patient_name, start_time, end_time, status, doctors(full_name, color), offices(name), services(name)"
      )
      .eq("appointment_date", today)
      .order("start_time", { ascending: true })
      .limit(20),
    // Payments this month
    supabase
      .from("patient_payments")
      .select("amount, payment_date")
      .gte("payment_date", monthStart)
      .lte("payment_date", monthEnd),
    // Payments last month
    supabase
      .from("patient_payments")
      .select("amount")
      .gte("payment_date", lastMonthStart)
      .lte("payment_date", lastMonthEnd),
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
    // Last 30 days appointments (for trend chart)
    supabase
      .from("appointments")
      .select("appointment_date, status, price_snapshot")
      .gte("appointment_date", thirtyDaysAgo)
      .lte("appointment_date", today)
      .order("appointment_date"),
    // Last 30 days payments (for revenue trend)
    supabase
      .from("patient_payments")
      .select("amount, payment_date")
      .gte("payment_date", thirtyDaysAgo)
      .lte("payment_date", today),
    // Patients with origin (for marketing)
    supabase
      .from("patients")
      .select("origin, created_at")
      .not("origin", "is", null),
    // Active offices count
    supabase
      .from("offices")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    // Completed appointments this month
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .gte("appointment_date", monthStart)
      .lte("appointment_date", monthEnd)
      .eq("status", "completed"),
    // Cancelled appointments this month
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
    // Top treatments: appointments this month with service info
    supabase
      .from("appointments")
      .select("service_id, services(name), price_snapshot, status")
      .gte("appointment_date", monthStart)
      .lte("appointment_date", monthEnd),
    // Heatmap: last 90 days appointments with start_time for day/hour distribution
    supabase
      .from("appointments")
      .select("appointment_date, start_time")
      .gte("appointment_date", format(subDays(now, 89), "yyyy-MM-dd"))
      .lte("appointment_date", today),
    // New patients last 7 days (for sparkline)
    supabase
      .from("patients")
      .select("created_at")
      .gte("created_at", sevenDaysAgo),
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

  // Financial
  const revenueThisMonth = (paymentsThisMonthRes.data ?? []).reduce(
    (sum, p) => sum + (p.amount ?? 0),
    0
  );
  const revenueLastMonth = (paymentsLastMonthRes.data ?? []).reduce(
    (sum, p) => sum + (p.amount ?? 0),
    0
  );
  const revenueGrowth =
    revenueLastMonth > 0
      ? Math.round(
          ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
        )
      : revenueThisMonth > 0
        ? 100
        : 0;

  // Average ticket
  const completedMonth = appointmentsCompletedMonthRes.count ?? 0;
  const cancelledMonth = appointmentsCancelledMonthRes.count ?? 0;
  const avgTicket =
    completedMonth > 0 ? Math.round(revenueThisMonth / completedMonth) : 0;

  // Patient growth
  const newPatientsThisMonth = patientsThisMonthRes.count ?? 0;
  const newPatientsLastMonth = patientsLastMonthRes.count ?? 0;
  const patientGrowth =
    newPatientsLastMonth > 0
      ? Math.round(
          ((newPatientsThisMonth - newPatientsLastMonth) /
            newPatientsLastMonth) *
            100
        )
      : newPatientsThisMonth > 0
        ? 100
        : 0;

  // Completion rate
  const completionRate =
    thisMonthAppts > 0 ? Math.round((completedMonth / thisMonthAppts) * 100) : 0;
  const cancellationRate =
    thisMonthAppts > 0
      ? Math.round((cancelledMonth / thisMonthAppts) * 100)
      : 0;

  // No-shows
  const noShows = (noShowsRes.data ?? []).length;
  const noShowRate =
    thisMonthAppts > 0 ? Math.round((noShows / thisMonthAppts) * 100) : 0;

  // No-show sparkline (last 7 days)
  const last7Days = eachDayOfInterval({
    start: subDays(now, 6),
    end: now,
  });
  const noShowsByDate = new Map<string, number>();
  for (const day of last7Days) {
    noShowsByDate.set(format(day, "yyyy-MM-dd"), 0);
  }
  for (const appt of noShowsRes.data ?? []) {
    const d = appt.appointment_date;
    if (noShowsByDate.has(d)) {
      noShowsByDate.set(d, (noShowsByDate.get(d) ?? 0) + 1);
    }
  }
  const noShowSparkline = last7Days.map((day) => ({
    value: noShowsByDate.get(format(day, "yyyy-MM-dd")) ?? 0,
  }));

  // New patients sparkline (last 7 days)
  const newPatientsByDate = new Map<string, number>();
  for (const day of last7Days) {
    newPatientsByDate.set(format(day, "yyyy-MM-dd"), 0);
  }
  for (const p of newPatientsLast7Res.data ?? []) {
    const d = format(parseISO(p.created_at), "yyyy-MM-dd");
    if (newPatientsByDate.has(d)) {
      newPatientsByDate.set(d, (newPatientsByDate.get(d) ?? 0) + 1);
    }
  }
  const newPatientSparkline = last7Days.map((day) => ({
    value: newPatientsByDate.get(format(day, "yyyy-MM-dd")) ?? 0,
  }));

  // Top treatments
  const treatmentCounts = new Map<string, { count: number; revenue: number }>();
  for (const appt of topTreatmentsRawRes.data ?? []) {
    const name = (appt.services as any)?.name ?? "Sin servicio";
    const entry = treatmentCounts.get(name) ?? { count: 0, revenue: 0 };
    entry.count++;
    if (appt.status === "completed") {
      entry.revenue += appt.price_snapshot ?? 0;
    }
    treatmentCounts.set(name, entry);
  }
  const topTreatments = Array.from(treatmentCounts.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Heatmap data (day of week x hour)
  const heatmapMap = new Map<string, number>();
  for (const appt of heatmapRawRes.data ?? []) {
    const date = parseISO(appt.appointment_date);
    // getDay: 0=Sun, we need Mon=0 for display
    const jsDay = getDay(date);
    const dayIndex = jsDay === 0 ? 6 : jsDay - 1; // Mon=0, Tue=1, ..., Sun=6
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

  // Build 30-day trend data
  const days = eachDayOfInterval({
    start: parseISO(thirtyDaysAgo),
    end: now,
  });

  const apptsByDate = new Map<string, { total: number; completed: number; revenue: number }>();
  for (const day of days) {
    apptsByDate.set(format(day, "yyyy-MM-dd"), { total: 0, completed: 0, revenue: 0 });
  }

  for (const appt of last30ApptsRes.data ?? []) {
    const d = appt.appointment_date;
    const entry = apptsByDate.get(d);
    if (entry) {
      entry.total++;
      if (appt.status === "completed") {
        entry.completed++;
        entry.revenue += appt.price_snapshot ?? 0;
      }
    }
  }

  for (const pay of last30PaymentsRes.data ?? []) {
    const d = pay.payment_date;
    const entry = apptsByDate.get(d);
    if (entry) {
      entry.revenue += pay.amount ?? 0;
    }
  }

  // For revenue trend, only count from payments (not price_snapshot) to avoid double-counting
  const revenueByDate = new Map<string, number>();
  for (const day of days) {
    revenueByDate.set(format(day, "yyyy-MM-dd"), 0);
  }
  for (const pay of last30PaymentsRes.data ?? []) {
    const d = pay.payment_date;
    const current = revenueByDate.get(d) ?? 0;
    revenueByDate.set(d, current + (pay.amount ?? 0));
  }

  const trendData = days.map((day) => {
    const key = format(day, "yyyy-MM-dd");
    const entry = apptsByDate.get(key)!;
    return {
      date: format(day, "dd MMM"),
      dateShort: format(day, "dd"),
      appointments: entry.total,
      completed: entry.completed,
      revenue: revenueByDate.get(key) ?? 0,
    };
  });

  // Origin distribution (marketing)
  const originCounts: Record<string, number> = {};
  for (const p of allPatientsWithOriginRes.data ?? []) {
    if (p.origin) {
      originCounts[p.origin] = (originCounts[p.origin] ?? 0) + 1;
    }
  }
  const originData = Object.entries(originCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // Appointments by status this month (for donut)
  const statusDistribution = [
    { name: "completed", value: completedMonth },
    {
      name: "confirmed",
      value: (thisMonthApptsRes.count ?? 0) - completedMonth - cancelledMonth,
    },
    { name: "cancelled", value: cancelledMonth },
  ].filter((s) => s.value > 0);

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
        revenueThisMonth,
        revenueGrowth,
        avgTicket,
        newPatientsThisMonth,
        patientGrowth,
        completionRate,
        cancellationRate,
        completedMonth,
        cancelledMonth,
        noShows,
        noShowRate,
      }}
      trendData={trendData}
      originData={originData}
      statusDistribution={statusDistribution}
      todayAppointments={(todayListRes.data ?? []) as any}
      noShowSparkline={noShowSparkline}
      newPatientSparkline={newPatientSparkline}
      topTreatments={topTreatments}
      heatmapData={heatmapData}
    />
  );
}
