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
      .select("price_snapshot, services(base_price)")
      .gte("appointment_date", monthStart)
      .lte("appointment_date", monthEnd)
      .eq("status", "completed"),
    // Revenue last month: price_snapshot with fallback to service base_price
    supabase
      .from("appointments")
      .select("price_snapshot, services(base_price)")
      .gte("appointment_date", lastMonthStart)
      .lte("appointment_date", lastMonthEnd)
      .eq("status", "completed"),
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

  // Financial — revenue from completed appointments
  // Use price_snapshot if available, fallback to service's base_price for older appointments
  const revenueThisMonth = (completedApptsThisMonthRes.data ?? []).reduce(
    (sum, a) => {
      const price = a.price_snapshot ?? Number((a.services as any)?.base_price ?? 0);
      return sum + price;
    },
    0
  );
  const revenueLastMonth = (completedApptsLastMonthRes.data ?? []).reduce(
    (sum, a) => {
      const price = a.price_snapshot ?? Number((a.services as any)?.base_price ?? 0);
      return sum + price;
    },
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

  // Completed / Cancelled counts
  const completedMonth = appointmentsCompletedMonthRes.count ?? 0;
  const cancelledMonth = appointmentsCancelledMonthRes.count ?? 0;

  // Average ticket = revenue / completed appointments
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

  // Completion / Cancellation rates
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

  // Occupancy rate: effective appointments / estimated capacity
  const daysInCurrentMonth = eachDayOfInterval({
    start: startOfMonth(now),
    end: endOfMonth(now),
  });
  const workingDays = daysInCurrentMonth.filter((d) => {
    const day = getDay(d);
    return day !== 0 && day !== 6; // Exclude weekends
  }).length;
  const slotsPerDoctorPerDay = 12; // ~12 appointments/day per doctor
  const estimatedCapacity = activeDoctors * workingDays * slotsPerDoctorPerDay;
  const effectiveAppts = thisMonthAppts - cancelledMonth;
  const occupancyRate =
    estimatedCapacity > 0
      ? Math.min(100, Math.round((effectiveAppts / estimatedCapacity) * 100))
      : 0;

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
    .slice(0, 5);

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
        occupancyRate,
      }}
      todayAppointments={(todayListRes.data ?? []) as any}
      topTreatments={topTreatments}
      heatmapData={heatmapData}
    />
  );
}
