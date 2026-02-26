"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations } from "@/types/admin";
import {
  Clock,
  Building2,
  Star,
  Calendar,
} from "lucide-react";

interface OperationalReportProps {
  appointments: AppointmentWithRelations[];
  dateFrom: string;
  dateTo: string;
}

// ─── Tooltip ──────────────────────────────────────────────────
interface TooltipState {
  x: number;
  y: number;
  lines: string[];
}

function ChartTooltip({ tooltip }: { tooltip: TooltipState | null }) {
  if (!tooltip) return null;
  return (
    <div
      className="pointer-events-none absolute z-50 rounded-lg border border-border bg-popover px-3 py-2 shadow-lg"
      style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -110%)" }}
    >
      {tooltip.lines.map((line, i) => (
        <p key={i} className="whitespace-nowrap text-xs text-popover-foreground">{line}</p>
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
    <div className="flex items-center gap-2 text-xs text-muted-foreground cursor-help" title={tooltip}>
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

// Native SVG area chart with hover
function AreaChartSVG({
  data,
  keys,
  colors,
  height = 240,
  onHover,
  onLeave,
}: {
  data: Record<string, string | number>[];
  keys: string[];
  colors: string[];
  height?: number;
  onHover?: (e: React.MouseEvent, lines: string[]) => void;
  onLeave?: () => void;
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

  const stepX = data.length > 1 ? chartW / (data.length - 1) : chartW;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {/* Y gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = paddingTop + chartH * (1 - frac);
        return (
          <g key={frac}>
            <line x1={paddingLeft} x2={paddingLeft + chartW} y1={y} y2={y} stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="3 3" />
            <text x={paddingLeft - 4} y={y + 4} textAnchor="end" fontSize={9} fill="hsl(var(--muted-foreground))">{Math.round(maxVal * frac)}</text>
          </g>
        );
      })}

      {/* Areas + lines */}
      {keys.map((k, ki) => {
        const points = data.map((d, i) => {
          const x = paddingLeft + (data.length > 1 ? i * stepX : chartW / 2);
          const val = Number(d[k] ?? 0);
          const y = paddingTop + chartH - (val / maxVal) * chartH;
          return { x, y, val };
        });

        const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
        const areaPath = `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartH} L ${points[0].x} ${paddingTop + chartH} Z`;

        return (
          <g key={k}>
            <path d={areaPath} fill={colors[ki]} fillOpacity={0.15} />
            <path d={linePath} fill="none" stroke={colors[ki]} strokeWidth={2} />
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={3}
                fill={colors[ki]}
                className="cursor-pointer"
                onMouseEnter={(e) => onHover?.(e, [`${String(data[i].date ?? data[i].name ?? "")}: ${k} = ${p.val}`])}
                onMouseMove={(e) => onHover?.(e, [`${String(data[i].date ?? data[i].name ?? "")}: ${k} = ${p.val}`])}
                onMouseLeave={onLeave}
              />
            ))}
          </g>
        );
      })}

      {/* X labels */}
      {data.map((d, i) => {
        const x = paddingLeft + (data.length > 1 ? i * stepX : chartW / 2);
        const showLabel = data.length <= 15 || i % Math.ceil(data.length / 12) === 0;
        if (!showLabel) return null;
        return (
          <text key={i} x={x} y={paddingTop + chartH + 14} textAnchor="middle" fontSize={8} fill="hsl(var(--muted-foreground))">
            {String(d.date ?? d.name ?? "")}
          </text>
        );
      })}

      {/* X axis */}
      <line x1={paddingLeft} x2={paddingLeft + chartW} y1={paddingTop + chartH} y2={paddingTop + chartH} stroke="hsl(var(--border))" strokeWidth={1} />
    </svg>
  );
}

// Native SVG bar chart with hover
function BarChartSVG({
  data,
  keys,
  colors,
  height = 240,
  onHover,
  onLeave,
}: {
  data: Record<string, string | number>[];
  keys: string[];
  colors: string[];
  height?: number;
  onHover?: (e: React.MouseEvent, lines: string[]) => void;
  onLeave?: () => void;
}) {
  const paddingLeft = 50;
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
              return (
                <rect
                  key={k}
                  x={bx}
                  y={by}
                  width={barW}
                  height={bh}
                  fill={colors[ki]}
                  rx={2}
                  className="cursor-pointer"
                  onMouseEnter={(e) => onHover?.(e, [`${String(d.hour ?? d.name ?? "")}: ${k} = ${val}`])}
                  onMouseMove={(e) => onHover?.(e, [`${String(d.hour ?? d.name ?? "")}: ${k} = ${val}`])}
                  onMouseLeave={onLeave}
                />
              );
            })}
            <text x={groupX} y={paddingTop + chartH + 14} textAnchor="middle" fontSize={8} fill="hsl(var(--muted-foreground))">
              {String(d.hour ?? d.name ?? "")}
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

export function OperationalReport({
  appointments,
  dateFrom,
  dateTo,
}: OperationalReportProps) {
  const { t } = useLanguage();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const handleHover = (e: React.MouseEvent, lines: string[]) => {
    const rect = (e.currentTarget as SVGElement).closest(".relative")?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      lines,
    });
  };
  const handleLeave = () => setTooltip(null);

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

  // Top services (revenue only from completed appointments)
  const topServicesData = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    activeAppointments.forEach((a) => {
      const name = a.services?.name ?? "Sin servicio";
      const entry = map.get(name) ?? { count: 0, revenue: 0 };
      entry.count++;
      if (a.status === "completed") {
        entry.revenue += Number(a.services?.base_price ?? 0);
      }
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
          <CardTitle
            icon={Calendar}
            label={t("reports.avg_daily")}
            tooltip={t("reports.tooltip_avg_daily")}
          />
          <p className="mt-2 text-2xl font-bold">{avgDailyAppointments}</p>
          <p className="text-[10px] text-muted-foreground">{t("reports.appointments_per_day")}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle
            icon={Clock}
            label={t("reports.peak_hour")}
            tooltip={t("reports.tooltip_peak_hour")}
          />
          <p className="mt-2 text-2xl font-bold">{busiestHour.hour}</p>
          <p className="text-[10px] text-muted-foreground">{busiestHour.citas} {t("reports.appointments")}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle
            icon={Star}
            label={t("reports.top_service")}
            tooltip={t("reports.tooltip_top_service")}
          />
          <p className="mt-2 text-lg font-bold truncate">{topService?.name ?? "--"}</p>
          <p className="text-[10px] text-muted-foreground">{topService?.count ?? 0} citas</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle
            icon={Building2}
            label={t("reports.offices_used")}
            tooltip={t("reports.tooltip_offices_used")}
          />
          <p className="mt-2 text-2xl font-bold">{officeData.length}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily trend area chart */}
        <div className="relative rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">{t("reports.daily_trend")}</h3>
          {dailyTrend.length > 0 ? (
            <>
              <AreaChartSVG
                data={dailyTrend}
                keys={["completed", "scheduled", "cancelled"]}
                colors={["#22c55e", "#3b82f6", "#ef4444"]}
                onHover={handleHover}
                onLeave={handleLeave}
              />
              <ChartLegend
                items={[
                  { label: "Atendidos", color: "#22c55e" },
                  { label: "Programados", color: "#3b82f6" },
                  { label: "Cancelados", color: "#ef4444" },
                ]}
              />
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
          <ChartTooltip tooltip={tooltip} />
        </div>

        {/* Peak hours */}
        <div className="relative rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">{t("reports.peak_hours")}</h3>
          <BarChartSVG
            data={peakHoursData}
            keys={["citas"]}
            colors={["#8b5cf6"]}
            onHover={handleHover}
            onLeave={handleLeave}
          />
          <ChartLegend items={[{ label: "Citas", color: "#8b5cf6" }]} />
          <ChartTooltip tooltip={tooltip} />
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
