"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import type {
  AppointmentWithRelations,
  PatientPayment,
  Patient,
} from "@/types/admin";
import {
  BarChart3,
  Megaphone,
  TrendingUp,
  CalendarRange,
  Loader2,
  HeartPulse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FinancialReport } from "./financial-report";
import { MarketingReport } from "./marketing-report";
import { OperationalReport } from "./operational-report";
import { RetentionReport } from "./retention-report";
import { AiReportProvider, AiSummaryButton, AiSummaryPanel } from "./ai-summary-panel";

type ReportTab = "financial" | "marketing" | "operational" | "retention";

const DATE_PRESETS = [
  { key: "today", days: 0 },
  { key: "7d", days: 7 },
  { key: "30d", days: 30 },
  { key: "90d", days: 90 },
  { key: "this_month", days: -1 },
] as const;

export default function ReportsPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<ReportTab>("financial");
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  // Data
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [payments, setPayments] = useState<PatientPayment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const [apptRes, payRes, patRes] = await Promise.all([
      supabase
        .from("appointments")
        .select("*, doctors(id, full_name, color), offices(id, name), services(id, name, duration_minutes, base_price)")
        .gte("appointment_date", dateFrom)
        .lte("appointment_date", dateTo)
        .order("appointment_date"),
      supabase
        .from("patient_payments")
        .select("id, amount, payment_date, payment_method, appointment_id, patient_id, organization_id")
        .gte("payment_date", dateFrom)
        .lte("payment_date", dateTo)
        .order("payment_date"),
      supabase
        .from("patients")
        .select("id, first_name, last_name, origin, departamento, distrito, birth_date, created_at")
        .gte("created_at", dateFrom)
        .lte("created_at", dateTo + "T23:59:59")
        .order("created_at"),
    ]);

    setAppointments((apptRes.data as AppointmentWithRelations[]) ?? []);
    setPayments((payRes.data as PatientPayment[]) ?? []);
    setPatients((patRes.data as Patient[]) ?? []);
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const applyPreset = (preset: typeof DATE_PRESETS[number]) => {
    const today = new Date();
    if (preset.key === "this_month") {
      setDateFrom(format(startOfMonth(today), "yyyy-MM-dd"));
      setDateTo(format(endOfMonth(today), "yyyy-MM-dd"));
    } else if (preset.days === 0) {
      const todayStr = format(today, "yyyy-MM-dd");
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else {
      setDateFrom(format(subDays(today, preset.days), "yyyy-MM-dd"));
      setDateTo(format(today, "yyyy-MM-dd"));
    }
  };

  const tabs: { key: ReportTab; label: string; icon: typeof BarChart3 }[] = [
    { key: "financial", label: t("reports.tab_financial"), icon: BarChart3 },
    { key: "marketing", label: t("reports.tab_marketing"), icon: Megaphone },
    { key: "operational", label: t("reports.tab_operational"), icon: TrendingUp },
    { key: "retention", label: t("reports.tab_retention"), icon: HeartPulse },
  ];

  return (
    <AiReportProvider reportType={activeTab} dateFrom={dateFrom} dateTo={dateTo}>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        {/* Header */}
        <div className="border-b border-border bg-card px-6 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold">{t("reports.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("reports.subtitle")}</p>
            </div>

            {/* Date Range + AI Button */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-muted-foreground" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
                <span className="text-xs text-muted-foreground">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {DATE_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      onClick={() => applyPreset(preset)}
                      className="rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      {t(`reports.preset_${preset.key}`)}
                    </button>
                  ))}
                </div>
                <div className="hidden sm:block h-5 w-px bg-border" />
                <AiSummaryButton />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-1 overflow-x-auto -mx-6 px-6 pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0",
                  activeTab === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* AI Summary Panel (appears when active) */}
          <AiSummaryPanel />

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeTab === "financial" ? (
            <FinancialReport
              appointments={appointments}
              payments={payments}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          ) : activeTab === "marketing" ? (
            <MarketingReport
              appointments={appointments}
              patients={patients}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          ) : activeTab === "operational" ? (
            <OperationalReport
              appointments={appointments}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          ) : (
            <RetentionReport
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          )}
        </div>
      </div>
    </AiReportProvider>
  );
}
