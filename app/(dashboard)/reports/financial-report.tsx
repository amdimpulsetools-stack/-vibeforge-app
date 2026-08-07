"use client";

import { useMemo, forwardRef, useImperativeHandle } from "react";
import { useLanguage } from "@/components/language-provider";
import { useBrandAccent } from "@/hooks/use-brand-accent";
import type { ReportsOverview } from "@/types/reports";
import {
  DollarSign,
  Users,
  XCircle,
  UserX,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ReportExportConfig } from "@/lib/report-export-types";

export interface ReportExportHandle {
  getExportConfig: () => ReportExportConfig;
}

interface FinancialReportProps {
  // Agregados server-side (RPC get_reports_overview, mig 198). Antes este
  // componente recibía las filas crudas de citas/pagos y agregaba en JS —
  // con >1000 filas en el rango, PostgREST truncaba y los KPIs salían mal.
  overview: ReportsOverview | null;
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

function RevenueTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-popover-foreground mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs text-popover-foreground flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          {entry.name}: S/. {entry.value.toFixed(2)}
        </p>
      ))}
    </div>
  );
}

function CardTitle({ icon: Icon, label, tooltip, iconClass }: { icon: typeof DollarSign; label: string; tooltip: string; iconClass?: string }) {
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

export const FinancialReport = forwardRef<ReportExportHandle, FinancialReportProps>(
  function FinancialReport({ overview, dateFrom, dateTo }, ref) {
    const { t } = useLanguage();
    // Color de marca del chart (sigue el tema de acento de la org).
    const accent = useBrandAccent();

    // El RPC ya entrega la productividad agrupada por doctor y ordenada por
    // revenue desc (mismos buckets de status que el reduce anterior); aquí
    // solo se calcula el promedio por cita, con la misma fórmula de antes.
    const doctorData = useMemo<DoctorProductivity[]>(() => {
      return (overview?.doctors ?? []).map((d) => {
        const revenue = Number(d.revenue);
        const activeAppts = d.attended + d.confirmed;
        return {
          name: d.name,
          color: d.color,
          totalAppointments: d.total,
          attended: d.attended,
          cancelled: d.cancelled,
          confirmed: d.confirmed,
          scheduled: d.scheduled,
          revenue,
          avgPerAppointment: activeAppts > 0 ? revenue / activeAppts : 0,
        };
      });
    }, [overview]);

    const totalRevenue = doctorData.reduce((sum, d) => sum + d.revenue, 0);
    const totalAttended = doctorData.reduce((sum, d) => sum + d.attended, 0);
    const totalCancelled = doctorData.reduce((sum, d) => sum + d.cancelled, 0);
    const totalPaid = Number(overview?.totals.payments_amount ?? 0);
    const totalPending = totalRevenue - totalPaid;
    const totalAppointments = overview?.totals.appointments ?? 0;
    const totalNoShows = overview?.totals.no_shows ?? 0;

    // Expose export config via ref
    useImperativeHandle(ref, () => ({
      getExportConfig: () => ({
        title: "Reporte Financiero",
        dateRange: { from: dateFrom, to: dateTo },
        kpis: [
          { label: "Total Facturado", value: `S/. ${totalRevenue.toFixed(2)}` },
          { label: "Total Cobrado", value: `S/. ${totalPaid.toFixed(2)}` },
          { label: "Pendiente", value: `S/. ${totalPending.toFixed(2)}` },
          { label: "Atendidos", value: String(totalAttended) },
          { label: "Cancelados", value: String(totalCancelled) },
          { label: "No Shows", value: String(totalNoShows) },
        ],
        tables: [{
          title: "Productividad por Doctor",
          headers: ["Doctor", "Total", "Atendidos", "Confirmados", "Programados", "Cancelados", "Facturado (S/.)", "Prom/Cita (S/.)"],
          rows: [
            ...doctorData.map((d) => [d.name, d.totalAppointments, d.attended, d.confirmed, d.scheduled, d.cancelled, d.revenue.toFixed(2), d.avgPerAppointment.toFixed(2)]),
            ["TOTAL", totalAppointments, totalAttended, doctorData.reduce((s, d) => s + d.confirmed, 0), doctorData.reduce((s, d) => s + d.scheduled, 0), totalCancelled, totalRevenue.toFixed(2), ""],
          ],
        }],
        filename: `reporte_financiero_${dateFrom}_${dateTo}`,
      }),
    }), [doctorData, totalAppointments, totalRevenue, totalPaid, totalPending, totalAttended, totalCancelled, totalNoShows, dateFrom, dateTo]);

    const chartData = doctorData.map((d) => ({ name: d.name, Atendidos: d.attended, Confirmados: d.confirmed, Cancelados: d.cancelled }));
    const revenueChartData = doctorData.map((d) => ({ name: d.name, Facturado: Number(d.revenue.toFixed(2)) }));

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6 max-md:[&>*]:min-w-0 max-md:[&_p]:break-words">
          <div className="rounded-xl border border-border bg-card p-4">
            <CardTitle icon={DollarSign} label={t("reports.total_billed")} tooltip={t("reports.tooltip_total_billed")} />
            <p className="mt-2 text-2xl font-bold">S/. {totalRevenue.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <CardTitle icon={DollarSign} label={t("reports.total_collected")} tooltip={t("reports.tooltip_total_collected")} iconClass="text-success-500" />
            <p className="mt-2 text-2xl font-bold text-success-600">S/. {totalPaid.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <CardTitle icon={DollarSign} label={t("reports.total_pending")} tooltip={t("reports.tooltip_total_pending")} iconClass="text-amber-500" />
            <p className={`mt-2 text-2xl font-bold ${totalPending > 0 ? "text-amber-600" : "text-success-600"}`}>S/. {totalPending.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <CardTitle icon={Users} label={t("reports.total_attended")} tooltip={t("reports.tooltip_total_attended")} />
            <p className="mt-2 text-2xl font-bold">{totalAttended}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <CardTitle icon={XCircle} label={t("reports.total_cancelled")} tooltip={t("reports.tooltip_total_cancelled")} iconClass="text-red-500" />
            <p className="mt-2 text-2xl font-bold text-red-600">{totalCancelled}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <CardTitle icon={UserX} label={t("reports.total_no_shows")} tooltip={t("reports.tooltip_no_shows")} iconClass="text-amber-500" />
            <p className="mt-2 text-2xl font-bold text-amber-600">{totalNoShows}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 max-md:[&>*]:min-w-0 max-md:[&_p]:break-words">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">{t("reports.appointments_by_doctor")}</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} barCategoryGap="25%">
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" tickFormatter={(v: string) => v.split(" ").slice(0, 2).join(" ")} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} cursor={false} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Atendidos" fill="#22c55e" radius={999} maxBarSize={48} animationDuration={800} animationEasing="ease-out" />
                  <Bar dataKey="Confirmados" fill="#3b82f6" radius={999} maxBarSize={48} animationDuration={800} animationEasing="ease-out" animationBegin={200} />
                  <Bar dataKey="Cancelados" fill="#ef4444" radius={999} maxBarSize={48} animationDuration={800} animationEasing="ease-out" animationBegin={400} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">{t("reports.revenue_by_doctor")}</h3>
            {revenueChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={revenueChartData} barCategoryGap="30%">
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" tickFormatter={(v: string) => v.split(" ").slice(0, 2).join(" ")} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<RevenueTooltip />} cursor={false} />
                  <Bar dataKey="Facturado" fill={accent} radius={999} maxBarSize={56} background={{ fill: "rgba(128,128,128,0.1)", radius: 999 }} animationDuration={1000} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold">{t("reports.doctor_productivity")}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{t("reports.doctor")}</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t("reports.total")}</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t("reports.attended")}</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t("reports.confirmed")}</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t("reports.cancelled")}</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">{t("reports.billed")}</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">{t("reports.avg_per_appointment")}</th>
                </tr>
              </thead>
              <tbody>
                {doctorData.map((doc) => (
                  <tr key={doc.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: doc.color }} /><span className="font-medium">{doc.name}</span></div></td>
                    <td className="px-4 py-2.5 text-center">{doc.totalAppointments}</td>
                    <td className="px-4 py-2.5 text-center text-success-600 font-medium">{doc.attended}</td>
                    <td className="px-4 py-2.5 text-center text-blue-600">{doc.confirmed}</td>
                    <td className="px-4 py-2.5 text-center text-red-600">{doc.cancelled}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">S/. {doc.revenue.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">S/. {doc.avgPerAppointment.toFixed(2)}</td>
                  </tr>
                ))}
                {doctorData.length > 0 && (
                  <tr className="bg-muted/50 font-bold">
                    <td className="px-4 py-2.5">TOTAL</td>
                    <td className="px-4 py-2.5 text-center">{totalAppointments}</td>
                    <td className="px-4 py-2.5 text-center text-success-600">{totalAttended}</td>
                    <td className="px-4 py-2.5 text-center text-blue-600">{doctorData.reduce((s, d) => s + d.confirmed, 0)}</td>
                    <td className="px-4 py-2.5 text-center text-red-600">{totalCancelled}</td>
                    <td className="px-4 py-2.5 text-right">S/. {totalRevenue.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right" />
                  </tr>
                )}
              </tbody>
            </table>
            {doctorData.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>}
          </div>
        </div>
      </div>
    );
  }
);
