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
  Users,
  FileText,
  UserX,
  BarChart3,
  Stethoscope,
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
}

interface ReceptionistPerf {
  name: string;
  completed: number;
  total: number;
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
  periodData: Record<"month" | "week" | "today", PeriodData>;
  pendingDebt: number;
  debtorCount: number;
  receptionistPerformance: ReceptionistPerf[];
  topTreatments: TopTreatment[];
  heatmapData: HeatmapPoint[];
  monthlyRevenueGoal: number;
}

// ── Helpers ────────────────────────────────────────────────────

function GrowthBadge({ value, suffix }: { value: number; suffix?: string }) {
  if (value === 0) return null;
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
        positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
      }`}
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}
      {value}% {suffix ?? ""}
    </span>
  );
}

const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BAR_COLORS = ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5"];
const RECEPTIONIST_COLORS = [
  "#f97316", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6",
];

// ── Main Component ─────────────────────────────────────────────

export function AdminDashboard({
  userName,
  periodData,
  pendingDebt,
  debtorCount,
  receptionistPerformance,
  topTreatments,
  heatmapData,
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
            className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm font-medium transition-all hover:bg-accent/50 hover:border-border"
          >
            <FileText className="h-4 w-4" />
            {isEs ? "Ver reportes" : "View reports"}
          </Link>
        </div>
      </div>

      {/* ── ROW 1: Revenue | Pending Debt | Appointments ── */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {/* Revenue */}
        <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 p-6">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {isEs
              ? { month: "Ingresos del mes", week: "Ingresos (7 días)", today: "Ingresos de hoy" }[period]
              : { month: "Monthly revenue", week: "Revenue (7 days)", today: "Today's revenue" }[period]
            }
          </p>
          <p className="text-3xl font-extrabold tracking-tight">
            {formatCurrency(data.revenue)}
          </p>
          <div className="mt-2">
            <GrowthBadge value={data.revenueGrowth} suffix={periodSuffix[period]} />
          </div>
        </div>

        {/* Pending Debt */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {isEs ? "Cobranza pendiente" : "Pending debt"}
          </p>
          <div className="flex items-baseline gap-4">
            <div>
              <p className="text-3xl font-extrabold tracking-tight text-orange-600 dark:text-orange-400">
                {formatCurrency(pendingDebt)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs ? "por cobrar" : "to collect"}
              </p>
            </div>
            <div className="border-l border-border pl-4">
              <p className="text-3xl font-extrabold tracking-tight">
                {debtorCount}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {isEs ? "pacientes deudores" : "patients with debt"}
              </p>
            </div>
          </div>
        </div>

        {/* Appointments summary */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            {isEs ? "Citas" : "Appointments"}
          </p>
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
              <p className="text-xs text-muted-foreground">%No Shows</p>
              <p className="text-2xl font-extrabold">{data.noShowRate}%</p>
            </div>
            <div className="text-center">
              <div className="flex justify-center mb-1">
                <XCircle className="h-4 w-4 text-red-500" />
              </div>
              <p className="text-xs text-muted-foreground">
                {isEs ? "Canceladas" : "Cancelled"}
              </p>
              <p className="text-2xl font-extrabold">{data.cancelledRate}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 2: New vs Recurring | Receptionist Performance | Occupancy ── */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {/* New vs Recurring patients */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <p className="text-xs font-medium text-muted-foreground mb-4">
            {isEs ? "Pacientes nuevos vs recurrentes" : "New vs recurring patients"}
          </p>
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
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-3 w-3 rounded-sm bg-emerald-500/20" />
            <p className="text-xs font-medium text-muted-foreground">
              {isEs ? "Rendimiento por recepcionista" : "Receptionist performance"}
            </p>
          </div>
          {receptionistPerformance.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isEs ? "Sin datos" : "No data"}
            </p>
          ) : (
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
          )}
        </div>

        {/* Occupancy Rate */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {isEs ? "% de Ocupación" : "Occupancy %"}
          </p>
          <p className="text-5xl font-extrabold tracking-tight mt-2">
            {data.occupancyRate}%
          </p>
          <div className="mt-2">
            <GrowthBadge value={data.occupancyGrowth} suffix={periodSuffix[period]} />
          </div>
          {/* Progress bar */}
          <div className="mt-4 h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${data.occupancyRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── ROW 3: Revenue Goal | Top 5 Treatments ── */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {/* Revenue Goal Gauge */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 flex flex-col items-center justify-center">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {isEs ? "Meta del mes" : "Monthly goal"}
          </p>
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
                href="/settings"
                className="mt-2 text-xs text-primary hover:underline font-medium"
              >
                {isEs ? "Configurar meta" : "Set goal"}
              </Link>
            </div>
          )}
        </div>

        {/* Top 5 Treatments */}
        <div className="md:col-span-2 rounded-2xl border border-border/60 bg-card">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-border/40">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10">
              <Stethoscope className="h-4 w-4 text-emerald-400" />
            </div>
            <h3 className="text-sm font-bold">
              {isEs ? "Top 5 Tratamientos" : "Top 5 Treatments"}
            </h3>
          </div>
          {topTreatments.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {isEs ? "Sin datos" : "No data"}
              </p>
            </div>
          ) : (
            <div className="px-4 py-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={topTreatments.map((t) => ({ ...t, value: t.count }))}
                  layout="vertical"
                  barCategoryGap="25%"
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    width={150}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as TopTreatment;
                      return (
                        <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
                          <p className="text-xs font-semibold">{d.name}</p>
                          <p className="text-xs">{d.count} {isEs ? "citas" : "appts"}</p>
                          <p className="text-xs text-emerald-400 font-medium">{formatCurrency(d.revenue)}</p>
                        </div>
                      );
                    }}
                    cursor={false}
                  />
                  <Bar
                    dataKey="value"
                    radius={999}
                    background={{ fill: "rgba(128,128,128,0.1)", radius: 999 }}
                    animationDuration={800}
                    animationEasing="ease-out"
                  >
                    {topTreatments.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 4: Heatmap (full width) ── */}
      <AppointmentHeatmap data={heatmapData} isEs={isEs} />
    </div>
  );
}

// ── Heatmap Component ──────────────────────────────────────────

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

  const getCount = (day: number, hour: number) =>
    data.find((d) => d.day === day && d.hour === hour)?.count ?? 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10">
          <BarChart3 className="h-4 w-4 text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-bold">
            {isEs ? "Mapa de calor" : "Heatmap"}
          </h3>
          <p className="text-[10px] text-muted-foreground">
            {isEs ? "Citas completas — últimos 90 días" : "Completed appointments — last 90 days"}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[320px]">
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `48px repeat(${hours.length}, 1fr)` }}
          >
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
              {isEs ? "Más" : "More"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
