"use client";

// ── Dashboard del rol RECEPCIONISTA ────────────────────────────────
//
// Home para miembros con rol `receptionist` (no asesoras: esas van a
// AdvisorDashboard). Antes este rol se redirigía directo a /scheduler;
// ahora tiene su propio escritorio operativo: el día de hoy, la cola de
// confirmaciones de mañana, SUS cobros (created_by, mig 213), la cola de
// seguimientos y la gráfica org-wide de 30 días con un chip personal
// (responsible_user_id, mig 073).
//
// Fuentes:
//   - initialData: RPC get_receptionist_dashboard (mig 236), disparado en
//     el Server Component (page.tsx) — con gating de rol dentro del RPC.
//     Si el RPC falló llega null y se pintan empty-states, NUNCA redirect
//     (evita bucles con el routing por rol).
//   - Seguimientos: fetch cliente a /api/clinical-followups/dashboard en
//     modo legacy (sin bucket) con la org activa — patrón advisor-dashboard.
//
// Money rules: "Mis cobros de hoy" son COBROS en bruto (con IGV, como se
// cobran) y SOLO clínica (COALESCE(source,'clinical')='clinical'). Jamás
// rotular ingresos/ganancia/neto aquí.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { eachDayOfInterval, format, subDays, addDays } from "date-fns";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { useBrandAccent } from "@/hooks/use-brand-accent";
import { formatCurrency, greetingName } from "@/lib/utils";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  PhoneCall,
  Wallet,
} from "lucide-react";
import { NumberPopIn } from "@/components/ui/number-pop-in";
import type { AppointmentVariables } from "@/lib/whatsapp-clipboard-config";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

// recharts solo entra cuando el chunk del chart baja — patrón exacto del
// dashboard admin (placeholder con el alto reservado, cero layout shift).
const AdminAppointmentsChart = dynamic(
  () => import("./admin-appointments-chart").then((m) => m.AdminAppointmentsChart),
  { ssr: false, loading: () => <div style={{ height: 200 }} /> },
);

// framer-motion vive dentro del modal — fuera del First Load hasta que la
// recepcionista pulse el botón de WhatsApp de una fila.
const WhatsAppClipboardModal = dynamic(
  () =>
    import("../scheduler/whatsapp-clipboard-modal").then(
      (m) => m.WhatsAppClipboardModal,
    ),
  { ssr: false },
);

// ── Shape del JSON del RPC get_receptionist_dashboard (mig 236) ────
// Tipado a mano: el cliente Supabase no está tipado con Database y
// `npm run types` requiere credenciales del proyecto.

export interface ReceptionistDashboardData {
  kpis_today: {
    total: number;
    confirmed: number;
    unconfirmed: number;
    completed: number;
    no_show: number;
  };
  tomorrow_unconfirmed: Array<{
    id: string;
    start_time: string;
    patient_name: string | null;
    patient_phone: string | null;
    doctor_name: string | null;
    service_name: string | null;
  }>;
  my_payments_today: {
    amount_total: number;
    count: number;
  };
  my_managed_30d: {
    completed: number;
    no_show: number;
    cancelled: number;
  };
  daily_series: Array<{ date: string; count: number }>;
}

type TomorrowRow = ReceptionistDashboardData["tomorrow_unconfirmed"][number];

// Shape (parcial) de la respuesta legacy de /api/clinical-followups/dashboard
// (sin `bucket`): { data: { overdue, this_week, upcoming }, counts }.
interface LegacyFollowupItem {
  id: string;
  reason: string | null;
  days_diff: number;
  patients: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
}

interface LegacyFollowupsResponse {
  data: {
    overdue: LegacyFollowupItem[];
    this_week: LegacyFollowupItem[];
    upcoming: LegacyFollowupItem[];
  };
  counts: {
    overdue: number;
    this_week: number;
    upcoming: number;
    total: number;
  };
}

const EMPTY_DATA: ReceptionistDashboardData = {
  kpis_today: { total: 0, confirmed: 0, unconfirmed: 0, completed: 0, no_show: 0 },
  tomorrow_unconfirmed: [],
  my_payments_today: { amount_total: 0, count: 0 },
  my_managed_30d: { completed: 0, no_show: 0, cancelled: 0 },
  daily_series: [],
};

function hhmm(time: string): string {
  return time.length >= 5 ? time.slice(0, 5) : time;
}

// ── Main Component ─────────────────────────────────────────────────

export function ReceptionistDashboard({
  userName,
  initialData,
}: {
  userName: string;
  initialData: ReceptionistDashboardData | null;
}) {
  const { language, t } = useLanguage();
  const isEs = language === "es";
  const accent = useBrandAccent();
  const { organizationId, organization, loading: orgLoading } = useOrganization();

  // Si el RPC falló en el server (initialData null) se pinta todo con
  // empty-states — nunca redirect a /scheduler (evitar bucles).
  const data = initialData ?? EMPTY_DATA;

  // ── W4: seguimientos por contactar (modo legacy, sin bucket) ──
  const [followups, setFollowups] = useState<LegacyFollowupsResponse | null>(null);
  const [followupsLoading, setFollowupsLoading] = useState(true);

  useEffect(() => {
    if (orgLoading) return;
    // Org activa explícita hacia la API de seguimientos: sin ella el
    // endpoint resuelve la primera membresía, que para un usuario
    // multi-org puede ser otra clínica (patrón advisor-dashboard).
    const qs = new URLSearchParams();
    if (organizationId) qs.set("org_id", organizationId);
    let cancelled = false;
    fetch(`/api/clinical-followups/dashboard?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<LegacyFollowupsResponse>) : null))
      .catch(() => null)
      .then((res) => {
        if (cancelled) return;
        setFollowups(res);
        setFollowupsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgLoading, organizationId]);

  // ── W2: modal de WhatsApp por fila ──
  const [waModal, setWaModal] = useState<{
    open: boolean;
    variables: AppointmentVariables | null;
    phone: string | null;
  }>({ open: false, variables: null, phone: null });

  const tomorrow = useMemo(() => addDays(new Date(), 1), []);
  const tomorrowIso = format(tomorrow, "yyyy-MM-dd");

  const openWaModal = (row: TomorrowRow) => {
    const [y, m, d] = tomorrowIso.split("-");
    setWaModal({
      open: true,
      variables: {
        patientName: row.patient_name ?? "",
        date: `${d}/${m}/${y}`,
        time: hhmm(row.start_time),
        doctorName: row.doctor_name ?? "",
        serviceName: row.service_name ?? "",
        clinicName: organization?.name ?? "",
        clinicAddress: organization?.address ?? "",
      },
      phone: row.patient_phone,
    });
  };

  // ── W5: relleno de días vacíos con 0 (mismo patrón que el admin) ──
  const dailySeries = useMemo(() => {
    const now = new Date();
    const seriesCounts = new Map<string, number>();
    for (const row of data.daily_series) {
      seriesCounts.set(row.date, Number(row.count));
    }
    return eachDayOfInterval({ start: subDays(now, 29), end: now }).map((d) => {
      const date = format(d, "yyyy-MM-dd");
      return { date, count: seriesCounts.get(date) ?? 0 };
    });
  }, [data.daily_series]);

  const seriesTotal = dailySeries.reduce((sum, p) => sum + p.count, 0);
  const seriesAvg = dailySeries.length > 0 ? seriesTotal / dailySeries.length : 0;

  const mine = data.my_managed_30d;
  // Sin actividad personal, el chip se oculta (nada de ceros acusadores).
  const showMineChip = mine.completed + mine.no_show + mine.cancelled > 0;

  const overdueCount = followups?.counts.overdue ?? 0;
  const thisWeekCount = followups?.counts.this_week ?? 0;
  const followupPreview: LegacyFollowupItem[] = followups
    ? [...followups.data.overdue, ...followups.data.this_week].slice(0, 3)
    : [];

  const kpis = data.kpis_today;

  return (
    <div className="space-y-6 pb-8">
      {/* ── HEADER: "Mi día" + saludo ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t("dashboard.receptionist.title")}
          </h1>
          <p className="mt-1 truncate text-muted-foreground">
            {t("dashboard.welcome")}, {greetingName(userName) || userName}
          </p>
        </div>
        <Link
          href="/scheduler"
          className="hidden md:flex shrink-0 items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm font-medium transition-all hover:bg-accent/50 hover:border-border"
        >
          <CalendarDays className="h-4 w-4" />
          {t("dashboard.view_scheduler")}
        </Link>
      </div>

      {/* ── ROW 1: [W1 Hoy de un vistazo] [W3 Mis cobros] [W4 Seguimientos] ── */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {/* W1: Hoy de un vistazo → /scheduler */}
        <Link
          href="/scheduler"
          className="block rounded-2xl border border-border/60 bg-card p-5 transition-all hover:border-border hover:bg-accent/30"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <CalendarDays className="h-4 w-4 text-violet-500" />
            </div>
            <span className="text-xs font-semibold text-violet-500">
              {t("dashboard.receptionist.today_glance")}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-extrabold tracking-tight">
              <NumberPopIn key={kpis.total} value={String(kpis.total)} />
            </p>
            <span className="text-xs text-muted-foreground">
              {t("dashboard.receptionist.appointments_today")}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <span className="flex items-center gap-1.5 text-blue-500">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              {kpis.confirmed} {t("dashboard.receptionist.confirmed")}
            </span>
            <span className="flex items-center gap-1.5 text-amber-500">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              {kpis.unconfirmed} {t("dashboard.receptionist.unconfirmed")}
            </span>
            <span className="flex items-center gap-1.5 text-success-500">
              <span className="h-2 w-2 rounded-full bg-success-500" />
              {kpis.completed} {t("dashboard.receptionist.completed")}
            </span>
            <span className="flex items-center gap-1.5 text-rose-500">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              {kpis.no_show} {t("dashboard.receptionist.no_show")}
            </span>
          </div>
        </Link>

        {/* W3: Mis cobros de hoy → /facturacion. Cobros en BRUTO, solo
            clínica. PROHIBIDO rotular ingresos/ganancia/neto aquí. */}
        <Link
          href="/facturacion"
          className="block rounded-2xl border border-border/60 bg-card p-5 transition-all hover:border-border hover:bg-accent/30"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Wallet className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs font-semibold text-emerald-500">
              {t("dashboard.receptionist.my_payments_title")}
            </span>
          </div>
          <p className="text-3xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
            <NumberPopIn
              key={formatCurrency(data.my_payments_today.amount_total)}
              value={formatCurrency(data.my_payments_today.amount_total)}
            />
          </p>
          <p className="mt-1 text-sm font-semibold">
            {data.my_payments_today.count}{" "}
            <span className="font-normal text-muted-foreground">
              {data.my_payments_today.count === 1
                ? t("dashboard.receptionist.payment_singular")
                : t("dashboard.receptionist.payment_plural")}
            </span>
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t("dashboard.receptionist.my_payments_subtitle")}
          </p>
        </Link>

        {/* W4: Seguimientos por contactar → /scheduler/follow-ups */}
        <Link
          href="/scheduler/follow-ups"
          className="block rounded-2xl border border-border/60 bg-card p-5 transition-all hover:border-border hover:bg-accent/30 md:col-span-2 lg:col-span-1"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10">
              <PhoneCall className="h-4 w-4 text-rose-500" />
            </div>
            <span className="text-xs font-semibold text-rose-500">
              {t("dashboard.receptionist.followups_title")}
            </span>
          </div>
          {followupsLoading ? (
            <div className="space-y-2" aria-live="polite">
              <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <div>
                  <p className="text-3xl font-extrabold tracking-tight text-rose-500">
                    <NumberPopIn key={overdueCount} value={String(overdueCount)} />
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("dashboard.receptionist.followups_overdue")}
                  </p>
                </div>
                <div className="border-l border-border pl-4">
                  <p className="text-3xl font-extrabold tracking-tight text-amber-500">
                    <NumberPopIn key={thisWeekCount} value={String(thisWeekCount)} />
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("dashboard.receptionist.followups_this_week")}
                  </p>
                </div>
              </div>
              {followupPreview.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {followupPreview.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          f.days_diff < 0 ? "bg-rose-500" : "bg-amber-500"
                        }`}
                      />
                      <span className="truncate font-medium text-foreground">
                        {[f.patients?.first_name, f.patients?.last_name]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </span>
                      {f.reason && <span className="truncate">· {f.reason}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("dashboard.receptionist.followups_empty")}
                </p>
              )}
            </>
          )}
        </Link>
      </div>

      {/* ── ROW 2: [W2 Por confirmar mañana] [W5 Citas 30 días span-2] ── */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {/* W2: Por confirmar mañana (status='scheduled') */}
        <div className="rounded-2xl border border-border/60 bg-card flex flex-col">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border/40">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
              <ClipboardList className="h-4 w-4 text-amber-500" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold">
                {t("dashboard.receptionist.tomorrow_title")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {data.tomorrow_unconfirmed.length}{" "}
                {t("dashboard.receptionist.tomorrow_pending")}
              </p>
            </div>
          </div>
          {data.tomorrow_unconfirmed.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <CheckCircle2 className="h-6 w-6 text-success-500" />
              <p className="text-sm text-muted-foreground">
                {t("dashboard.receptionist.tomorrow_empty")}
              </p>
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-border/40">
              {data.tomorrow_unconfirmed.map((row) => (
                // El botón de WhatsApp es HERMANO del Link (no hijo):
                // <button> dentro de <a> es HTML inválido y rompe el click.
                <li
                  key={row.id}
                  className="flex items-center gap-1 pr-3 transition-colors hover:bg-accent/40"
                >
                  <Link
                    href={`/scheduler?date=${tomorrowIso}`}
                    className="group flex min-w-0 flex-1 items-center gap-3 py-3 pl-5 pr-1"
                  >
                    <span className="shrink-0 rounded-lg bg-muted px-2 py-1 text-xs font-bold tabular-nums">
                      {hhmm(row.start_time)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {row.patient_name || "—"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[row.doctor_name, row.service_name]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <button
                    type="button"
                    title={t("dashboard.receptionist.tomorrow_whatsapp")}
                    aria-label={t("dashboard.receptionist.tomorrow_whatsapp")}
                    onClick={() => openWaModal(row)}
                    className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-[#25D366]/10 hover:text-[#25D366]"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* W5: Citas últimos 30 días (org-wide) + chip personal */}
        <div className="md:col-span-2 rounded-2xl border border-border/60 bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-6 py-4 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                <Activity className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold">
                  {t("dashboard.receptionist.chart_title")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {seriesTotal} {isEs ? "citas · promedio" : "appointments · avg"}{" "}
                  {seriesAvg.toFixed(1)}/{isEs ? "día" : "day"}
                </p>
              </div>
            </div>
            {/* Chip personal — oculto si los 3 contadores están en 0. */}
            {showMineChip && (
              <span className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {t("dashboard.receptionist.yours")}:
                </span>{" "}
                {mine.completed} {t("dashboard.receptionist.completed_lc")} ·{" "}
                {mine.no_show} no-show · {mine.cancelled}{" "}
                {t("dashboard.receptionist.cancelled_lc")}
              </span>
            )}
          </div>
          {seriesTotal === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {t("dashboard.receptionist.chart_empty")}
              </p>
            </div>
          ) : (
            <div className="px-4 py-4">
              <AdminAppointmentsChart
                dailySeries={dailySeries}
                accent={accent}
                isEs={isEs}
              />
            </div>
          )}
        </div>
      </div>

      {/* Modal de WhatsApp (W2) — montado a nivel page, patrón scheduler. */}
      {waModal.variables && (
        <WhatsAppClipboardModal
          open={waModal.open}
          variables={waModal.variables}
          phone={waModal.phone}
          onClose={() => setWaModal({ open: false, variables: null, phone: null })}
        />
      )}
    </div>
  );
}
