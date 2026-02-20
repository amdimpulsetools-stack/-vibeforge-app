"use client";

import { useMemo } from "react";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, PatientPayment } from "@/types/admin";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Download,
  DollarSign,
  Users,
  TrendingUp,
  XCircle,
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

export function FinancialReport({
  appointments,
  payments,
  dateFrom,
  dateTo,
}: FinancialReportProps) {
  const { t } = useLanguage();

  // Doctor productivity breakdown
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

    // Calculate avg
    map.forEach((doc) => {
      const activeAppts = doc.attended + doc.confirmed;
      doc.avgPerAppointment = activeAppts > 0 ? doc.revenue / activeAppts : 0;
    });

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [appointments]);

  // Summary KPIs
  const totalRevenue = doctorData.reduce((sum, d) => sum + d.revenue, 0);
  const totalAttended = doctorData.reduce((sum, d) => sum + d.attended, 0);
  const totalCancelled = doctorData.reduce((sum, d) => sum + d.cancelled, 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  // Chart data for bar chart
  const chartData = doctorData.map((d) => ({
    name: d.name.split(" ").slice(0, 2).join(" "),
    Atendidos: d.attended,
    Confirmados: d.confirmed,
    Cancelados: d.cancelled,
    Programados: d.scheduled,
  }));

  // Revenue chart data
  const revenueChartData = doctorData.map((d) => ({
    name: d.name.split(" ").slice(0, 2).join(" "),
    Facturado: Number(d.revenue.toFixed(2)),
  }));

  // CSV export
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

    // Add totals row
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            {t("reports.total_billed")}
          </div>
          <p className="mt-2 text-2xl font-bold">S/. {totalRevenue.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            {t("reports.total_collected")}
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600">S/. {totalPaid.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-4 w-4" />
            {t("reports.total_attended")}
          </div>
          <p className="mt-2 text-2xl font-bold">{totalAttended}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <XCircle className="h-4 w-4 text-red-500" />
            {t("reports.total_cancelled")}
          </div>
          <p className="mt-2 text-2xl font-bold text-red-600">{totalCancelled}</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Appointments by doctor */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-4">{t("reports.appointments_by_doctor")}</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
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
                <Bar dataKey="Atendidos" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Confirmados" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Cancelados" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
        </div>

        {/* Revenue by doctor */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-4">{t("reports.revenue_by_doctor")}</h3>
          {revenueChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revenueChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => [`S/. ${Number(value ?? 0).toFixed(2)}`, "Facturado"]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="Facturado" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
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
              {/* Totals row */}
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
