"use client";

import { useMemo, forwardRef, useImperativeHandle } from "react";
import { useLanguage } from "@/components/language-provider";
import { useBrandAccent } from "@/hooks/use-brand-accent";
import type { ReportsOverview } from "@/types/reports";
import {
  Clock,
  Building2,
  Star,
  Calendar,
} from "lucide-react";
import type { ReportExportConfig } from "@/lib/report-export-types";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface OperationalReportProps {
  // Agregados server-side (RPC get_reports_overview, mig 198). Antes este
  // componente recibía las filas crudas de citas y agregaba en JS — con
  // >1000 filas en el rango, PostgREST truncaba y los números salían mal.
  overview: ReportsOverview | null;
  dateFrom: string;
  dateTo: string;
}

export interface ReportExportHandle {
  getExportConfig: () => ReportExportConfig;
}

// ─── Custom Recharts Tooltip ──────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-popover-foreground mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs text-popover-foreground flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

// ─── Card title with native tooltip ───────────────────────────
function CardTitle({
  icon: Icon,
  label,
  tooltip,
}: {
  icon: typeof Calendar;
  label: string;
  tooltip: string;
}) {
  return (
    <div className="relative group inline-flex items-center gap-2 text-xs text-muted-foreground cursor-help">
      <Icon className="h-4 w-4" />
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


export const OperationalReport = forwardRef<ReportExportHandle, OperationalReportProps>(
  function OperationalReport({ overview, dateFrom, dateTo }, ref) {
  const { t } = useLanguage();
  // Color de marca del chart (sigue el tema de acento de la org).
  const accent = useBrandAccent();

  // Citas activas (no canceladas) — derivadas de la serie diaria del RPC:
  // por día, scheduled + completed son exactamente los status != cancelled.
  const activeAppointmentsCount = useMemo(
    () => (overview?.daily ?? []).reduce((sum, d) => sum + d.scheduled + d.completed, 0),
    [overview]
  );

  // Peak hours analysis — mismos buckets fijos 08:00-19:00 de siempre; el
  // RPC entrega el conteo por hora (sin canceladas) y lo demás se descarta,
  // igual que hacía el filtro sobre start_time.
  const peakHoursData = useMemo(() => {
    const hourMap = new Map<string, number>();
    for (let h = 8; h <= 19; h++) {
      const label = `${h.toString().padStart(2, "0")}:00`;
      hourMap.set(label, 0);
    }

    (overview?.peak_hours ?? []).forEach((ph) => {
      const label = `${String(ph.hour).padStart(2, "0")}:00`;
      if (hourMap.has(label)) {
        hourMap.set(label, (hourMap.get(label) ?? 0) + ph.count);
      }
    });

    return Array.from(hourMap.entries()).map(([hour, count]) => ({
      hour,
      citas: count,
    }));
  }, [overview]);

  // Top services — ya agrupados y ordenados por count desc en el RPC
  // (revenue solo de citas completed, como antes).
  const topServicesData = useMemo(
    () =>
      (overview?.services ?? []).map((s) => ({
        name: s.name,
        count: s.count,
        revenue: Number(s.revenue),
      })),
    [overview]
  );

  // Office occupancy — el RPC agrupa sobre TODAS las citas (total excluye
  // canceladas) y ordena por total desc; la tasa se calcula aquí con la
  // misma fórmula de antes.
  const officeData = useMemo(
    () =>
      (overview?.offices ?? []).map((o) => ({
        name: o.name,
        total: o.total,
        completed: o.completed,
        rate: o.total > 0 ? Number(((o.completed / o.total) * 100).toFixed(1)) : 0,
      })),
    [overview]
  );

  // Daily trend — misma transformación visual de antes (MM-DD + sort).
  const dailyTrend = useMemo(
    () =>
      (overview?.daily ?? [])
        .map((d) => ({
          date: d.date.slice(5), // MM-DD
          scheduled: d.scheduled,
          completed: d.completed,
          cancelled: d.cancelled,
          total: d.scheduled + d.completed + d.cancelled,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [overview]
  );

  // KPI calculations
  const avgDailyAppointments = dailyTrend.length > 0
    ? (activeAppointmentsCount / dailyTrend.length).toFixed(1)
    : "0";
  const busiestHour = peakHoursData.reduce(
    (max, h) => (h.citas > max.citas ? h : max),
    { hour: "--", citas: 0 }
  );
  const topService = topServicesData[0];

  // ── Expose export config via ref ──
  useImperativeHandle(ref, () => ({
    getExportConfig: (): ReportExportConfig => ({
      title: "Reporte Operacional",
      dateRange: { from: dateFrom, to: dateTo },
      kpis: [
        { label: "Promedio Diario", value: avgDailyAppointments },
        { label: "Hora Pico", value: busiestHour.hour },
        { label: "Servicio Top", value: topService?.name ?? "--" },
        { label: "Consultorios Usados", value: String(officeData.length) },
      ],
      tables: [
        {
          title: "Top Servicios",
          headers: ["Servicio", "Cantidad", "Ingresos (S/.)"],
          rows: topServicesData.map((s) => [s.name, s.count, s.revenue.toFixed(2)]),
        },
        {
          title: "Ocupación por Consultorio",
          headers: ["Consultorio", "Total Citas", "Completadas", "Tasa (%)"],
          rows: officeData.map((o) => [o.name, o.total, o.completed, `${o.rate}%`]),
        },
        {
          title: "Horas Pico",
          headers: ["Hora", "Citas"],
          rows: peakHoursData.filter((h) => h.citas > 0).map((h) => [h.hour, h.citas]),
        },
      ],
      filename: `reporte_operacional_${dateFrom}_${dateTo}`,
    }),
  }), [dateFrom, dateTo, avgDailyAppointments, busiestHour, topService, officeData, topServicesData, peakHoursData]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 max-md:[&>*]:min-w-0 max-md:[&_p]:break-words">
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle icon={Calendar} label={t("reports.avg_daily")} tooltip={t("reports.tooltip_avg_daily")} />
          <p className="mt-2 text-2xl font-bold">{avgDailyAppointments}</p>
          <p className="text-[10px] text-muted-foreground">{t("reports.appointments_per_day")}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle icon={Clock} label={t("reports.peak_hour")} tooltip={t("reports.tooltip_peak_hour")} />
          <p className="mt-2 text-2xl font-bold">{busiestHour.hour}</p>
          <p className="text-[10px] text-muted-foreground">{busiestHour.citas} {t("reports.appointments")}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle icon={Star} label={t("reports.top_service")} tooltip={t("reports.tooltip_top_service")} />
          <p className="mt-2 text-lg font-bold truncate">{topService?.name ?? "--"}</p>
          <p className="text-[10px] text-muted-foreground">{topService?.count ?? 0} citas</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle icon={Building2} label={t("reports.offices_used")} tooltip={t("reports.tooltip_offices_used")} />
          <p className="mt-2 text-2xl font-bold">{officeData.length}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2 max-md:[&>*]:min-w-0 max-md:[&_p]:break-words">
        {/* Daily trend area chart */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">{t("reports.daily_trend")}</h3>
          {dailyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={dailyTrend}>
                <defs>
                  <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradScheduled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradCancelled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} formatter={(value: string) => {
                  const labels: Record<string, string> = { completed: "Atendidos", scheduled: "Programados", cancelled: "Cancelados" };
                  return labels[value] ?? value;
                }} />
                <Area type="monotone" dataKey="completed" name="Atendidos" stroke="#22c55e" fill="url(#gradCompleted)" strokeWidth={2} animationDuration={1000} animationEasing="ease-out" dot={{ r: 3, fill: "#22c55e" }} activeDot={{ r: 5 }} />
                <Area type="monotone" dataKey="scheduled" name="Programados" stroke="#3b82f6" fill="url(#gradScheduled)" strokeWidth={2} animationDuration={1000} animationEasing="ease-out" animationBegin={300} dot={{ r: 3, fill: "#3b82f6" }} activeDot={{ r: 5 }} />
                <Area type="monotone" dataKey="cancelled" name="Cancelados" stroke="#ef4444" fill="url(#gradCancelled)" strokeWidth={2} animationDuration={1000} animationEasing="ease-out" animationBegin={600} dot={{ r: 3, fill: "#ef4444" }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
        </div>

        {/* Peak hours */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">{t("reports.peak_hours")}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={peakHoursData} barCategoryGap="25%">
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} cursor={false} />
              <Bar dataKey="citas" name="Citas" fill={accent} radius={999} maxBarSize={56} background={{ fill: "rgba(128,128,128,0.1)", radius: 999 }} animationDuration={1000} animationEasing="ease-out" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row: Top services + Office occupancy */}
      <div className="grid gap-6 lg:grid-cols-2 max-md:[&>*]:min-w-0 max-md:[&_p]:break-words">
        {/* Top services table */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold">{t("reports.top_services")}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{t("reports.service")}</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t("reports.count")}</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">{t("reports.revenue")}</th>
                </tr>
              </thead>
              <tbody>
                {topServicesData.map((svc, i) => (
                  <tr key={svc.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span>
                        <span className="font-medium">{svc.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">{svc.count}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">S/. {svc.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {topServicesData.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
            )}
          </div>
        </div>

        {/* Office occupancy */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold">{t("reports.office_occupancy")}</h3>
          </div>
          <div className="p-4 space-y-3">
            {officeData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
            ) : (
              officeData.map((office) => (
                <div key={office.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{office.name}</span>
                    <span className="text-muted-foreground">{office.total} citas ({office.rate}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(office.rate, 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
