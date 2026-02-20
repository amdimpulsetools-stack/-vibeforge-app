"use client";

import { useMemo } from "react";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations } from "@/types/admin";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import {
  Clock,
  Building2,
  Activity,
  Star,
  Calendar,
  TrendingUp,
} from "lucide-react";

interface OperationalReportProps {
  appointments: AppointmentWithRelations[];
  dateFrom: string;
  dateTo: string;
}

export function OperationalReport({
  appointments,
  dateFrom,
  dateTo,
}: OperationalReportProps) {
  const { t } = useLanguage();

  const activeAppointments = useMemo(
    () => appointments.filter((a) => a.status !== "cancelled"),
    [appointments]
  );

  // Peak hours analysis
  const peakHoursData = useMemo(() => {
    const hourMap = new Map<string, number>();
    for (let h = 8; h <= 19; h++) {
      const label = `${h.toString().padStart(2, "0")}:00`;
      hourMap.set(label, 0);
    }

    activeAppointments.forEach((a) => {
      const hour = a.start_time.slice(0, 2);
      const label = `${hour}:00`;
      if (hourMap.has(label)) {
        hourMap.set(label, (hourMap.get(label) ?? 0) + 1);
      }
    });

    return Array.from(hourMap.entries()).map(([hour, count]) => ({
      hour,
      citas: count,
    }));
  }, [activeAppointments]);

  // Top services
  const topServicesData = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    activeAppointments.forEach((a) => {
      const name = a.services?.name ?? "Sin servicio";
      const entry = map.get(name) ?? { count: 0, revenue: 0 };
      entry.count++;
      entry.revenue += Number(a.services?.base_price ?? 0);
      map.set(name, entry);
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [activeAppointments]);

  // Office occupancy
  const officeData = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    appointments.forEach((a) => {
      const name = a.offices?.name ?? "Sin consultorio";
      if (!map.has(name)) map.set(name, { total: 0, completed: 0 });
      const entry = map.get(name)!;
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

  // Daily trend
  const dailyTrend = useMemo(() => {
    const map = new Map<string, { scheduled: number; completed: number; cancelled: number }>();
    appointments.forEach((a) => {
      const date = a.appointment_date;
      if (!map.has(date)) map.set(date, { scheduled: 0, completed: 0, cancelled: 0 });
      const entry = map.get(date)!;
      if (a.status === "completed") entry.completed++;
      else if (a.status === "cancelled") entry.cancelled++;
      else entry.scheduled++;
    });
    return Array.from(map.entries())
      .map(([date, data]) => ({
        date: date.slice(5), // MM-DD
        ...data,
        total: data.scheduled + data.completed + data.cancelled,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [appointments]);

  // KPI calculations
  const avgDailyAppointments = dailyTrend.length > 0
    ? (activeAppointments.length / dailyTrend.length).toFixed(1)
    : "0";
  const busiestHour = peakHoursData.reduce(
    (max, h) => (h.citas > max.citas ? h : max),
    { hour: "--", citas: 0 }
  );
  const topService = topServicesData[0];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-4 w-4" />
            {t("reports.avg_daily")}
          </div>
          <p className="mt-2 text-2xl font-bold">{avgDailyAppointments}</p>
          <p className="text-[10px] text-muted-foreground">{t("reports.appointments_per_day")}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-4 w-4" />
            {t("reports.peak_hour")}
          </div>
          <p className="mt-2 text-2xl font-bold">{busiestHour.hour}</p>
          <p className="text-[10px] text-muted-foreground">{busiestHour.citas} {t("reports.appointments")}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Star className="h-4 w-4" />
            {t("reports.top_service")}
          </div>
          <p className="mt-2 text-lg font-bold truncate">{topService?.name ?? "--"}</p>
          <p className="text-[10px] text-muted-foreground">{topService?.count ?? 0} citas</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-4 w-4" />
            {t("reports.offices_used")}
          </div>
          <p className="mt-2 text-2xl font-bold">{officeData.length}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily trend area chart */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-4">{t("reports.daily_trend")}</h3>
          {dailyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={dailyTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name="Atendidos"
                  stroke="#22c55e"
                  fill="#22c55e"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="scheduled"
                  name="Programados"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="cancelled"
                  name="Cancelados"
                  stroke="#ef4444"
                  fill="#ef4444"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
        </div>

        {/* Peak hours */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-4">{t("reports.peak_hours")}</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={peakHoursData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="citas" name="Citas" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row: Top services + Office occupancy */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top services table */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold">{t("reports.top_services")}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                    {t("reports.service")}
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                    {t("reports.count")}
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                    {t("reports.revenue")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {topServicesData.map((svc, i) => (
                  <tr key={svc.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                          {i + 1}
                        </span>
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
}
