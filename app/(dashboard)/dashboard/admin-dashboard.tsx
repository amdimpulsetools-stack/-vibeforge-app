"use client";

import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { formatCurrency } from "@/lib/utils";
import {
  Users,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Clock,
  ArrowRight,
  DollarSign,
  UserPlus,
  CheckCircle2,
  XCircle,
  BarChart3,
  Activity,
  FileText,
  Target,
  UserX,
  Stethoscope,
  Gauge,
} from "lucide-react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// --- Types ---

interface UpcomingAppointment {
  id: string;
  patient_name: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  doctors: { full_name: string; color: string } | null;
  offices: { name: string } | null;
  services: { name: string } | null;
}

interface TopTreatment {
  name: string;
  count: number;
  revenue: number;
}

interface HeatmapPoint {
  day: number;
  hour: number;
  count: number;
}

interface FinancialPeriodStats {
  revenue: number;
  revenueGrowth: number;
  avgTicket: number;
  completedCount: number;
  completionRate: number;
  cancelledCount: number;
  cancellationRate: number;
  occupancyRate: number;
}

interface AdminDashboardProps {
  userName: string;
  stats: {
    totalPatients: number;
    activeDoctors: number;
    todayAppts: number;
    thisMonthAppts: number;
    growth: number;
    activeOffices: number;
    newPatientsThisMonth: number;
    patientGrowth: number;
    noShows: number;
    noShowRate: number;
  };
  financialByPeriod: Record<"month" | "week" | "today", FinancialPeriodStats>;
  todayAppointments: UpcomingAppointment[];
  topTreatmentsByCount: TopTreatment[];
  topTreatmentsByRevenue: TopTreatment[];
  heatmapData: HeatmapPoint[];
}

// --- Constants ---

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-muted/60 text-muted-foreground",
  confirmed: "bg-blue-500/15 text-blue-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-red-500/15 text-red-400",
};

const STATUS_LABELS_ES: Record<string, string> = {
  scheduled: "Programada",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
};

const STATUS_LABELS_EN: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

const DAYS_ES = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const DAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// --- Helpers ---

function GrowthBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-xs text-muted-foreground">0%</span>;
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
        positive ? "text-emerald-400" : "text-red-400"
      }`}
    >
      {positive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {positive ? "+" : ""}
      {value}%
    </span>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  color,
}: {
  icon: typeof DollarSign;
  title: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  bgColor,
  growth,
  subtitle,
}: {
  title: string;
  value: string;
  icon: typeof DollarSign;
  color: string;
  bgColor: string;
  growth?: number;
  subtitle?: string;
}) {
  return (
    <div className="card-hover rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${bgColor}`}
        >
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </div>
      <div className="mt-3">
        <span className="text-2xl font-extrabold tracking-tight">{value}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {growth !== undefined && <GrowthBadge value={growth} />}
        {subtitle && (
          <span className="text-[11px] text-muted-foreground">{subtitle}</span>
        )}
      </div>
    </div>
  );
}

// --- Heatmap ---

function AppointmentHeatmap({
  data,
  isEs,
}: {
  data: HeatmapPoint[];
  isEs: boolean;
}) {
  const dayLabels = isEs ? DAYS_ES : DAYS_EN;
  const hours = Array.from({ length: 13 }, (_, i) => i + 8);
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const getColor = (count: number) => {
    if (count === 0) return "bg-muted/20";
    const intensity = count / maxCount;
    if (intensity < 0.25) return "bg-primary/15";
    if (intensity < 0.5) return "bg-primary/30";
    if (intensity < 0.75) return "bg-primary/50";
    return "bg-primary/80";
  };

  const getCount = (day: number, hour: number) => {
    return data.find((d) => d.day === day && d.hour === hour)?.count ?? 0;
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 h-full">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10">
          <BarChart3 className="h-4 w-4 text-amber-400" />
        </div>
        <h3 className="text-sm font-bold">
          {isEs ? "Mapa de calor de citas" : "Appointments heatmap"}
        </h3>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[320px]">
          <div className="grid gap-1" style={{ gridTemplateColumns: `48px repeat(${hours.length}, 1fr)` }}>
            <div />
            {hours.map((h) => (
              <div key={h} className="text-[10px] text-center text-muted-foreground font-medium">
                {h}:00
              </div>
            ))}
          </div>
          {dayLabels.map((dayLabel, dayIndex) => (
            <div
              key={dayIndex}
              className="grid gap-1 mt-1"
              style={{ gridTemplateColumns: `48px repeat(${hours.length}, 1fr)` }}
            >
              <div className="text-[11px] text-muted-foreground font-medium flex items-center">
                {dayLabel}
              </div>
              {hours.map((hour) => {
                const count = getCount(dayIndex, hour);
                return (
                  <div
                    key={hour}
                    className={`aspect-square rounded-md ${getColor(count)} transition-colors`}
                    title={`${dayLabel} ${hour}:00 — ${count} ${isEs ? "citas" : "appts"}`}
                  />
                );
              })}
            </div>
          ))}
          <div className="flex items-center justify-end gap-1.5 mt-4">
            <span className="text-[10px] text-muted-foreground mr-1">
              {isEs ? "Menos" : "Less"}
            </span>
            <div className="h-3 w-3 rounded-sm bg-muted/20" />
            <div className="h-3 w-3 rounded-sm bg-primary/15" />
            <div className="h-3 w-3 rounded-sm bg-primary/30" />
            <div className="h-3 w-3 rounded-sm bg-primary/50" />
            <div className="h-3 w-3 rounded-sm bg-primary/80" />
            <span className="text-[10px] text-muted-foreground ml-1">
              {isEs ? "Mas" : "More"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Custom tooltip for Top Treatments chart ---

function TreatmentTooltip({ active, payload, isEs, sortBy }: { active?: boolean; payload?: Array<{ payload: TopTreatment }>; isEs: boolean; sortBy: string }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-popover-foreground mb-1">{data.name}</p>
      <p className="text-xs text-popover-foreground">
        {data.count} {isEs ? "citas" : "appts"}
      </p>
      <p className="text-xs text-emerald-400 font-medium">
        {formatCurrency(data.revenue)}
      </p>
    </div>
  );
}

// --- Top Treatments ---

const BAR_COLORS = ["#10b981", "#34d399", "#6ee7b7"];

function TopTreatmentsTable({
  treatmentsByCount,
  treatmentsByRevenue,
  isEs,
}: {
  treatmentsByCount: TopTreatment[];
  treatmentsByRevenue: TopTreatment[];
  isEs: boolean;
}) {
  const [sortBy, setSortBy] = useState<"count" | "revenue">("count");
  const treatments = sortBy === "count" ? treatmentsByCount : treatmentsByRevenue;

  const chartData = treatments.map((t) => ({
    ...t,
    value: sortBy === "count" ? t.count : t.revenue,
  }));

  return (
    <div className="rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10">
            <Stethoscope className="h-4 w-4 text-emerald-400" />
          </div>
          <h3 className="text-sm font-bold">
            {isEs ? "Top 3 servicios" : "Top 3 services"}
          </h3>
        </div>
        <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5">
          <button
            onClick={() => setSortBy("count")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
              sortBy === "count"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isEs ? "Cantidad" : "Quantity"}
          </button>
          <button
            onClick={() => setSortBy("revenue")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
              sortBy === "revenue"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isEs ? "Valor" : "Revenue"}
          </button>
        </div>
      </div>
      {treatments.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {isEs ? "Sin datos" : "No data"}
          </p>
        </div>
      ) : (
        <div className="px-4 py-4">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} layout="vertical" barCategoryGap="30%">
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={120}
              />
              <Tooltip content={<TreatmentTooltip isEs={isEs} sortBy={sortBy} />} cursor={false} />
              <Bar dataKey="value" radius={999} background={{ fill: "rgba(128,128,128,0.1)", radius: 999 }} animationDuration={800} animationEasing="ease-out">
                {chartData.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export function AdminDashboard({
  userName,
  stats,
  financialByPeriod,
  todayAppointments,
  topTreatmentsByCount,
  topTreatmentsByRevenue,
  heatmapData,
}: AdminDashboardProps) {
  const { t, language } = useLanguage();
  const statusLabels = language === "es" ? STATUS_LABELS_ES : STATUS_LABELS_EN;
  const formatTime = (time: string) => time.slice(0, 5);
  const isEs = language === "es";
  const [period, setPeriod] = useState<"month" | "week" | "today">("month");
  const fin = financialByPeriod[period];

  const periodLabels = {
    month: isEs ? "Mes" : "Month",
    week: isEs ? "Ult. 7 dias" : "Last 7 days",
    today: isEs ? "Hoy" : "Today",
  };

  return (
    <div className="space-y-8 pb-8">
      {/* HEADER + FILTER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            {t("dashboard.welcome")}, {userName.split(" ")[0] || userName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period filter */}
          <div className="flex items-center rounded-xl border border-border/60 bg-card p-1">
            {(["month", "week", "today"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  period === p
                    ? "gradient-primary text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>
          <Link
            href="/reports"
            className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm font-medium transition-all hover:bg-accent/50 hover:border-border"
          >
            <FileText className="h-4 w-4" />
            {isEs ? "Ver reportes" : "View reports"}
          </Link>
        </div>
      </div>

      {/* FINANCIAL KPIs */}
      <section>
        <SectionHeader
          icon={DollarSign}
          title={isEs ? "Financiero" : "Financial"}
          color="bg-emerald-500/10 text-emerald-400"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            title={isEs
              ? { month: "Ingresos del mes", week: "Ingresos (7 dias)", today: "Ingresos de hoy" }[period]
              : { month: "Monthly revenue", week: "Revenue (7 days)", today: "Today's revenue" }[period]
            }
            value={formatCurrency(fin.revenue)}
            icon={DollarSign}
            color="text-emerald-400"
            bgColor="bg-emerald-500/10"
            growth={fin.revenueGrowth}
            subtitle={isEs
              ? { month: "vs. mes anterior", week: "vs. 7 dias ant.", today: "vs. ayer" }[period]
              : { month: "vs. last month", week: "vs. prev. 7 days", today: "vs. yesterday" }[period]
            }
          />
          <KpiCard
            title={isEs ? "Ticket promedio" : "Avg. ticket"}
            value={formatCurrency(fin.avgTicket)}
            icon={Target}
            color="text-blue-400"
            bgColor="bg-blue-500/10"
            subtitle={isEs ? "por cita completada" : "per completed appt"}
          />
          <KpiCard
            title={isEs ? "Citas completadas" : "Completed appts"}
            value={fin.completedCount.toLocaleString()}
            icon={CheckCircle2}
            color="text-emerald-400"
            bgColor="bg-emerald-500/10"
            subtitle={`${fin.completionRate}% ${isEs ? "del total" : "of total"}`}
          />
          <KpiCard
            title={isEs ? "Cancelaciones" : "Cancellations"}
            value={fin.cancelledCount.toLocaleString()}
            icon={XCircle}
            color="text-red-400"
            bgColor="bg-red-500/10"
            subtitle={`${fin.cancellationRate}% ${isEs ? "tasa" : "rate"}`}
          />
          <KpiCard
            title={isEs ? "Tasa de ocupacion" : "Occupancy rate"}
            value={`${fin.occupancyRate}%`}
            icon={Gauge}
            color="text-amber-400"
            bgColor="bg-amber-500/10"
            subtitle={isEs ? "capacidad utilizada" : "capacity used"}
          />
        </div>
      </section>

      {/* OPERATIONAL KPIs */}
      <section>
        <SectionHeader
          icon={Activity}
          title={isEs ? "Operacional & Marketing" : "Operational & Marketing"}
          color="bg-blue-500/10 text-blue-400"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            title={isEs ? "Citas de hoy" : "Today's appts"}
            value={stats.todayAppts.toLocaleString()}
            icon={CalendarDays}
            color="text-blue-400"
            bgColor="bg-blue-500/10"
          />
          <KpiCard
            title={isEs ? "Citas este mes" : "Monthly appts"}
            value={stats.thisMonthAppts.toLocaleString()}
            icon={CalendarDays}
            color="text-purple-400"
            bgColor="bg-purple-500/10"
            growth={stats.growth}
            subtitle={isEs ? "vs. mes anterior" : "vs. last month"}
          />
          <KpiCard
            title={isEs ? "Pacientes totales" : "Total patients"}
            value={stats.totalPatients.toLocaleString()}
            icon={Users}
            color="text-cyan-400"
            bgColor="bg-cyan-500/10"
          />
          <KpiCard
            title={isEs ? "Nuevos este mes" : "New this month"}
            value={stats.newPatientsThisMonth.toLocaleString()}
            icon={UserPlus}
            color="text-emerald-400"
            bgColor="bg-emerald-500/10"
            growth={stats.patientGrowth}
            subtitle={isEs ? "vs. mes anterior" : "vs. last month"}
          />
          <KpiCard
            title="No shows"
            value={stats.noShows.toLocaleString()}
            icon={UserX}
            color="text-orange-400"
            bgColor="bg-orange-500/10"
            subtitle={`${stats.noShowRate}% ${isEs ? "tasa" : "rate"}`}
          />
        </div>
      </section>

      {/* BOTTOM: Upcoming + Top Services | Heatmap */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-6">
          {/* Upcoming appointments */}
          <div className="rounded-2xl border border-border/60 bg-card">
            <div className="flex items-center justify-between border-b border-border/40 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-bold">{t("dashboard.upcoming_appointments")}</h2>
              </div>
              <Link
                href="/scheduler"
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                {t("dashboard.view_scheduler")}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {todayAppointments.length === 0 ? (
              <div className="p-10 text-center">
                <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {t("dashboard.no_upcoming_appointments")}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {todayAppointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="shrink-0 text-xs font-mono text-muted-foreground">
                      <div>{appt.appointment_date}</div>
                      <div>{formatTime(appt.start_time)}</div>
                    </div>
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background"
                      style={{
                        backgroundColor: appt.doctors?.color ?? "#6b7280",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {appt.patient_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {appt.services?.name ?? ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                        STATUS_COLORS[appt.status] ?? STATUS_COLORS.scheduled
                      }`}
                    >
                      {statusLabels[appt.status] ?? appt.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top 3 Services */}
          <TopTreatmentsTable treatmentsByCount={topTreatmentsByCount} treatmentsByRevenue={topTreatmentsByRevenue} isEs={isEs} />
        </div>

        {/* Right: Heatmap */}
        <div>
          <AppointmentHeatmap data={heatmapData} isEs={isEs} />
        </div>
      </section>
    </div>
  );
}
