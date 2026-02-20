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

interface MarketingReportProps {
  appointments: AppointmentWithRelations[];
  patients: Patient[];
}

const CHART_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1",
];

// Native SVG donut chart
function DonutChartSVG({
  data,
  size = 220,
  innerRadius = 55,
  outerRadius = 95,
}: {
  data: { name: string; value: number }[];
  size?: number;
  innerRadius?: number;
  outerRadius?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;

  let cumulativeAngle = -Math.PI / 2;

  const slices = data.map((d, i) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    const x1 = cx + outerRadius * Math.cos(startAngle);
    const y1 = cy + outerRadius * Math.sin(startAngle);
    const x2 = cx + outerRadius * Math.cos(endAngle);
    const y2 = cy + outerRadius * Math.sin(endAngle);
    const x3 = cx + innerRadius * Math.cos(endAngle);
    const y3 = cy + innerRadius * Math.sin(endAngle);
    const x4 = cx + innerRadius * Math.cos(startAngle);
    const y4 = cy + innerRadius * Math.sin(startAngle);

    const largeArc = angle > Math.PI ? 1 : 0;

    const path = [
      `M ${x1} ${y1}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
      `Z`,
    ].join(" ");

    // Label position
    const midAngle = startAngle + angle / 2;
    const labelR = outerRadius + 18;
    const lx = cx + labelR * Math.cos(midAngle);
    const ly = cy + labelR * Math.sin(midAngle);
    const pct = ((d.value / total) * 100).toFixed(0);

    return { path, color: CHART_COLORS[i % CHART_COLORS.length], lx, ly, pct, name: d.name, midAngle };
  });

  return (
    <svg viewBox={`0 0 ${size + 120} ${size + 20}`} className="w-full" style={{ height: size + 20 }}>
      <g transform={`translate(60, 10)`}>
        {slices.map((s, i) => (
          <g key={i}>
            <path d={s.path} fill={s.color} stroke="hsl(var(--card))" strokeWidth={1.5} />
            {data.length <= 6 && (
              <text
                x={s.lx}
                y={s.ly}
                textAnchor={s.midAngle > Math.PI / 2 && s.midAngle < (3 * Math.PI) / 2 ? "end" : "start"}
                fontSize={8}
                fill="hsl(var(--muted-foreground))"
                dominantBaseline="middle"
              >
                {s.name} ({s.pct}%)
              </text>
            )}
          </g>
        ))}
      </g>
    </svg>
  );
}

// Reusable bar chart
function BarChartSVG({
  data,
  keys,
  colors,
  height = 240,
}: {
  data: Record<string, string | number>[];
  keys: string[];
  colors: string[];
  height?: number;
}) {
  const paddingLeft = 40;
  const paddingBottom = 40;
  const paddingTop = 10;
  const paddingRight = 10;
  const width = 500;
  const chartH = height - paddingTop - paddingBottom;
  const chartW = width - paddingLeft - paddingRight;

  const maxVal = Math.max(
    1,
    ...data.flatMap((d) => keys.map((k) => Number(d[k] ?? 0)))
  );

  const groupW = chartW / Math.max(data.length, 1);
  const barW = Math.max(4, (groupW / (keys.length + 1)) * 0.85);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = paddingTop + chartH * (1 - frac);
        return (
          <g key={frac}>
            <line x1={paddingLeft} x2={paddingLeft + chartW} y1={y} y2={y} stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="3 3" />
            <text x={paddingLeft - 4} y={y + 4} textAnchor="end" fontSize={9} fill="hsl(var(--muted-foreground))">{Math.round(maxVal * frac)}</text>
          </g>
        );
      })}
      {data.map((d, gi) => {
        const groupX = paddingLeft + gi * groupW + groupW / 2;
        const totalBarW = keys.length * barW + (keys.length - 1) * 2;
        const startX = groupX - totalBarW / 2;
        return (
          <g key={gi}>
            {keys.map((k, ki) => {
              const val = Number(d[k] ?? 0);
              const bh = (val / maxVal) * chartH;
              const bx = startX + ki * (barW + 2);
              const by = paddingTop + chartH - bh;
              return <rect key={k} x={bx} y={by} width={barW} height={bh} fill={colors[ki]} rx={2} />;
            })}
            <text x={groupX} y={paddingTop + chartH + 14} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
              {String(d.name)}
            </text>
          </g>
        );
      })}
      <line x1={paddingLeft} x2={paddingLeft + chartW} y1={paddingTop + chartH} y2={paddingTop + chartH} stroke="hsl(var(--border))" strokeWidth={1} />
    </svg>
  );
}

function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3 mt-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
          {item.label}
        </div>
      ))}
    </div>
  );
}

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
        {/* Origin donut chart */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">{t("reports.origin_distribution")}</h3>
          {originData.length > 0 ? (
            <>
              <DonutChartSVG data={originData} />
              <ChartLegend
                items={originData.map((d, i) => ({
                  label: `${d.name} (${d.value})`,
                  color: CHART_COLORS[i % CHART_COLORS.length],
                }))}
              />
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
        </div>

        {/* Conversion by origin bar chart */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">{t("reports.conversion_by_origin")}</h3>
          {conversionByOrigin.length > 0 ? (
            <>
              <BarChartSVG
                data={conversionByOrigin}
                keys={["total", "completed"]}
                colors={["#3b82f6", "#22c55e"]}
              />
              <ChartLegend
                items={[
                  { label: "Agendados", color: "#3b82f6" },
                  { label: "Atendidos", color: "#22c55e" },
                ]}
              />
            </>
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
