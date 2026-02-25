"use client";

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
  Calendar,
} from "lucide-react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────

interface TodayAppointment {
  id: string;
  patient_name: string;
  start_time: string;
  end_time: string;
  status: string;
  doctors: { full_name: string; color: string } | null;
  offices: { name: string } | null;
  services: { name: string } | null;
}

interface TrendPoint {
  date: string;
  dateShort: string;
  appointments: number;
  completed: number;
  revenue: number;
}

interface OriginPoint {
  name: string;
  value: number;
}

interface StatusPoint {
  name: string;
  value: number;
}

interface SparklinePoint {
  value: number;
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

interface AdminDashboardProps {
  userName: string;
  stats: {
    totalPatients: number;
    activeDoctors: number;
    todayAppts: number;
    thisMonthAppts: number;
    growth: number;
    activeOffices: number;
    revenueThisMonth: number;
    revenueGrowth: number;
    avgTicket: number;
    newPatientsThisMonth: number;
    patientGrowth: number;
    completionRate: number;
    cancellationRate: number;
    completedMonth: number;
    cancelledMonth: number;
    noShows: number;
    noShowRate: number;
  };
  trendData: TrendPoint[];
  originData: OriginPoint[];
  statusDistribution: StatusPoint[];
  todayAppointments: TodayAppointment[];
  noShowSparkline: SparklinePoint[];
  newPatientSparkline: SparklinePoint[];
  topTreatments: TopTreatment[];
  heatmapData: HeatmapPoint[];
}

// ─── Constants ──────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-gray-400/20 text-gray-400",
  confirmed: "bg-blue-500/20 text-blue-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  cancelled: "bg-red-500/20 text-red-400",
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

const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Helpers ────────────────────────────────────────────────────

function GrowthBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-xs text-muted-foreground">0%</span>;
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
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
    <div className="flex items-center gap-2 mb-4">
      <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
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
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-card/80">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{title}</span>
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${bgColor}`}
        >
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </div>
      <div className="mt-2">
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        {growth !== undefined && <GrowthBadge value={growth} />}
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </div>
    </div>
  );
}

// ─── Mini Sparkline ─────────────────────────────────────────────

function MiniSparkline({
  data,
  color,
  height = 40,
}: {
  data: SparklinePoint[];
  color: string;
  height?: number;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const width = 120;
  const points = data
    .map((d, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * width;
      const y = height - (d.value / max) * (height - 4);
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints}
        fill={`url(#spark-${color})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Sidebar Stat Card ──────────────────────────────────────────

function SidebarStatCard({
  title,
  value,
  rate,
  icon: Icon,
  color,
  bgColor,
  sparkData,
  sparkColor,
}: {
  title: string;
  value: number;
  rate: number;
  icon: typeof DollarSign;
  color: string;
  bgColor: string;
  sparkData: SparklinePoint[];
  sparkColor: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${bgColor}`}>
          <Icon className={`h-3.5 w-3.5 ${color}`} />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-2xl font-bold">{value}</span>
          <span className={`ml-2 text-sm font-medium ${color}`}>{rate}%</span>
        </div>
        <MiniSparkline data={sparkData} color={sparkColor} height={32} />
      </div>
    </div>
  );
}

// ─── Mini Calendar ──────────────────────────────────────────────

function MiniCalendar({ isEs }: { isEs: boolean }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Adjust so Monday = 0
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const dayNames = isEs
    ? ["L", "M", "X", "J", "V", "S", "D"]
    : ["M", "T", "W", "T", "F", "S", "S"];

  const monthNames = isEs
    ? ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
    : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
          <Calendar className="h-3.5 w-3.5 text-blue-400" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {monthNames[month]} {year}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {dayNames.map((d, i) => (
          <div key={i} className="text-[10px] font-medium text-muted-foreground py-1">
            {d}
          </div>
        ))}
        {cells.map((d, i) => (
          <div
            key={i}
            className={`text-[11px] py-1 rounded ${
              d === today
                ? "bg-emerald-500 text-white font-bold"
                : d
                  ? "text-foreground"
                  : ""
            }`}
          >
            {d ?? ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Heatmap ────────────────────────────────────────────────────

function AppointmentHeatmap({
  data,
  isEs,
}: {
  data: HeatmapPoint[];
  isEs: boolean;
}) {
  const dayLabels = isEs ? DAYS_ES : DAYS_EN;
  const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM to 8 PM
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const getColor = (count: number) => {
    if (count === 0) return "bg-muted/30";
    const intensity = count / maxCount;
    if (intensity < 0.25) return "bg-emerald-500/20";
    if (intensity < 0.5) return "bg-emerald-500/40";
    if (intensity < 0.75) return "bg-emerald-500/60";
    return "bg-emerald-500/90";
  };

  const getCount = (day: number, hour: number) => {
    return data.find((d) => d.day === day && d.hour === hour)?.count ?? 0;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
          <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <h3 className="text-sm font-semibold">
          {isEs ? "Mapa de calor de citas" : "Appointments heatmap"}
        </h3>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[320px]">
          {/* Header row */}
          <div className="grid gap-1" style={{ gridTemplateColumns: `48px repeat(${hours.length}, 1fr)` }}>
            <div />
            {hours.map((h) => (
              <div key={h} className="text-[10px] text-center text-muted-foreground font-medium">
                {h}:00
              </div>
            ))}
          </div>

          {/* Data rows */}
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
                    className={`aspect-square rounded-sm ${getColor(count)} transition-colors`}
                    title={`${dayLabel} ${hour}:00 — ${count} ${isEs ? "citas" : "appts"}`}
                  />
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center justify-end gap-1 mt-3">
            <span className="text-[10px] text-muted-foreground mr-1">
              {isEs ? "Menos" : "Less"}
            </span>
            <div className="h-3 w-3 rounded-sm bg-muted/30" />
            <div className="h-3 w-3 rounded-sm bg-emerald-500/20" />
            <div className="h-3 w-3 rounded-sm bg-emerald-500/40" />
            <div className="h-3 w-3 rounded-sm bg-emerald-500/60" />
            <div className="h-3 w-3 rounded-sm bg-emerald-500/90" />
            <span className="text-[10px] text-muted-foreground ml-1">
              {isEs ? "Más" : "More"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Top Treatments ─────────────────────────────────────────────

function TopTreatmentsTable({
  treatments,
  isEs,
}: {
  treatments: TopTreatment[];
  isEs: boolean;
}) {
  const maxCount = Math.max(...treatments.map((t) => t.count), 1);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10">
          <Stethoscope className="h-3.5 w-3.5 text-purple-400" />
        </div>
        <h3 className="text-sm font-semibold">
          {isEs ? "Top tratamientos" : "Top treatments"}
        </h3>
      </div>
      {treatments.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {isEs ? "Sin datos" : "No data"}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {treatments.map((t, i) => (
            <div key={i} className="px-5 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium truncate flex-1 mr-4">
                  {t.name}
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {t.count} {isEs ? "citas" : "appts"}
                  </span>
                  <span className="text-xs font-medium text-emerald-400">
                    {formatCurrency(t.revenue)}
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-500/60 transition-all"
                  style={{ width: `${(t.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Custom tooltip ─────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-foreground mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: {entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export function AdminDashboard({
  userName,
  stats,
  trendData,
  todayAppointments,
  noShowSparkline,
  newPatientSparkline,
  topTreatments,
  heatmapData,
}: AdminDashboardProps) {
  const { t, language } = useLanguage();
  const statusLabels = language === "es" ? STATUS_LABELS_ES : STATUS_LABELS_EN;
  const formatTime = (time: string) => time.slice(0, 5);
  const isEs = language === "es";

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            {t("dashboard.welcome")}, {userName.split(" ")[0] || userName}
          </p>
        </div>
        <Link
          href="/reports"
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          <FileText className="h-4 w-4" />
          {isEs ? "Ver reportes" : "View reports"}
        </Link>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MAIN LAYOUT: Content + Sidebar                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        {/* ─── LEFT: Main Content ──────────────────────────────── */}
        <div className="space-y-6 min-w-0">
          {/* FINANCIAL KPIs */}
          <section>
            <SectionHeader
              icon={DollarSign}
              title={isEs ? "Financiero" : "Financial"}
              color="bg-emerald-500/10 text-emerald-400"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title={isEs ? "Ingresos del mes" : "Monthly revenue"}
                value={formatCurrency(stats.revenueThisMonth)}
                icon={DollarSign}
                color="text-emerald-400"
                bgColor="bg-emerald-500/10"
                growth={stats.revenueGrowth}
                subtitle={isEs ? "vs. mes anterior" : "vs. last month"}
              />
              <KpiCard
                title={isEs ? "Ticket promedio" : "Avg. ticket"}
                value={formatCurrency(stats.avgTicket)}
                icon={Target}
                color="text-blue-400"
                bgColor="bg-blue-500/10"
                subtitle={isEs ? "por cita completada" : "per completed appt"}
              />
              <KpiCard
                title={isEs ? "Citas completadas" : "Completed appts"}
                value={stats.completedMonth.toLocaleString()}
                icon={CheckCircle2}
                color="text-emerald-400"
                bgColor="bg-emerald-500/10"
                subtitle={`${stats.completionRate}% ${isEs ? "del total" : "of total"}`}
              />
              <KpiCard
                title={isEs ? "Cancelaciones" : "Cancellations"}
                value={stats.cancelledMonth.toLocaleString()}
                icon={XCircle}
                color="text-red-400"
                bgColor="bg-red-500/10"
                subtitle={`${stats.cancellationRate}% ${isEs ? "tasa" : "rate"}`}
              />
            </div>
          </section>

          {/* OPERATIONAL + MARKETING KPIs */}
          <section>
            <SectionHeader
              icon={Activity}
              title={isEs ? "Operacional & Marketing" : "Operational & Marketing"}
              color="bg-blue-500/10 text-blue-400"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            </div>
          </section>

          {/* TREND CHART */}
          <section>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
                  <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <h3 className="text-sm font-semibold">
                  {isEs ? "Tendencias (30 días)" : "Trends (30 days)"}
                </h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="colorAppts" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="dateShort"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      interval={4}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="appointments"
                      name={isEs ? "Total" : "Total"}
                      stroke="#3b82f6"
                      fillOpacity={1}
                      fill="url(#colorAppts)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="completed"
                      name={isEs ? "Completadas" : "Completed"}
                      stroke="#10b981"
                      fillOpacity={1}
                      fill="url(#colorCompleted)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* BOTTOM ROW: Agenda + Top Treatments | Heatmap */}
          <section className="grid gap-6 lg:grid-cols-2">
            {/* Left: Agenda de hoy + Top Tratamientos */}
            <div className="space-y-6">
              {/* Agenda de hoy */}
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <h2 className="font-semibold">{t("dashboard.today_schedule")}</h2>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {todayAppointments.length}
                    </span>
                  </div>
                  <Link
                    href="/scheduler"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    {t("dashboard.view_scheduler")}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                {todayAppointments.length === 0 ? (
                  <div className="p-8 text-center">
                    <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      {t("dashboard.no_appointments_today")}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                    {todayAppointments.map((appt) => (
                      <div
                        key={appt.id}
                        className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/50"
                      >
                        <div className="w-20 shrink-0 text-xs font-mono text-muted-foreground">
                          {formatTime(appt.start_time)}
                        </div>
                        <div
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: appt.doctors?.color ?? "#6b7280",
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {appt.patient_name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {appt.services?.name ?? ""}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
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

              {/* Top Treatments */}
              <TopTreatmentsTable treatments={topTreatments} isEs={isEs} />
            </div>

            {/* Right: Heatmap */}
            <div>
              <AppointmentHeatmap data={heatmapData} isEs={isEs} />
            </div>
          </section>
        </div>

        {/* ─── RIGHT: Sidebar ──────────────────────────────────── */}
        <div className="space-y-4">
          {/* Mini Calendar */}
          <MiniCalendar isEs={isEs} />

          {/* No Shows Card */}
          <SidebarStatCard
            title={isEs ? "No shows" : "No shows"}
            value={stats.noShows}
            rate={stats.noShowRate}
            icon={UserX}
            color="text-orange-400"
            bgColor="bg-orange-500/10"
            sparkData={noShowSparkline}
            sparkColor="#f97316"
          />

          {/* New Patients Card */}
          <SidebarStatCard
            title={isEs ? "Nuevos pacientes" : "New patients"}
            value={stats.newPatientsThisMonth}
            rate={stats.patientGrowth}
            icon={UserPlus}
            color="text-emerald-400"
            bgColor="bg-emerald-500/10"
            sparkData={newPatientSparkline}
            sparkColor="#10b981"
          />

          {/* Quick Links */}
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isEs ? "Acceso rápido" : "Quick access"}
              </h3>
            </div>
            <div className="p-2 space-y-0.5">
              <QuickLink
                href="/reports"
                icon={BarChart3}
                label={isEs ? "Reportes" : "Reports"}
                color="text-emerald-400"
                bgColor="bg-emerald-500/10"
              />
              <QuickLink
                href="/scheduler"
                icon={CalendarDays}
                label={isEs ? "Agenda" : "Scheduler"}
                color="text-blue-400"
                bgColor="bg-blue-500/10"
              />
              <QuickLink
                href="/patients"
                icon={Users}
                label={isEs ? "Pacientes" : "Patients"}
                color="text-cyan-400"
                bgColor="bg-cyan-500/10"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Quick Link ─────────────────────────────────────────────────

function QuickLink({
  href,
  icon: Icon,
  label,
  color,
  bgColor,
}: {
  href: string;
  icon: typeof DollarSign;
  label: string;
  color: string;
  bgColor: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50 group"
    >
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-lg ${bgColor}`}
      >
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>
      <span className="text-sm font-medium group-hover:text-primary transition-colors">
        {label}
      </span>
      <ArrowRight className="ml-auto h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}
