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

  // Receptionist (no asesora — las asesoras ya salieron por la rama de
  // arriba): dashboard propio. Antes se redirigía a /scheduler; ahora el
  // RPC (mig 236, con gating de rol DENTRO de la función) se dispara aquí
  // en el Server Component, en paralelo con el perfil — mismo patrón que
  // la rama doctor. Si el RPC falla, initialData va null y el componente
  // pinta empty-states — NUNCA redirect a /scheduler (evitar bucles).
  if (role === "receptionist") {
    const receptionistToday = format(new Date(), "yyyy-MM-dd");
    const [{ data: profile }, receptionistStatsRes, { ReceptionistDashboard }] =
      await Promise.all([
        profileQuery,
        supabase.rpc("get_receptionist_dashboard", {
          p_org_id: membership.organization_id,
          p_today: receptionistToday,
        }),
        import("./receptionist-dashboard"),
      ]);
    type ReceptionistStats =
      import("./receptionist-dashboard").ReceptionistDashboardData;
    return (
      <>
        <WelcomeInvitedToast role={role} />
        <ReceptionistDashboard
          userName={nameFrom(profile?.full_name)}
          initialData={
            (receptionistStatsRes.data as ReceptionistStats | null) ?? null
          }
        />
      </>
    );
  }

  // Doctor role: show personal dashboard
  if (role === "doctor") {
    // 2.6 — el RPC del dashboard de doctor se dispara YA aquí, en el Server
    // Component (user.id y organization_id están resueltos), en paralelo con
    // el perfil. Antes el cliente esperaba hidratar → user → org → RPC para
    // pintar contenido. Solo se llama en esta rama (rol doctor no-asesora):
    // el split por rol del Lote 1 se respeta y los demás roles no pagan el
    // RPC. Si falla, initialData va null y el cliente hace su fetch de
    // siempre (spinner + fallback a get_doctor_personal_stats).
    const [{ data: profile }, doctorStatsRes, { DoctorDashboardWrapper }] =
      await Promise.all([
        profileQuery,
        supabase.rpc("get_doctor_dashboard_enhanced", {
          p_user_id: user.id,
          org_id: membership.organization_id,
        }),
        import("./doctor-dashboard-wrapper"),
      ]);
    type DoctorStatsResponse = import("./doctor-dashboard").DoctorStatsResponse;
    return (
      <>
        <WelcomeInvitedToast role={role} />
        <DoctorDashboardWrapper
          userName={nameFrom(profile?.full_name)}
          initialData={(doctorStatsRes.data as DoctorStatsResponse | null) ?? null}
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

  // Las tres consultas del dashboard admin son independientes entre sí
  // (solo dependen de user.id / organization_id, que ya tenemos): perfil,
  // RPC de stats y la ficha de doctor vinculada.
  //
  // 2.9 — el RPC es ahora la v3 (mig 200): sin los ~8 bloques que esta
  // página nunca leía (heatmap de 90 días, top_treatments,
  // upcoming_appointments…) y con la serie diaria de 30 días agregada
  // dentro del propio RPC. Antes se traía UNA FILA POR CITA
  // (select("appointment_date")) solo para contarlas por día en JS —
  // ~50-100 kB de payload con volumen; ahora son <2 kB de conteos.
  const [
    { data: profile },
    { data: stats },
    { data: linkedDoctor },
    { AdminDashboard },
  ] = await Promise.all([
    profileQuery,
    // Single RPC call for all dashboard data (incl. daily series)
    supabase.rpc("get_admin_dashboard_stats_v3", {
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

  // La serie llega ya agregada por día desde el RPC (solo días con citas);
  // el relleno de días vacíos con 0 se conserva igual que antes.
  const seriesCounts = new Map<string, number>();
  for (const row of (stats.daily_series ?? []) as Array<{
    date: string;
    count: number;
  }>) {
    seriesCounts.set(row.date, Number(row.count));
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
