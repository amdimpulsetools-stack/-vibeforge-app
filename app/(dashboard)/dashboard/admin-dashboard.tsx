"use client";

import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { formatCurrency } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  UserPlus,
  FileText,
  UserX,
  Activity,
  Wallet,
  CircleDollarSign,
  CalendarDays,
  Headset,
  Gauge,
  Target,
} from "lucide-react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ExecutiveBriefWidget } from "./executive-brief-widget";

// ── Types ──────────────────────────────────────────────────────

interface PeriodData {
  revenue: number;
  revenueGrowth: number;
  completedCount: number;
  cancelledCount: number;
  cancelledRate: number;
  noShowCount: number;
  noShowRate: number;
  occupancyRate: number;
  occupancyGrowth: number;
  newPatients: number;
  newPatientsGrowth: number;
  recurringPatients: number;
  recurringGrowth: number;
  pendingDebt: number;
  debtorCount: number;
}

interface ReceptionistPerf {
  name: string;
  completed: number;
  total: number;
}

interface DailyPoint {
  date: string;
  count: number;
}

interface AdminDashboardProps {
  userName: string;
  periodData: Record<"month" | "week" | "today", PeriodData>;
  receptionistPerformance: ReceptionistPerf[];
  dailySeries: DailyPoint[];
  monthlyRevenueGoal: number;
}

// ── Helpers ────────────────────────────────────────────────────

function GrowthBadge({ value, suffix, light }: { value: number; suffix?: string; light?: boolean }) {
  if (value === 0) return null;
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
        light
          ? positive ? "text-white/90" : "text-red-200"
          : positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
      }`}
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}
      {value}% {suffix ?? ""}
    </span>
  );
}

const RECEPTIONIST_COLORS = [
  "#f97316", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6",
];

// ── Main Component ─────────────────────────────────────────────

export function AdminDashboard({
  userName,
  periodData,
  receptionistPerformance,
  dailySeries,
  monthlyRevenueGoal,
}: AdminDashboardProps) {
  const { language } = useLanguage();
  const isEs = language === "es";
  const [period, setPeriod] = useState<"month" | "week" | "today">("month");
  const data = periodData[period];

  const periodLabels = {
    month: isEs ? "Mes" : "Month",
    week: isEs ? "Últ. 7 días" : "Last 7 days",
    today: isEs ? "Hoy" : "Today",
  };

  const periodSuffix = {
    month: isEs ? "vs mes anterior" : "vs last month",
    week: isEs ? "vs 7 días ant." : "vs prev 7 days",
    today: isEs ? "vs ayer" : "vs yesterday",
  };

  // Timeline stats
  const seriesTotal = dailySeries.reduce((sum, p) => sum + p.count, 0);
  const seriesAvg = dailySeries.length > 0 ? seriesTotal / dailySeries.length : 0;

  // Occupancy thresholds
  const occupancyTone =
    data.occupancyRate >= 60
      ? {
          text: "text-emerald-500",
          bar: "bg-emerald-500",
          iconBg: "bg-emerald-500/10",
          label: isEs ? "Óptima" : "Healthy",
        }
      : data.occupancyRate >= 20
        ? {
            text: "text-amber-500",
            bar: "bg-amber-500",
            iconBg: "bg-amber-500/10",
            label: isEs ? "Media" : "Moderate",
          }
        : {
            text: "text-rose-500",
            bar: "bg-rose-500",
            iconBg: "bg-rose-500/10",
            label: isEs ? "Baja" : "Low",
          };

  const showReceptionist = receptionistPerformance.length >= 2;

  // Revenue goal progress
  const goalProgress = monthlyRevenueGoal > 0
    ? Math.min(100, Math.round((periodData.month.revenue / monthlyRevenueGoal) * 100))
    : 0;
  const goalMessage = goalProgress >= 100
    ? (isEs ? "¡Meta alcanzada!" : "Goal reached!")
    : goalProgress >= 70
      ? (isEs ? "¡Vamos! Falta poco" : "Almost there!")
      : goalProgress >= 40
        ? (isEs ? "Buen progreso" : "Good progress")
        : (isEs ? "En camino" : "On track");

  return (
    <div className="space-y-6 pb-8">
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {isEs ? "Escritorio" : "Dashboard"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {isEs ? "Bienvenido de vuelta" : "Welcome back"}, {userName.split(" ")[0] || userName}
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
            className="hidden md:flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm font-medium transition-all hover:bg-accent/50 hover:border-border"
          >
            <FileText className="h-4 w-4" />
            {isEs ? "Ver reportes" : "View reports"}
          </Link>
        </div>
      </div>

      {/* Executive Brief IA — Capa 1 (Slice C) */}
      <ExecutiveBriefWidget />

      {/* ── ROW 1: Revenue | Pending Debt | Appointments ── */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {/* Revenue */}
        <div className="w-full rounded-2xl bg-emerald-600 p-5 shadow-lg shadow-emerald-600/20 flex flex-col justify-center">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <Wallet className="h-4 w-4 text-white" />
            </div>
            <span className="text-xs font-semibold text-white/80">
              {isEs
                ? { month: "Ingresos del mes", week: "Ingresos (7 días)", today: "Ingresos de hoy" }[period]
                : { month: "Monthly revenue", week: "Revenue (7 days)", today: "Today's revenue" }[period]
              }
            </span>
          </div>
          <p className="text-3xl font-extrabold tracking-tight text-white">
            {formatCurrency(data.revenue)}
          </p>
          <div className="mt-1.5">
            <GrowthBadge value={data.revenueGrowth} suffix={periodSuffix[period]} light />
          </div>
        </div>

        {/* Pending Debt */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 flex flex-col justify-center">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
              <CircleDollarSign className="h-4 w-4 text-orange-500" />
            </div>
            <span className="text-xs font-semibold text-orange-500">
              {isEs ? "Cobranza pendiente" : "Pending debt"}
            </span>
          </div>
          <div className="flex items-baseline gap-4">
            <div>
              <p className="text-3xl font-extrabold tracking-tight text-orange-600 dark:text-orange-400">
                {formatCurrency(data.pendingDebt)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isEs ? "por cobrar" : "to collect"}
              </p>
            </div>
            <div className="border-l border-border pl-4">
              <p className="text-3xl font-extrabold tracking-tight">
                {data.debtorCount}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isEs ? "pacientes deudores" : "patients with debt"}
              </p>
            </div>
          </div>
        </div>

        {/* Appointments summary */}
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <CalendarDays className="h-4 w-4 text-violet-500" />
            </div>
            <span className="text-xs font-semibold text-violet-500">
              {isEs ? "Citas" : "Appointments"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="flex justify-center mb-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-xs text-muted-foreground">
                {isEs ? "Completadas" : "Completed"}
              </p>
              <p className="text-2xl font-extrabold">{data.completedCount}</p>
            </div>
            <div className="text-center">
              <div className="flex justify-center mb-1">
                <UserX className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-xs text-muted-foreground">
                {isEs ? "No shows" : "No shows"}
              </p>
              <p className="text-2xl font-extrabold">{data.noShowCount}</p>
            </div>
            <div className="text-center">
              <div className="flex justify-center mb-1">
                <XCircle className="h-4 w-4 text-red-500" />
              </div>
              <p className="text-xs text-muted-foreground">
                {isEs ? "Canceladas" : "Cancelled"}
              </p>
              <p className="text-2xl font-extrabold">{data.cancelledCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 2: New vs Recurring | Receptionist Performance | Occupancy ── */}
      <div
        className={`grid gap-4 grid-cols-1 ${
          showReceptionist ? "md:grid-cols-3" : "md:grid-cols-2"
        }`}
      >
        {/* New vs Recurring patients */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <UserPlus className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs font-semibold text-emerald-500">
              {isEs ? "Pacientes nuevos vs recurrentes" : "New vs recurring patients"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="h-3 w-3 rounded-sm bg-emerald-500/20" />
                <span className="text-xs text-muted-foreground">{isEs ? "Nuevos" : "New"}</span>
              </div>
              <p className="text-3xl font-extrabold">{data.newPatients}</p>
              <GrowthBadge value={data.newPatientsGrowth} suffix={periodSuffix[period]} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="h-3 w-3 rounded-sm bg-muted" />
                <span className="text-xs text-muted-foreground">
                  {isEs ? "Recurrentes" : "Recurring"}
                </span>
              </div>
              <p className="text-3xl font-extrabold">{data.recurringPatients}</p>
              <GrowthBadge value={data.recurringGrowth} suffix={periodSuffix[period]} />
            </div>
          </div>
        </div>

        {/* Receptionist Performance */}
        {showReceptionist && (
          <div className="rounded-2xl border border-border/60 bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10">
                <Headset className="h-4 w-4 text-sky-500" />
              </div>
              <span className="text-xs font-semibold text-sky-500">
                {isEs ? "Rendimiento por recepcionista" : "Receptionist performance"}
              </span>
            </div>
            <div className="space-y-2.5">
              {receptionistPerformance.slice(0, 5).map((r, i) => (
                <div key={r.name} className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: RECEPTIONIST_COLORS[i % RECEPTIONIST_COLORS.length] }}
                  />
                  <span className="text-sm font-semibold truncate">{r.name}:</span>
                  <span className="text-sm text-muted-foreground">
                    {r.completed} {isEs ? "citas completadas" : "completed"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Occupancy Rate */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="mb-3 flex items-center justify-between">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${occupancyTone.iconBg}`}
            >
              <Gauge className={`h-4 w-4 ${occupancyTone.text}`} />
            </div>
            <span className={`text-xs font-semibold ${occupancyTone.text}`}>
              {isEs ? "% de Ocupación" : "Occupancy %"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-5xl font-extrabold tracking-tight">
              {data.occupancyRate}%
            </p>
            <span className={`text-xs font-semibold ${occupancyTone.text}`}>
              {occupancyTone.label}
            </span>
          </div>
          <div className="mt-2">
            <GrowthBadge value={data.occupancyGrowth} suffix={periodSuffix[period]} />
          </div>
          {/* Progress bar */}
          <div className="mt-4 h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${occupancyTone.bar} transition-all duration-500`}
              style={{ width: `${Math.max(2, data.occupancyRate)}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {isEs ? "Meta saludable: 60%+" : "Healthy target: 60%+"}
          </p>
        </div>
      </div>

      {/* ── ROW 3: Revenue Goal | Top 5 Treatments ── */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {/* Revenue Goal Gauge */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 flex flex-col items-center justify-center">
          <div className="mb-3 flex w-full items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Target className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs font-semibold text-emerald-500">
              {isEs ? "Meta del mes" : "Monthly goal"}
            </span>
          </div>
          {monthlyRevenueGoal > 0 ? (
            <>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-3">
                {goalMessage}
              </p>
              {/* Gauge SVG */}
              <div className="relative w-40 h-24">
                <svg viewBox="0 0 160 90" className="w-full h-full">
                  {/* Background arc */}
                  <path
                    d="M 15 80 A 65 65 0 0 1 145 80"
                    fill="none"
                    stroke="hsl(var(--muted))"
                    strokeWidth="12"
                    strokeLinecap="round"
                  />
                  {/* Progress arc */}
                  <path
                    d="M 15 80 A 65 65 0 0 1 145 80"
                    fill="none"
                    stroke="hsl(142.1 76.2% 36.3%)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={`${(goalProgress / 100) * 204} 204`}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex items-end justify-center pb-0">
                  <span className="text-3xl font-extrabold">{goalProgress}%</span>
                </div>
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                {isEs ? "Ingresos del mes" : "Monthly revenue"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatCurrency(periodData.month.revenue)} / {formatCurrency(monthlyRevenueGoal)}
              </p>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
              <p className="text-sm text-muted-foreground">
                {isEs ? "Sin meta configurada" : "No goal configured"}
              </p>
              <Link
                href="/settings#revenue-goal"
                className="mt-2 text-xs text-primary hover:underline font-medium"
              >
                {isEs ? "Configurar meta" : "Set goal"}
              </Link>
            </div>
          )}
        </div>

        {/* Appointments Timeline (last 30 days) */}
        <div className="md:col-span-2 rounded-2xl border border-border/60 bg-card">
          <div className="flex items-center justify-between gap-2.5 px-6 py-4 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                <Activity className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold">
                  {isEs ? "Citas últimos 30 días" : "Appointments last 30 days"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {seriesTotal} {isEs ? "citas · promedio" : "appointments · avg"}{" "}
                  {seriesAvg.toFixed(1)}/{isEs ? "día" : "day"}
                </p>
              </div>
            </div>
            <Link
              href="/scheduler"
              className="hidden sm:block text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {isEs ? "Ver agenda →" : "View schedule →"}
            </Link>
          </div>
          {seriesTotal === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {isEs ? "Sin citas en los últimos 30 días" : "No appointments in the last 30 days"}
              </p>
            </div>
          ) : (
            <div className="px-4 py-4">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart
                  data={dailySeries}
                  margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                    opacity={0.4}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={28}
                    tickFormatter={(d: string) => {
                      const [, m, day] = d.split("-");
                      return `${parseInt(day, 10)}/${parseInt(m, 10)}`;
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={32}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as DailyPoint;
                      const date = new Date(d.date + "T12:00:00");
                      const label = date.toLocaleDateString(isEs ? "es-PE" : "en-US", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      });
                      return (
                        <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
                          <p className="text-xs font-semibold capitalize">{label}</p>
                          <p className="text-xs text-emerald-500 font-medium">
                            {d.count} {isEs ? (d.count === 1 ? "cita" : "citas") : (d.count === 1 ? "appt" : "appts")}
                          </p>
                        </div>
                      );
                    }}
                    cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#areaGrad)"
                    animationDuration={800}
                    animationEasing="ease-out"
                    dot={false}
                    activeDot={{ r: 4, fill: "#10b981", stroke: "white", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
