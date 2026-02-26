"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, PatientPayment } from "@/types/admin";
import {
  Download,
  DollarSign,
  Users,
  XCircle,
  UserX,
} from "lucide-react";

interface FinancialReportProps {
  appointments: AppointmentWithRelations[];
  payments: PatientPayment[];
  dateFrom: string;
  dateTo: string;
}

interface DoctorProductivity {
  name: string;
  color: string;
  totalAppointments: number;
  attended: number;
  cancelled: number;
  confirmed: number;
  scheduled: number;
  revenue: number;
  avgPerAppointment: number;
}

// ─── Tooltip state ────────────────────────────────────────────
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

// ─── Simple SVG bar chart with hover tooltip ──────────────────
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

  const groupW = chartW / data.length;
  const barW = Math.max(4, (groupW / (keys.length + 1)) * 0.85);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height }}
    >
      {/* Y gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = paddingTop + chartH * (1 - frac);
        return (
          <g key={frac}>
            <line
              x1={paddingLeft}
              x2={paddingLeft + chartW}
              y1={y}
              y2={y}
              stroke="hsl(var(--border))"
              strokeWidth={0.5}
              strokeDasharray="3 3"
            />
            <text
              x={paddingLeft - 4}
              y={y + 4}
              textAnchor="end"
              fontSize={9}
              fill="hsl(var(--muted-foreground))"
            >
              {Math.round(maxVal * frac)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
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
                  style={{ transition: "opacity 0.15s" }}
                  onMouseEnter={(e) => onHover?.(e, [`${String(d.name)}: ${k} = ${val}`])}
                  onMouseMove={(e) => onHover?.(e, [`${String(d.name)}: ${k} = ${val}`])}
                  onMouseLeave={onLeave}
                />
              );
            })}
            <text
              x={groupX}
              y={paddingTop + chartH + 14}
              textAnchor="middle"
              fontSize={9}
              fill="hsl(var(--muted-foreground))"
            >
              {String(d.name).split(" ").slice(0, 2).join(" ")}
            </text>
          </g>
        );
      })}

      {/* X axis */}
      <line
        x1={paddingLeft}
        x2={paddingLeft + chartW}
        y1={paddingTop + chartH}
        y2={paddingTop + chartH}
        stroke="hsl(var(--border))"
        strokeWidth={1}
      />
    </svg>
  );
}

// Legend component
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

// ─── Card title with tooltip ──────────────────────────────────
function CardTitle({
  icon: Icon,
  label,
  tooltip,
  iconClass,
}: {
  icon: typeof DollarSign;
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

export function FinancialReport({
  appointments,
  payments,
  dateFrom,
  dateTo,
}: FinancialReportProps) {
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

  const doctorData = useMemo(() => {
    const map = new Map<string, DoctorProductivity>();

    appointments.forEach((appt) => {
      const doctorName = appt.doctors?.full_name ?? "Sin doctor";
      const doctorColor = appt.doctors?.color ?? "#9ca3af";

      if (!map.has(doctorName)) {
        map.set(doctorName, {
          name: doctorName,
          color: doctorColor,
          totalAppointments: 0,
          attended: 0,
          cancelled: 0,
          confirmed: 0,
          scheduled: 0,
          revenue: 0,
          avgPerAppointment: 0,
        });
      }

      const doc = map.get(doctorName)!;
      doc.totalAppointments++;

      if (appt.status === "completed") {
        doc.attended++;
        doc.revenue += Number(appt.services?.base_price ?? 0);
      } else if (appt.status === "cancelled") {
        doc.cancelled++;
      } else if (appt.status === "confirmed") {
        doc.confirmed++;
        doc.revenue += Number(appt.services?.base_price ?? 0);
      } else {
        doc.scheduled++;
      }
    });

    map.forEach((doc) => {
      const activeAppts = doc.attended + doc.confirmed;
      doc.avgPerAppointment = activeAppts > 0 ? doc.revenue / activeAppts : 0;
    });

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [appointments]);

  const totalRevenue = doctorData.reduce((sum, d) => sum + d.revenue, 0);
  const totalAttended = doctorData.reduce((sum, d) => sum + d.attended, 0);
  const totalCancelled = doctorData.reduce((sum, d) => sum + d.cancelled, 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  // No-shows: past appointments in range that are still scheduled/confirmed
  const today = new Date().toISOString().slice(0, 10);
  const totalNoShows = useMemo(
    () =>
      appointments.filter(
        (a) =>
          a.appointment_date < today &&
          (a.status === "scheduled" || a.status === "confirmed")
      ).length,
    [appointments, today]
  );

  const chartData = doctorData.map((d) => ({
    name: d.name,
    Atendidos: d.attended,
    Confirmados: d.confirmed,
    Cancelados: d.cancelled,
  }));

  const revenueChartData = doctorData.map((d) => ({
    name: d.name,
    Facturado: Number(d.revenue.toFixed(2)),
  }));

  const exportCSV = () => {
    const headers = [
      "Doctor",
      "Total Citas",
      "Atendidos",
      "Confirmados",
      "Programados",
      "Cancelados",
      "Facturado (S/.)",
      "Promedio/Cita (S/.)",
    ];
    const rows = doctorData.map((d) => [
      d.name,
      d.totalAppointments,
      d.attended,
      d.confirmed,
      d.scheduled,
      d.cancelled,
      d.revenue.toFixed(2),
      d.avgPerAppointment.toFixed(2),
    ]);

    rows.push([
      "TOTAL",
      appointments.length,
      totalAttended,
      doctorData.reduce((s, d) => s + d.confirmed, 0),
      doctorData.reduce((s, d) => s + d.scheduled, 0),
      totalCancelled,
      totalRevenue.toFixed(2),
      "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte_financiero_${dateFrom}_${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle
            icon={DollarSign}
            label={t("reports.total_billed")}
            tooltip={t("reports.tooltip_total_billed")}
          />
          <p className="mt-2 text-2xl font-bold">S/. {totalRevenue.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle
            icon={DollarSign}
            label={t("reports.total_collected")}
            tooltip={t("reports.tooltip_total_collected")}
            iconClass="text-emerald-500"
          />
          <p className="mt-2 text-2xl font-bold text-emerald-600">S/. {totalPaid.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle
            icon={Users}
            label={t("reports.total_attended")}
            tooltip={t("reports.tooltip_total_attended")}
          />
          <p className="mt-2 text-2xl font-bold">{totalAttended}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle
            icon={XCircle}
            label={t("reports.total_cancelled")}
            tooltip={t("reports.tooltip_total_cancelled")}
            iconClass="text-red-500"
          />
          <p className="mt-2 text-2xl font-bold text-red-600">{totalCancelled}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle
            icon={UserX}
            label={t("reports.total_no_shows")}
            tooltip={t("reports.tooltip_no_shows")}
            iconClass="text-amber-500"
          />
          <p className="mt-2 text-2xl font-bold text-amber-600">{totalNoShows}</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Appointments by doctor */}
        <div className="relative rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">{t("reports.appointments_by_doctor")}</h3>
          {chartData.length > 0 ? (
            <>
              <BarChartSVG
                data={chartData}
                keys={["Atendidos", "Confirmados", "Cancelados"]}
                colors={["#22c55e", "#3b82f6", "#ef4444"]}
                onHover={handleHover}
                onLeave={handleLeave}
              />
              <ChartLegend
                items={[
                  { label: "Atendidos", color: "#22c55e" },
                  { label: "Confirmados", color: "#3b82f6" },
                  { label: "Cancelados", color: "#ef4444" },
                ]}
              />
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
          <ChartTooltip tooltip={tooltip} />
        </div>

        {/* Revenue by doctor */}
        <div className="relative rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">{t("reports.revenue_by_doctor")}</h3>
          {revenueChartData.length > 0 ? (
            <>
              <BarChartSVG
                data={revenueChartData}
                keys={["Facturado"]}
                colors={["#10b981"]}
                onHover={handleHover}
                onLeave={handleLeave}
              />
              <ChartLegend items={[{ label: "Facturado (S/.)", color: "#10b981" }]} />
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
          <ChartTooltip tooltip={tooltip} />
        </div>
      </div>

      {/* Doctor Productivity Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">{t("reports.doctor_productivity")}</h3>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            {t("reports.export_csv")}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                  {t("reports.doctor")}
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                  {t("reports.total")}
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                  {t("reports.attended")}
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                  {t("reports.confirmed")}
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">
                  {t("reports.cancelled")}
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                  {t("reports.billed")}
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                  {t("reports.avg_per_appointment")}
                </th>
              </tr>
            </thead>
            <tbody>
              {doctorData.map((doc) => (
                <tr key={doc.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: doc.color }}
                      />
                      <span className="font-medium">{doc.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">{doc.totalAppointments}</td>
                  <td className="px-4 py-2.5 text-center text-emerald-600 font-medium">{doc.attended}</td>
                  <td className="px-4 py-2.5 text-center text-blue-600">{doc.confirmed}</td>
                  <td className="px-4 py-2.5 text-center text-red-600">{doc.cancelled}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">S/. {doc.revenue.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    S/. {doc.avgPerAppointment.toFixed(2)}
                  </td>
                </tr>
              ))}
              {doctorData.length > 0 && (
                <tr className="bg-muted/50 font-bold">
                  <td className="px-4 py-2.5">TOTAL</td>
                  <td className="px-4 py-2.5 text-center">{appointments.length}</td>
                  <td className="px-4 py-2.5 text-center text-emerald-600">{totalAttended}</td>
                  <td className="px-4 py-2.5 text-center text-blue-600">
                    {doctorData.reduce((s, d) => s + d.confirmed, 0)}
                  </td>
                  <td className="px-4 py-2.5 text-center text-red-600">{totalCancelled}</td>
                  <td className="px-4 py-2.5 text-right">S/. {totalRevenue.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right" />
                </tr>
              )}
            </tbody>
          </table>
          {doctorData.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
