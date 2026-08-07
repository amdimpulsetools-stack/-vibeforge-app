"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
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
  Baby,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiReportProvider, AiSummaryButton, AiSummaryPanel } from "./ai-summary-panel";
import { useOrgAddons } from "@/hooks/use-org-addons";
import { FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY } from "@/types/fertility";

type ReportTab = "financial" | "marketing" | "operational" | "retention" | "fertility";

// Los cinco reportes son excluyentes (solo se ve uno) y cuatro de ellos
// importan recharts, pero los cinco entraban estáticos en el First Load de
// /reports. Cargados con next/dynamic, cada uno baja cuando se selecciona su
// pestaña.
//
// El fallback es EXACTAMENTE el mismo spinner que la página ya muestra
// mientras trae los datos (ver `loading ?` más abajo), así que el usuario no
// distingue "cargando datos" de "cargando módulo". Además:
//   · REPORT_LOADERS[activeTab] se precarga en un efecto, en paralelo con el
//     fetch de datos → el reporte por defecto (financial) no añade ni un ms
//     al primer render.
//   · Se precarga también al pasar el puntero por cada pestaña.
const REPORT_LOADERS: Record<ReportTab, () => Promise<unknown>> = {
  financial: () => import("./financial-report"),
  marketing: () => import("./marketing-report"),
  operational: () => import("./operational-report"),
  retention: () => import("./retention-report"),
  fertility: () => import("./fertility-report"),
};

const ReportChunkFallback = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const FinancialReport = dynamic(
  () => import("./financial-report").then((m) => m.FinancialReport),
  { ssr: false, loading: ReportChunkFallback },
);
const MarketingReport = dynamic(
  () => import("./marketing-report").then((m) => m.MarketingReport),
  { ssr: false, loading: ReportChunkFallback },
);
const OperationalReport = dynamic(
  () => import("./operational-report").then((m) => m.OperationalReport),
  { ssr: false, loading: ReportChunkFallback },
);
const RetentionReport = dynamic(
  () => import("./retention-report").then((m) => m.RetentionReport),
  { ssr: false, loading: ReportChunkFallback },
);
const FertilityReport = dynamic(
  () => import("./fertility-report").then((m) => m.FertilityReport),
  { ssr: false, loading: ReportChunkFallback },
);

const DATE_PRESETS = [
  { key: "today", days: 0 },
  { key: "7d", days: 7 },
  { key: "30d", days: 30 },
  { key: "90d", days: 90 },
  { key: "this_month", days: -1 },
] as const;

export default function ReportsPage() {
  const { t } = useLanguage();
  const { hasAnyAddon } = useOrgAddons();
  const fertilityActive = hasAnyAddon([FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY]);
  const [activeTab, setActiveTab] = useState<ReportTab>("financial");

  // Baja el chunk del reporte activo en paralelo con su fetch de datos.
  useEffect(() => {
    void REPORT_LOADERS[activeTab]();
  }, [activeTab]);
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
        .select("*, doctors(id, full_name, color), offices(id, name), services(id, name, duration_minutes, base_price), patients(id, origin)")
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
    // Addon-gated: only orgs with the fertility pack see this tab.
    ...(fertilityActive
      ? [{ key: "fertility" as const, label: "Fertilidad", icon: Baby }]
      : []),
  ];

  return (
    <AiReportProvider reportType={activeTab} dateFrom={dateFrom} dateTo={dateTo}>
      {/* Full-bleed en los dos ejes de breakpoint (pedido del founder:
          fuera el marco flotante también en escritorio).

          Móvil: los márgenes negativos cancelan el `p-4` del div interno
          del `main` (arriba y a los lados; el p-4 inferior se conserva) y
          la altura se recalibra: topbar 4rem + solo el p-4 inferior = 5rem.

          Desde md: se cancela el `p-7` por los cuatro lados (incluido el
          inferior) y la altura pasa a ser exactamente la del `main`
          (100dvh − topbar 4rem). El `px-4 md:px-6` de los headers internos
          queda como único gutter visible, igual que en Presupuestos.

          `dvh` porque 100vh en iOS incluye la barra de URL colapsable; en
          escritorio dvh == vh. */}
      <div className="-mx-4 -mt-4 flex h-[calc(100dvh-5rem)] flex-col md:-mx-7 md:-mb-7 md:-mt-7 md:h-[calc(100dvh-4rem)]">
        {/* Header */}
        <div className="border-b border-border bg-background px-4 py-3 md:px-6 md:py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold">{t("reports.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("reports.subtitle")}</p>
            </div>

            {/* Date Range + AI Button */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {/* En móvil los date-inputs de iOS son anchos: se reparten el
                  espacio (flex-1) y el separador se esconde. Desde sm, todo
                  vuelve al ancho intrínseco de antes. */}
              <div className="flex flex-wrap items-center gap-2">
                <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors sm:flex-none md:py-1.5"
                />
                <span className="hidden text-xs text-muted-foreground sm:inline">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors sm:flex-none md:py-1.5"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1">
                  {DATE_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      onClick={() => applyPreset(preset)}
                      className="rounded-md bg-muted px-2.5 py-2 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors md:px-2 md:py-1 md:text-[10px]"
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
          {/* Los -mx/px de la fila de tabs deben seguir al padding del
              header (px-4 en móvil, px-6 desde md) para que el scroll
              lateral sangre hasta el borde sin descuadrar el gutter. */}
          <div className="mt-4 flex gap-1 overflow-x-auto -mx-4 px-4 pb-1 md:-mx-6 md:px-6">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                onPointerEnter={() => void REPORT_LOADERS[tab.key]()}
                onFocus={() => void REPORT_LOADERS[tab.key]()}
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
        {/* `overflow-y-auto` por sí solo hace que overflow-x compute a
            `auto`: cualquier KPI o gráfico que se pasara de ancho abría
            una barra horizontal justo en el pie del viewport. Los anchos
            ya están saneados en los reportes (min-w-0 + wrap), así que en
            móvil se clava a `hidden`; las tablas anchas siguen scrolleando
            en su propio wrapper. Desde md nada cambia. */}
        <div className="flex-1 overflow-y-auto p-4 max-md:overflow-x-hidden md:p-6">
          {/* AI Summary Panel (appears when active) */}
          <AiSummaryPanel reportType={activeTab} dateFrom={dateFrom} dateTo={dateTo} />

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
          ) : activeTab === "fertility" ? (
            // Self-contained: fetches its own server-side aggregates,
            // doesn't depend on the shared raw-row fetch above.
            <FertilityReport dateFrom={dateFrom} dateTo={dateTo} />
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
