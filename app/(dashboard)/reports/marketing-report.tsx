"use client";

import { useMemo, forwardRef, useImperativeHandle } from "react";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, Patient } from "@/types/admin";
import {
  Megaphone,
  Users,
  TrendingUp,
  Target,
  MapPin,
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
import type { ReportExportConfig } from "@/lib/report-export-types";

interface MarketingReportProps {
  appointments: AppointmentWithRelations[];
  patients: Patient[];
  dateFrom: string;
  dateTo: string;
}

export interface ReportExportHandle {
  getExportConfig: () => ReportExportConfig;
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
    <div className="relative group inline-flex items-center gap-2 text-xs text-muted-foreground cursor-help">
      <Icon className={`h-4 w-4 ${iconClass ?? ""}`} />
      {label}
      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150 absolute left-0 top-full mt-2 z-50">
        <div className="relative rounded-lg bg-popover border border-border px-3 py-1.5 shadow-lg">
          <div className="absolute -top-1 left-4 h-2 w-2 rotate-45 bg-popover border-l border-t border-border" />
          <span className="text-xs font-medium text-foreground whitespace-nowrap">{tooltip}</span>
        </div>
      </div>
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

export const MarketingReport = forwardRef<ReportExportHandle, MarketingReportProps>(
  function MarketingReport({ appointments, patients, dateFrom, dateTo }, ref) {
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

  // Demographic: departamento distribution
  const departamentoData = useMemo(() => {
    const map = new Map<string, number>();
    patients.forEach((p) => {
      const dep = (p as any).departamento || "Sin departamento";
      map.set(dep, (map.get(dep) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [patients]);

  // Demographic: distrito distribution (top 10)
  const distritoData = useMemo(() => {
    const map = new Map<string, number>();
    patients.forEach((p) => {
      const dist = (p as any).distrito || "Sin distrito";
      map.set(dist, (map.get(dist) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
  }, [patients]);

  // Patients with demographic data filled
  const patientsWithLocation = useMemo(() => {
    return patients.filter((p) => (p as any).departamento || (p as any).distrito).length;
  }, [patients]);

  const demographicCoverage = newPatientsCount > 0
    ? ((patientsWithLocation / newPatientsCount) * 100).toFixed(0)
    : "0";

  // ── Imperative handle for parent export ──
  useImperativeHandle(ref, () => ({
    getExportConfig: (): ReportExportConfig => ({
      title: "Reporte de Marketing",
      dateRange: { from: dateFrom, to: dateTo },
      kpis: [
        { label: "Tasa de Conversión", value: `${conversionData.conversionRate}%` },
        { label: "Tasa de Cancelación", value: `${conversionData.cancelRate}%` },
        { label: "Orígenes Únicos", value: String(originData.length) },
        { label: "Nuevos Pacientes", value: String(newPatientsCount) },
      ],
      tables: [
        {
          title: "Distribución por Origen",
          headers: ["Origen", "Cantidad", "Porcentaje"],
          rows: originData.map((o) => {
            const total = originData.reduce((s, x) => s + x.value, 0);
            return [o.name, o.value, `${total > 0 ? ((o.value / total) * 100).toFixed(1) : 0}%`];
          }),
        },
        {
          title: "Conversión por Origen",
          headers: ["Origen", "Agendados", "Atendidos", "Tasa de conversión (%)"],
          rows: conversionByOrigin.map((r) => [r.name, r.total, r.completed, `${r.rate}%`]),
        },
        {
          title: "Distribución por Departamento",
          headers: ["Departamento", "Pacientes", "Porcentaje"],
          rows: departamentoData.map((d) => {
            const total = departamentoData.reduce((s, x) => s + x.value, 0);
            return [d.name, d.value, `${total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%`];
          }),
        },
        {
          title: "Top Distritos",
          headers: ["Distrito", "Pacientes", "Porcentaje"],
          rows: distritoData.map((d) => {
            const total = patients.length;
            return [d.name, d.value, `${total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%`];
          }),
        },
      ],
      filename: `reporte_marketing_${dateFrom}_${dateTo}`,
    }),
  }), [conversionData, originData, conversionByOrigin, departamentoData, distritoData, patients.length, newPatientsCount, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle icon={Target} label={t("reports.conversion_rate")} tooltip={t("reports.tooltip_conversion_rate")} />
          <p className="mt-2 text-2xl font-bold text-emerald-600">{conversionData.conversionRate}%</p>
          <p className="text-[10px] text-muted-foreground">
            {conversionData.totalCompleted} / {conversionData.totalScheduled} {t("reports.attended")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle icon={TrendingUp} label={t("reports.cancel_rate")} tooltip={t("reports.tooltip_cancel_rate")} iconClass="text-red-500" />
          <p className="mt-2 text-2xl font-bold text-red-600">{conversionData.cancelRate}%</p>
          <p className="text-[10px] text-muted-foreground">
            {conversionData.totalCancelled} {t("reports.cancelled")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle icon={Megaphone} label={t("reports.unique_origins")} tooltip={t("reports.tooltip_unique_origins")} />
          <p className="mt-2 text-2xl font-bold">{originData.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle icon={Users} label={t("reports.total_patients")} tooltip={t("reports.tooltip_total_patients")} />
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
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 12) + "..." : v} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={false} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
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
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">{t("reports.conversion_by_origin")}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{t("reports.origin")}</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t("reports.scheduled")}</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t("reports.attended")}</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t("reports.conversion_rate")}</th>
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

      {/* ── Demografía ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold">Demografía de Pacientes</h3>
          </div>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
            {demographicCoverage}% con ubicación
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Departamento donut chart */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-3">Distribución por Departamento</h4>
            {departamentoData.length > 0 && departamentoData[0].name !== "Sin departamento" ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={departamentoData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={departamentoData.length <= 8 ? renderCustomLabel : undefined}
                    animationDuration={800}
                    animationEasing="ease-out"
                  >
                    {departamentoData.map((_entry, index) => (
                      <Cell
                        key={`dep-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                        stroke="hsl(var(--card))"
                        strokeWidth={1.5}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend
                    iconType="square"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value: string) => {
                      const item = departamentoData.find((d) => d.name === value);
                      return item ? `${value} (${item.value})` : value;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">Sin datos de departamento registrados</p>
            )}
          </div>

          {/* Top distritos bar chart */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-3">Top Distritos</h4>
            {distritoData.length > 0 && distritoData[0].name !== "Sin distrito" ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={distritoData} layout="vertical" barCategoryGap="20%">
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 14) + "..." : v} />
                  <Tooltip content={<CustomTooltip />} cursor={false} />
                  <Bar dataKey="value" name="Pacientes" fill="#10b981" radius={[0, 4, 4, 0]} animationDuration={800} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">Sin datos de distrito registrados</p>
            )}
          </div>
        </div>
      </div>

      {/* Demographic detail table */}
      {departamentoData.length > 0 && departamentoData[0].name !== "Sin departamento" && (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold">Detalle por Departamento y Distrito</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Departamento</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Pacientes</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">% del Total</th>
                </tr>
              </thead>
              <tbody>
                {departamentoData
                  .filter((d) => d.name !== "Sin departamento")
                  .map((row) => {
                    const total = departamentoData.reduce((s, x) => s + x.value, 0);
                    const pct = total > 0 ? ((row.value / total) * 100).toFixed(1) : "0";
                    return (
                      <tr key={row.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2.5 font-medium flex items-center gap-2">
                          <MapPin className="h-3 w-3 text-primary" />
                          {row.name}
                        </td>
                        <td className="px-4 py-2.5 text-center font-medium">{row.value}</td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});
