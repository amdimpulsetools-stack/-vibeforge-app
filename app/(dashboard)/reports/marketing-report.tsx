"use client";

import { useMemo } from "react";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, Patient } from "@/types/admin";
import {
  Megaphone,
  Users,
  TrendingUp,
  Target,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface MarketingReportProps {
  appointments: AppointmentWithRelations[];
  patients: Patient[];
  dateFrom: string;
  dateTo: string;
}

const CHART_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

// ─── Custom Recharts Tooltip ──────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      {label && <p className="text-xs font-semibold text-popover-foreground mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="text-xs text-popover-foreground flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { name: string; value: number; percent: number } }> }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const pct = ((entry.payload.percent ?? 0) * 100).toFixed(0);
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs text-popover-foreground">
        {entry.payload.name}: {entry.value} ({pct}%)
      </p>
    </div>
  );
}

// ─── Card title with native tooltip ───────────────────────────
function CardTitle({
  icon: Icon,
  label,
  tooltip,
  iconClass,
}: {
  icon: typeof Target;
  label: string;
  tooltip: string;
  iconClass?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground cursor-help" title={tooltip}>
      <Icon className={`h-4 w-4 ${iconClass ?? ""}`} />
      {label}
    </div>
  );
}

// ─── Custom pie label ─────────────────────────────────────────
function renderCustomLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  name?: string;
  percent?: number;
}) {
  const cx = props.cx ?? 0;
  const cy = props.cy ?? 0;
  const midAngle = props.midAngle ?? 0;
  const outerRadius = props.outerRadius ?? 0;
  const name = props.name ?? "";
  const percent = props.percent ?? 0;

  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 18;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  const pct = (percent * 100).toFixed(0);

  return (
    <text
      x={x}
      y={y}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={10}
      fill="hsl(var(--muted-foreground))"
    >
      {name} ({pct}%)
    </text>
  );
}

export function MarketingReport({ appointments, patients, dateFrom, dateTo }: MarketingReportProps) {
  const { t } = useLanguage();

  // Origin distribution (from appointments)
  const originData = useMemo(() => {
    const map = new Map<string, number>();
    appointments.forEach((a) => {
      const origin = a.origin || "Sin origen";
      map.set(origin, (map.get(origin) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [appointments]);

  // Patient origin distribution (from patients.viene_desde)
  const patientOriginData = useMemo(() => {
    const map = new Map<string, number>();
    patients.forEach((p) => {
      const origin = p.viene_desde || p.origin || "Sin origen";
      map.set(origin, (map.get(origin) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [patients]);

  // Conversion rate
  const conversionData = useMemo(() => {
    const totalScheduled = appointments.filter(
      (a) => a.status !== "cancelled"
    ).length;
    const totalCompleted = appointments.filter(
      (a) => a.status === "completed"
    ).length;
    const totalCancelled = appointments.filter(
      (a) => a.status === "cancelled"
    ).length;

    const conversionRate = totalScheduled > 0
      ? ((totalCompleted / totalScheduled) * 100).toFixed(1)
      : "0.0";
    const cancelRate = appointments.length > 0
      ? ((totalCancelled / appointments.length) * 100).toFixed(1)
      : "0.0";

    return {
      totalScheduled,
      totalCompleted,
      totalCancelled,
      conversionRate,
      cancelRate,
    };
  }, [appointments]);

  // Conversion by origin
  const conversionByOrigin = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    appointments.forEach((a) => {
      const origin = a.origin || "Sin origen";
      if (!map.has(origin)) map.set(origin, { total: 0, completed: 0 });
      const entry = map.get(origin)!;
      if (a.status !== "cancelled") entry.total++;
      if (a.status === "completed") entry.completed++;
    });

    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        total: data.total,
        completed: data.completed,
        rate: data.total > 0 ? Number(((data.completed / data.total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [appointments]);

  const newPatientsCount = patients.length;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle
            icon={Target}
            label={t("reports.conversion_rate")}
            tooltip={t("reports.tooltip_conversion_rate")}
          />
          <p className="mt-2 text-2xl font-bold text-emerald-600">{conversionData.conversionRate}%</p>
          <p className="text-[10px] text-muted-foreground">
            {conversionData.totalCompleted} / {conversionData.totalScheduled} {t("reports.attended")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle
            icon={TrendingUp}
            label={t("reports.cancel_rate")}
            tooltip={t("reports.tooltip_cancel_rate")}
            iconClass="text-red-500"
          />
          <p className="mt-2 text-2xl font-bold text-red-600">{conversionData.cancelRate}%</p>
          <p className="text-[10px] text-muted-foreground">
            {conversionData.totalCancelled} {t("reports.cancelled")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle
            icon={Megaphone}
            label={t("reports.unique_origins")}
            tooltip={t("reports.tooltip_unique_origins")}
          />
          <p className="mt-2 text-2xl font-bold">{originData.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle
            icon={Users}
            label={t("reports.total_patients")}
            tooltip={t("reports.tooltip_total_patients")}
          />
          <p className="mt-2 text-2xl font-bold">{newPatientsCount}</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Origin donut chart */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">{t("reports.origin_distribution")}</h3>
          {originData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={originData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={originData.length <= 6 ? renderCustomLabel : undefined}
                  animationDuration={800}
                  animationEasing="ease-out"
                >
                  {originData.map((_entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      stroke="hsl(var(--card))"
                      strokeWidth={1.5}
                    />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend
                  iconType="square"
                  iconSize={10}
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value: string) => {
                    const item = originData.find((d) => d.name === value);
                    return item ? `${value} (${item.value})` : value;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
        </div>

        {/* Conversion by origin bar chart */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">{t("reports.conversion_by_origin")}</h3>
          {conversionByOrigin.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={conversionByOrigin} barCategoryGap="25%">
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 12) + "..." : v}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="total" name="Agendados" fill="#3b82f6" radius={999} animationDuration={800} animationEasing="ease-out" />
                <Bar dataKey="completed" name="Atendidos" fill="#22c55e" radius={999} animationDuration={800} animationEasing="ease-out" animationBegin={200} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
        </div>
      </div>

      {/* Conversion by origin table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">{t("reports.conversion_by_origin")}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                  {t("reports.origin")}
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                  {t("reports.scheduled")}
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                  {t("reports.attended")}
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                  {t("reports.conversion_rate")}
                </th>
              </tr>
            </thead>
            <tbody>
              {conversionByOrigin.map((row) => (
                <tr key={row.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium">{row.name}</td>
                  <td className="px-4 py-2.5 text-center">{row.total}</td>
                  <td className="px-4 py-2.5 text-center text-emerald-600 font-medium">{row.completed}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`font-semibold ${row.rate >= 70 ? "text-emerald-600" : row.rate >= 40 ? "text-amber-600" : "text-red-600"}`}>
                      {row.rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {conversionByOrigin.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
