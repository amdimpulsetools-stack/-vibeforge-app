import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WelcomeInvitedToast } from "./welcome-invited-toast";
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
    .select("role, organization_id, is_fertility_advisor")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) redirect("/login");

  const role = membership.role as "owner" | "admin" | "receptionist" | "doctor";

  // Asesoras de fertilidad (obstetras coordinadoras, mig 137): su rol
  // base es doctor o receptionist, pero su trabajo es el embudo
  // (seguimientos + presupuestos + agendar para cualquier doctor).
  // El dashboard de doctor les mostraba KPIs de médico tratante en
  // cero; el de asesora refleja su cola real. Owner/admin asesoras
  // conservan el dashboard admin (visión completa de la clínica).
  const isAdvisor = Boolean(membership.is_fertility_advisor);

  // Receptionist (no asesora): redirect to scheduler (their primary
  // workspace). Se comprueba antes de pedir el perfil — su nombre no llega
  // a usarse nunca.
  if (role === "receptionist" && !isAdvisor) redirect("/scheduler");

  // Get display name from user_profiles (updated by user in account page)
  const profileQuery = supabase
    .from("user_profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const nameFrom = (fullName: string | null | undefined) =>
    fullName || user.user_metadata?.full_name || user.email?.split("@")[0] || "";

  // Los tres dashboards de rol son excluyentes. El import dinámico por rama
  // evita evaluar en el servidor el módulo de los otros dos roles.
  //
  // OJO: esto NO basta para sacarlos del bundle cliente — en el App Router,
  // un `await import()` dentro de un Server Component no saca al componente
  // cliente del entrypoint de la ruta. El split real de los árboles pesados
  // está donde toca, en la frontera cliente: doctor-dashboard-wrapper.tsx
  // (framer-motion), admin-dashboard.tsx (recharts) y owner-doctor-section.tsx.
  if (isAdvisor && (role === "doctor" || role === "receptionist")) {
    const [{ data: profile }, { AdvisorDashboard }] = await Promise.all([
      profileQuery,
      import("./advisor-dashboard"),
    ]);
    return (
      <>
        <WelcomeInvitedToast role={role} />
        <AdvisorDashboard userName={nameFrom(profile?.full_name)} />
      </>
    );
  }

  // Doctor role: show personal dashboard
  if (role === "doctor") {
    const [{ data: profile }, { DoctorDashboardWrapper }] = await Promise.all([
      profileQuery,
      import("./doctor-dashboard-wrapper"),
    ]);
    return (
      <>
        <WelcomeInvitedToast role={role} />
        <DoctorDashboardWrapper
          userName={nameFrom(profile?.full_name)}
        />
      </>
    );
  }

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
  const seriesStart = format(subDays(now, 29), "yyyy-MM-dd");

  // Las cuatro consultas del dashboard admin son independientes entre sí
  // (solo dependen de user.id / organization_id, que ya tenemos): perfil,
  // RPC de stats, serie diaria de 30 días y la ficha de doctor vinculada.
  // Antes se encadenaban en serie — cinco rondas de red antes del primer
  // byte. Ahora son tres (auth → membership → estas cuatro en paralelo).
  const [
    { data: profile },
    { data: stats },
    { data: seriesRows },
    { data: linkedDoctor },
    { AdminDashboard },
  ] = await Promise.all([
    profileQuery,
    // Single RPC call for all dashboard data
    supabase.rpc("get_admin_dashboard_stats", {
      p_today: today,
      p_month_start: monthStart,
      p_month_end: monthEnd,
      p_last_month_start: lastMonthStart,
      p_last_month_end: lastMonthEnd,
      p_week_start: weekStart,
      p_prev_week_start: prevWeekStart,
      p_prev_week_end: prevWeekEnd,
      p_yesterday: yesterday,
    }),
    // ── Daily appointment series (last 30 days, excluding cancelled) ──
    supabase
      .from("appointments")
      .select("appointment_date")
      .eq("organization_id", membership.organization_id)
      .gte("appointment_date", seriesStart)
      .lte("appointment_date", today)
      .neq("status", "cancelled"),
    // Check if the owner/admin also has a linked doctor record
    supabase
      .from("doctors")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
    import("./admin-dashboard"),
  ]);

  const displayName = nameFrom(profile?.full_name);

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

  // ── Receptionist performance ──
  const receptionistPerformance = (stats.receptionist_performance ?? []) as Array<{
    name: string;
    completed: number;
    total: number;
  }>;

  const seriesCounts = new Map<string, number>();
  for (const row of seriesRows ?? []) {
    const d = row.appointment_date as string;
    seriesCounts.set(d, (seriesCounts.get(d) ?? 0) + 1);
  }
  const dailySeries = eachDayOfInterval({ start: subDays(now, 29), end: now }).map(
    (d) => {
      const date = format(d, "yyyy-MM-dd");
      return { date, count: seriesCounts.get(date) ?? 0 };
    }
  );

  const userName = displayName;

  // OwnerDoctorSection solo se monta si el admin tiene ficha de doctor; su
  // import dinámico evita arrastrar ese árbol al resto de admins.
  const OwnerDoctorSection = linkedDoctor
    ? (await import("./owner-doctor-section")).OwnerDoctorSection
    : null;

  return (
    <>
      <WelcomeInvitedToast role={role} />
      <AdminDashboard
        userName={userName}
        periodData={{
          month: monthData,
          week: weekData,
          today: todayData,
        }}
        receptionistPerformance={receptionistPerformance}
        dailySeries={dailySeries}
        monthlyRevenueGoal={Number(stats.monthly_revenue_goal ?? 0)}
      />
      {OwnerDoctorSection && (
        <OwnerDoctorSection userName={userName} />
      )}
    </>
  );
}
