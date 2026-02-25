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
  Megaphone,
  Activity,
  FileText,
  Target,
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
  };
  trendData: TrendPoint[];
  originData: OriginPoint[];
  statusDistribution: StatusPoint[];
  todayAppointments: TodayAppointment[];
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
}: AdminDashboardProps) {
  const { t, language } = useLanguage();
  const statusLabels = language === "es" ? STATUS_LABELS_ES : STATUS_LABELS_EN;
  const formatTime = (time: string) => time.slice(0, 5);
  const isEs = language === "es";

  return (
    <div className="space-y-8 pb-8">
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
      {/* FINANCIAL KPIs                                             */}
      {/* ═══════════════════════════════════════════════════════════ */}
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

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* OPERATIONAL KPIs                                           */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader
          icon={Activity}
          title={isEs ? "Operacional" : "Operational"}
          color="bg-blue-500/10 text-blue-400"
        />
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MARKETING KPIs                                             */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader
          icon={Megaphone}
          title="Marketing"
          color="bg-purple-500/10 text-purple-400"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <KpiCard
            title={isEs ? "Pacientes totales" : "Total patients"}
            value={stats.totalPatients.toLocaleString()}
            icon={Users}
            color="text-blue-400"
            bgColor="bg-blue-500/10"
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

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* CHARTS ROW                                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader
          icon={BarChart3}
          title={isEs ? "Tendencias (30 días)" : "Trends (30 days)"}
          color="bg-amber-500/10 text-amber-400"
        />

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">
            {isEs ? "Citas diarias" : "Daily appointments"}
          </h3>
          <div className="h-72">
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

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TODAY'S SCHEDULE + QUICK REPORTS                           */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* Today's Appointments - 2 cols */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card">
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
            <div className="p-12 text-center">
              <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {t("dashboard.no_appointments_today")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
              {todayAppointments.map((appt) => (
                <div
                  key={appt.id}
                  className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="w-24 shrink-0 text-sm font-mono text-muted-foreground">
                    {formatTime(appt.start_time)} - {formatTime(appt.end_time)}
                  </div>
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: appt.doctors?.color ?? "#6b7280",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {appt.patient_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {appt.doctors?.full_name}
                      {appt.services?.name ? ` · ${appt.services.name}` : ""}
                      {appt.offices?.name ? ` · ${appt.offices.name}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
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

        {/* Quick Reports Access - 1 col */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold">
              {isEs ? "Acceso rápido" : "Quick access"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isEs ? "Reportes y herramientas" : "Reports & tools"}
            </p>
          </div>
          <div className="p-3 space-y-1">
            <QuickLink
              href="/reports"
              icon={BarChart3}
              label={isEs ? "Reporte financiero" : "Financial report"}
              description={isEs ? "Ingresos, productividad" : "Revenue, productivity"}
              color="text-emerald-400"
              bgColor="bg-emerald-500/10"
            />
            <QuickLink
              href="/reports"
              icon={Megaphone}
              label={isEs ? "Reporte marketing" : "Marketing report"}
              description={isEs ? "Orígenes, conversión" : "Origins, conversion"}
              color="text-purple-400"
              bgColor="bg-purple-500/10"
            />
            <QuickLink
              href="/reports"
              icon={Activity}
              label={isEs ? "Reporte operacional" : "Operational report"}
              description={isEs ? "Ocupación, tendencias" : "Occupancy, trends"}
              color="text-blue-400"
              bgColor="bg-blue-500/10"
            />
            <QuickLink
              href="/scheduler"
              icon={CalendarDays}
              label={isEs ? "Agenda" : "Scheduler"}
              description={isEs ? "Gestionar citas" : "Manage appointments"}
              color="text-amber-400"
              bgColor="bg-amber-500/10"
            />
            <QuickLink
              href="/patients"
              icon={Users}
              label={isEs ? "Pacientes" : "Patients"}
              description={isEs ? "Base de datos" : "Patient database"}
              color="text-cyan-400"
              bgColor="bg-cyan-500/10"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Quick Link ─────────────────────────────────────────────────

function QuickLink({
  href,
  icon: Icon,
  label,
  description,
  color,
  bgColor,
}: {
  href: string;
  icon: typeof DollarSign;
  label: string;
  description: string;
  color: string;
  bgColor: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50 group"
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${bgColor}`}
      >
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium group-hover:text-primary transition-colors">
          {label}
        </p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}
