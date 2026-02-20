"use client";

import { useMemo } from "react";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, Patient } from "@/types/admin";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Megaphone,
  Users,
  TrendingUp,
  Target,
} from "lucide-react";

interface MarketingReportProps {
  appointments: AppointmentWithRelations[];
  patients: Patient[];
}

const CHART_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

export function MarketingReport({ appointments, patients }: MarketingReportProps) {
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

  // Conversion rate: % of scheduled that actually attended (completed)
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

  // New patients count
  const newPatientsCount = patients.length;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Target className="h-4 w-4" />
            {t("reports.conversion_rate")}
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{conversionData.conversionRate}%</p>
          <p className="text-[10px] text-muted-foreground">
            {conversionData.totalCompleted} / {conversionData.totalScheduled} {t("reports.attended")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-red-500" />
            {t("reports.cancel_rate")}
          </div>
          <p className="mt-2 text-2xl font-bold text-red-600">{conversionData.cancelRate}%</p>
          <p className="text-[10px] text-muted-foreground">
            {conversionData.totalCancelled} {t("reports.cancelled")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Megaphone className="h-4 w-4" />
            {t("reports.unique_origins")}
          </div>
          <p className="mt-2 text-2xl font-bold">{originData.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-4 w-4" />
            {t("reports.total_patients")}
          </div>
          <p className="mt-2 text-2xl font-bold">{newPatientsCount}</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Origin pie chart */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-4">{t("reports.origin_distribution")}</h3>
          {originData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={originData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={50}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  labelLine={{ stroke: "hsl(var(--muted-foreground))" }}
                >
                  {originData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
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
          <h3 className="text-sm font-semibold mb-4">{t("reports.conversion_by_origin")}</h3>
          {conversionByOrigin.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={conversionByOrigin} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="total" name="Agendados" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Atendidos" fill="#22c55e" radius={[4, 4, 0, 0]} />
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
