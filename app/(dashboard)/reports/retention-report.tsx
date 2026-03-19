"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import {
  UserCheck,
  UserPlus,
  Clock,
  AlertTriangle,
  DollarSign,
  type LucideIcon,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import type {
  RetentionOverview,
  VisitFrequency,
  AtRiskData,
  PatientLTV,
  RetentionTrendMonth,
} from "@/types/retention";
import { exportToCSV } from "@/lib/export";
import { ExportMenu } from "./export-menu";
import {
  exportReportPDF,
  exportReportExcel,
  type ReportExportConfig,
} from "@/lib/report-export";

interface RetentionReportProps {
  dateFrom: string;
  dateTo: string;
}

// ─── Custom tooltip ──────────────────────────────
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-popover-foreground mb-1">
        {label}
      </p>
      {payload.map((entry, i) => (
        <p
          key={i}
          className="text-xs text-popover-foreground flex items-center gap-1.5"
        >
          <span
            className="h-2 w-2 rounded-sm shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

function PercentTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-popover-foreground mb-1">
        {label}
      </p>
      {payload.map((entry, i) => (
        <p
          key={i}
          className="text-xs text-popover-foreground flex items-center gap-1.5"
        >
          <span
            className="h-2 w-2 rounded-sm shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}: {entry.value}%
        </p>
      ))}
    </div>
  );
}

// ─── Card title with tooltip ──────────────────────
function CardTitle({
  icon: Icon,
  label,
  tooltip,
  iconClass,
}: {
  icon: LucideIcon;
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
          <span className="text-xs font-medium text-foreground whitespace-nowrap">
            {tooltip}
          </span>
        </div>
      </div>
    </div>
  );
}

export function RetentionReport({ dateFrom, dateTo }: RetentionReportProps) {
  const { t } = useLanguage();
  const chartsRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<RetentionOverview | null>(null);
  const [frequency, setFrequency] = useState<VisitFrequency | null>(null);
  const [atRisk, setAtRisk] = useState<AtRiskData | null>(null);
  const [ltv, setLtv] = useState<PatientLTV | null>(null);
  const [trend, setTrend] = useState<RetentionTrendMonth[]>([]);
  const [riskMonths, setRiskMonths] = useState(3);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const [overviewRes, freqRes, riskRes, ltvRes, trendRes] =
      await Promise.all([
        supabase.rpc("get_retention_overview", {
          p_date_from: dateFrom,
          p_date_to: dateTo,
        }),
        supabase.rpc("get_visit_frequency", {
          p_date_from: dateFrom,
          p_date_to: dateTo,
        }),
        supabase.rpc("get_at_risk_patients", {
          p_months_threshold: riskMonths,
        }),
        supabase.rpc("get_patient_ltv", { p_limit: 20 }),
        supabase.rpc("get_retention_trend", { p_months: 6 }),
      ]);

    if (overviewRes.data) setOverview(overviewRes.data as RetentionOverview);
    if (freqRes.data) setFrequency(freqRes.data as VisitFrequency);
    if (riskRes.data) setAtRisk(riskRes.data as AtRiskData);
    if (ltvRes.data) setLtv(ltvRes.data as PatientLTV);
    if (trendRes.data) setTrend(trendRes.data as RetentionTrendMonth[]);

    setLoading(false);
  }, [dateFrom, dateTo, riskMonths]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const trendChartData = useMemo(
    () =>
      trend.map((m) => ({
        name: m.month,
        [t("retention.new")]: m.new_patients,
        [t("retention.returning")]: m.returning_patients,
      })),
    [trend, t]
  );

  const retentionRateData = useMemo(
    () =>
      trend.map((m) => ({
        name: m.month,
        [t("retention.retention_rate")]: m.retention_rate,
      })),
    [trend, t]
  );

  // ── Export helpers ──

  const buildExportConfig = (): ReportExportConfig => {
    const tables: ReportExportConfig["tables"] = [];

    if (atRisk?.patients.length) {
      tables.push({
        title: "Pacientes en Riesgo",
        headers: ["Paciente", "Teléfono", "Email", "Última Visita", "Total Visitas", "Días Inactivo"],
        rows: atRisk.patients.map((p) => [
          `${p.first_name} ${p.last_name}`,
          p.phone ?? "",
          p.email ?? "",
          p.last_visit,
          p.total_visits,
          p.days_since_last_visit,
        ]),
        columnAligns: ["left", "left", "left", "center", "center", "center"],
      });
    }

    if (ltv?.top_patients.length) {
      tables.push({
        title: "Top Pacientes por LTV",
        headers: ["Paciente", "Total Visitas", "Ingresos Totales (S/.)", "Prom/Visita (S/.)", "Primera Visita", "Última Visita"],
        rows: ltv.top_patients.map((p) => [
          `${p.first_name} ${p.last_name}`,
          p.total_visits,
          p.total_revenue.toFixed(2),
          p.avg_per_visit.toFixed(2),
          p.first_visit,
          p.last_visit,
        ]),
        columnAligns: ["left", "center", "right", "right", "center", "center"],
      });
    }

    return {
      title: "Reporte de Retención",
      dateRange: { from: dateFrom, to: dateTo },
      kpis: [
        { label: "Pacientes Recurrentes", value: String(overview?.returning_patients ?? 0) },
        { label: "Pacientes Nuevos", value: String(overview?.new_patients ?? 0) },
        { label: "Tasa de Retención", value: `${overview?.retention_rate ?? 0}%` },
        { label: "Frecuencia Promedio", value: `${frequency?.avg_days_between_visits ?? 0} días` },
        { label: "LTV Promedio", value: `S/. ${ltv?.avg_ltv?.toFixed(2) ?? "0.00"}` },
      ],
      tables,
      chartRefs: chartsRef.current ? [chartsRef.current] : [],
      filename: `reporte_retencion_${dateFrom}_${dateTo}`,
    };
  };

  const exportAtRiskCSV = () => {
    if (!atRisk?.patients.length) return;
    exportToCSV(
      [
        t("retention.patient"),
        t("retention.phone"),
        "Email",
        t("retention.last_visit"),
        t("retention.total_visits"),
        t("retention.days_inactive"),
      ],
      atRisk.patients.map((p) => [
        `${p.first_name} ${p.last_name}`,
        p.phone,
        p.email,
        p.last_visit,
        p.total_visits,
        p.days_since_last_visit,
      ]),
      `pacientes_en_riesgo_${dateFrom}_${dateTo}.csv`
    );
  };

  const exportLtvCSV = () => {
    if (!ltv?.top_patients.length) return;
    exportToCSV(
      [
        t("retention.patient"),
        t("retention.total_visits"),
        t("retention.total_revenue"),
        t("retention.avg_per_visit"),
        t("retention.first_visit"),
        t("retention.last_visit"),
      ],
      ltv.top_patients.map((p) => [
        `${p.first_name} ${p.last_name}`,
        p.total_visits,
        p.total_revenue,
        p.avg_per_visit,
        p.first_visit,
        p.last_visit,
      ]),
      `ltv_pacientes_${dateFrom}_${dateTo}.csv`
    );
  };

  if (loading) {
    return null; // Parent shows loader
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle icon={UserCheck} label={t("retention.returning_patients")} tooltip={t("retention.tooltip_returning")} iconClass="text-emerald-500" />
          <p className="mt-2 text-2xl font-bold text-emerald-600">{overview?.returning_patients ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle icon={UserPlus} label={t("retention.new_patients")} tooltip={t("retention.tooltip_new")} iconClass="text-blue-500" />
          <p className="mt-2 text-2xl font-bold text-blue-600">{overview?.new_patients ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle icon={UserCheck} label={t("retention.retention_rate")} tooltip={t("retention.tooltip_rate")} />
          <p className="mt-2 text-2xl font-bold">{overview?.retention_rate ?? 0}%</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle icon={Clock} label={t("retention.avg_frequency")} tooltip={t("retention.tooltip_frequency")} />
          <p className="mt-2 text-2xl font-bold">
            {frequency?.avg_days_between_visits ?? 0}{" "}
            <span className="text-sm font-normal text-muted-foreground">{t("retention.days")}</span>
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <CardTitle icon={DollarSign} label={t("retention.avg_ltv")} tooltip={t("retention.tooltip_ltv")} iconClass="text-amber-500" />
          <p className="mt-2 text-2xl font-bold">S/. {ltv?.avg_ltv?.toFixed(2) ?? "0.00"}</p>
        </div>
      </div>

      {/* Charts */}
      <div ref={chartsRef} className="grid gap-6 lg:grid-cols-2">
        {/* Monthly new vs returning */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">{t("retention.monthly_breakdown")}</h3>
          {trendChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trendChartData} barCategoryGap="25%">
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={false} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={t("retention.returning")} fill="#22c55e" radius={999} animationDuration={800} animationEasing="ease-out" />
                <Bar dataKey={t("retention.new")} fill="#3b82f6" radius={999} animationDuration={800} animationEasing="ease-out" animationBegin={200} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
        </div>

        {/* Retention rate trend */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">{t("retention.rate_trend")}</h3>
          {retentionRateData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={retentionRateData}>
                <defs>
                  <linearGradient id="retentionGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip content={<PercentTooltip />} cursor={false} />
                <Area type="monotone" dataKey={t("retention.retention_rate")} stroke="#10b981" strokeWidth={2} fill="url(#retentionGradient)" animationDuration={1000} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
        </div>
      </div>

      {/* At-risk patients table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">{t("retention.at_risk_patients")}</h3>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
              {atRisk?.total_at_risk ?? 0}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={riskMonths}
              onChange={(e) => setRiskMonths(Number(e.target.value))}
              className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value={2}>2 {t("retention.months")}</option>
              <option value={3}>3 {t("retention.months")}</option>
              <option value={6}>6 {t("retention.months")}</option>
              <option value={12}>12 {t("retention.months")}</option>
            </select>
            <ExportMenu
              onExportPDF={() => exportReportPDF(buildExportConfig())}
              onExportExcel={() => exportReportExcel(buildExportConfig())}
              onExportCSV={exportAtRiskCSV}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{t("retention.patient")}</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{t("retention.contact")}</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t("retention.total_visits")}</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t("retention.last_visit")}</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t("retention.days_inactive")}</th>
              </tr>
            </thead>
            <tbody>
              {atRisk?.patients.map((p) => (
                <tr key={p.patient_id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium">{p.first_name} {p.last_name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{p.phone || p.email || "—"}</td>
                  <td className="px-4 py-2.5 text-center">{p.total_visits}</td>
                  <td className="px-4 py-2.5 text-center">{p.last_visit}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.days_since_last_visit > 180 ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600"
                    }`}>
                      {p.days_since_last_visit}d
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!atRisk?.patients || atRisk.patients.length === 0) && (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
        </div>
      </div>

      {/* Top patients by LTV */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold">{t("retention.top_patients_ltv")}</h3>
          </div>
          <ExportMenu
            onExportPDF={() => exportReportPDF(buildExportConfig())}
            onExportExcel={() => exportReportExcel(buildExportConfig())}
            onExportCSV={exportLtvCSV}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">#</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{t("retention.patient")}</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t("retention.total_visits")}</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">{t("retention.total_revenue")}</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">{t("retention.avg_per_visit")}</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t("retention.first_visit")}</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">{t("retention.last_visit")}</th>
              </tr>
            </thead>
            <tbody>
              {ltv?.top_patients.map((p, i) => (
                <tr key={p.patient_id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium">{p.first_name} {p.last_name}</td>
                  <td className="px-4 py-2.5 text-center">{p.total_visits}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">S/. {p.total_revenue.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">S/. {p.avg_per_visit.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-center">{p.first_visit}</td>
                  <td className="px-4 py-2.5 text-center">{p.last_visit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!ltv?.top_patients || ltv.top_patients.length === 0) && (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("common.no_results")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
