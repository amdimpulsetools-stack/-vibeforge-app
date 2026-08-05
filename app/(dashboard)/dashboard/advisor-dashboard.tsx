"use client";

// ── Dashboard de Asesora de Fertilidad ─────────────────────────────
//
// Home para miembros con `is_fertility_advisor=true` (mig 137) cuyo
// rol base es doctor o receptionist. El dashboard de doctor les
// mostraba KPIs de médico tratante (ingresos, mis pacientes) que para
// una asesora/obstetra coordinadora viven en cero — su trabajo real
// es el embudo: seguimientos, presupuestos y la agenda de la clínica.
//
// Fuentes (todas existentes, org-scoped):
//   - /api/clinical-followups/dashboard?bucket=pending  (cola + counts)
//   - /api/budgets?bucket=pending                       (counts + kpis)
//   - appointments de hoy vía supabase client (RLS org)
//
// Si además tiene ficha en `doctors` (se autoagenda), sus citas se
// destacan dentro de la agenda de hoy con el chip "Mía".

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useCurrentDoctor } from "@/hooks/use-current-doctor";
import { greetingName } from "@/lib/utils";
import {
  CalendarDays,
  ClipboardCheck,
  Wallet,
  Send,
  ArrowRight,
  Clock,
  CheckCircle2,
  PhoneCall,
} from "lucide-react";

// ── Tipos de respuesta de las APIs existentes ──────────────────────

interface FollowupItem {
  id: string;
  status: string;
  expected_by: string | null;
  attempt_count: number | null;
  days_diff: number | null;
  patients: { first_name: string | null; last_name: string | null; phone: string | null } | null;
  doctors: { id: string; full_name: string | null } | null;
}

interface BudgetItem {
  id: string;
  treatment_type: string;
  tier: "A" | "B" | "C" | null;
  amount: number | null;
  sent_at: string | null;
  assigned_at: string | null;
  patient: { first_name: string | null; last_name: string | null } | null;
}

interface TodayAppointment {
  id: string;
  patient_name: string | null;
  start_time: string;
  end_time: string;
  status: string;
  doctor_id: string | null;
  doctors: { full_name: string | null; color: string | null } | null;
  services: { name: string | null } | null;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  scheduled: { bg: "bg-muted/60", text: "text-muted-foreground", label: "Programada" },
  confirmed: { bg: "bg-blue-500/15", text: "text-blue-400", label: "Confirmada" },
  completed: { bg: "bg-success-500/15", text: "text-success-400", label: "Completada" },
};

const COLOR_MAP: Record<string, { icon: string; bg: string; ring: string }> = {
  blue: { icon: "text-blue-400", bg: "bg-blue-500/10", ring: "ring-blue-500/20" },
  emerald: { icon: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20" },
  amber: { icon: "text-amber-400", bg: "bg-amber-500/10", ring: "ring-amber-500/20" },
  purple: { icon: "text-purple-400", bg: "bg-purple-500/10", ring: "ring-purple-500/20" },
};

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: number | string;
  icon: typeof CalendarDays;
  color: string;
  subtitle?: string;
}) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.blue;
  return (
    <div className="card-hover group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${c.bg} ring-1 ${c.ring}`}>
          <Icon className={`h-4 w-4 ${c.icon}`} />
        </div>
      </div>
      <div className="mt-2">
        <span className="text-2xl font-extrabold tracking-tight">
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
      </div>
      {subtitle && <p className="mt-1.5 text-[11px] text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function patientName(p: { first_name: string | null; last_name: string | null } | null): string {
  return [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "—";
}

function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function AdvisorDashboard({ userName }: { userName: string }) {
  const { doctorId: myDoctorId } = useCurrentDoctor();
  // Org activa explícita hacia la API de seguimientos: sin ella el
  // endpoint resuelve la primera membresía, que para un usuario
  // multi-org puede ser otra clínica.
  const { organizationId, loading: orgLoading } = useOrganization();

  const [followups, setFollowups] = useState<FollowupItem[]>([]);
  const [followupsPending, setFollowupsPending] = useState(0);
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);
  const [budgetCounts, setBudgetCounts] = useState<{
    pending_unsent: number;
    pending_sent: number;
  }>({ pending_unsent: 0, pending_sent: 0 });
  const [acceptanceRate, setAcceptanceRate] = useState<number | null>(null);
  const [todayAppts, setTodayAppts] = useState<TodayAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orgLoading) return;
    const load = async () => {
      const supabase = createClient();
      const followupsQs = new URLSearchParams({
        bucket: "pending",
        limit: "5",
      });
      if (organizationId) followupsQs.set("org_id", organizationId);
      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      const [fuRes, buRes, apptRes] = await Promise.all([
        fetch(`/api/clinical-followups/dashboard?${followupsQs}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("/api/budgets?bucket=pending&limit=5", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        supabase
          .from("appointments")
          .select(
            "id, patient_name, start_time, end_time, status, doctor_id, doctors(full_name, color), services(name)",
          )
          .eq("appointment_date", todayIso)
          .neq("status", "cancelled")
          .order("start_time"),
      ]);

      if (fuRes) {
        setFollowups(Array.isArray(fuRes.items) ? fuRes.items : []);
        setFollowupsPending(fuRes.counts?.pending ?? 0);
      }
      if (buRes) {
        setBudgets(Array.isArray(buRes.items) ? buRes.items : []);
        setBudgetCounts({
          pending_unsent: buRes.counts?.pending_unsent ?? 0,
          pending_sent: buRes.counts?.pending_sent ?? 0,
        });
        setAcceptanceRate(
          typeof buRes.kpis?.acceptance_rate_pct === "number"
            ? buRes.kpis.acceptance_rate_pct
            : null,
        );
      }
      // PostgREST tipa los embeds many-to-one como array; normalizamos.
      const rows = ((apptRes.data as unknown[]) ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        const doc = Array.isArray(row.doctors) ? row.doctors[0] : row.doctors;
        const svc = Array.isArray(row.services) ? row.services[0] : row.services;
        return { ...row, doctors: doc ?? null, services: svc ?? null } as unknown as TodayAppointment;
      });
      setTodayAppts(rows);
      setLoading(false);
    };
    void load();
  }, [orgLoading, organizationId]);

  const todayLabel = new Date().toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-72 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {greetingByHour()}, {greetingName(userName) || userName}
          </h1>
          <p className="capitalize text-muted-foreground">{todayLabel}</p>
        </div>
        <Link
          href="/scheduler"
          className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl border border-border bg-card px-4 text-sm font-semibold shadow-sm transition-colors hover:bg-accent sm:self-auto"
        >
          <CalendarDays className="h-4 w-4" />
          Ver agenda
        </Link>
      </div>

      {/* KPIs del embudo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          title="Seguimientos pendientes"
          value={followupsPending}
          icon={PhoneCall}
          color="amber"
          subtitle="Pacientes por contactar"
        />
        <KpiCard
          title="Presupuestos sin procesar"
          value={budgetCounts.pending_unsent}
          icon={Wallet}
          color="purple"
          subtitle="Asignados, aún sin enviar"
        />
        <KpiCard
          title="Esperando respuesta"
          value={budgetCounts.pending_sent}
          icon={Send}
          color="blue"
          subtitle="Presupuestos enviados"
        />
        <KpiCard
          title="Tasa de aceptación"
          value={acceptanceRate !== null ? `${acceptanceRate}%` : "—"}
          icon={CheckCircle2}
          color="emerald"
          subtitle="Presupuestos aceptados"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Agenda de hoy — toda la clínica */}
        <div className="rounded-2xl border border-border/60 bg-card lg:col-span-3">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-bold">Agenda de hoy</h2>
              <span className="text-xs text-muted-foreground">
                {todayAppts.length} {todayAppts.length === 1 ? "cita" : "citas"}
              </span>
            </div>
            <Link
              href="/scheduler"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Agenda completa <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="max-h-[380px] space-y-2 overflow-y-auto p-4">
            {todayAppts.length === 0 ? (
              <div className="py-10 text-center">
                <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">
                  No hay citas hoy. Agenda la primera desde la agenda.
                </p>
              </div>
            ) : (
              todayAppts.map((a) => {
                const st = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.scheduled;
                const isMine = myDoctorId !== null && a.doctor_id === myDoctorId;
                return (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      isMine
                        ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                        : "border-border/60 bg-background/40"
                    }`}
                  >
                    <div className="flex w-14 shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {a.start_time?.slice(0, 5)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {a.patient_name || "—"}
                        {isMine && (
                          <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                            Mía
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.services?.name ?? "—"} · {a.doctors?.full_name ?? "Sin doctor"}
                      </p>
                    </div>
                    <span
                      className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline-flex ${st.bg} ${st.text}`}
                    >
                      {st.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Columna derecha: colas de trabajo */}
        <div className="space-y-6 lg:col-span-2">
          {/* Seguimientos */}
          <div className="rounded-2xl border border-border/60 bg-card">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-bold">Seguimientos</h2>
              </div>
              <Link
                href="/scheduler/follow-ups"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Ver todos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-2 p-4">
              {followups.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Sin seguimientos pendientes. 🎉
                </p>
              ) : (
                followups.map((f) => {
                  const overdue = typeof f.days_diff === "number" && f.days_diff < 0;
                  return (
                    <div
                      key={f.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/40 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {patientName(f.patients)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {f.attempt_count ? `${f.attempt_count} intento(s) · ` : ""}
                          {f.doctors?.full_name ?? ""}
                        </p>
                      </div>
                      {typeof f.days_diff === "number" && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            overdue
                              ? "bg-red-500/15 text-red-400"
                              : "bg-amber-500/15 text-amber-500"
                          }`}
                        >
                          {overdue
                            ? `Vencido ${Math.abs(f.days_diff)}d`
                            : f.days_diff === 0
                              ? "Hoy"
                              : `En ${f.days_diff}d`}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Presupuestos pendientes */}
          <div className="rounded-2xl border border-border/60 bg-card">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-purple-400" />
                <h2 className="text-sm font-bold">Presupuestos pendientes</h2>
              </div>
              <Link
                href="/scheduler/budgets"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Ver todos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-2 p-4">
              {budgets.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Sin presupuestos pendientes.
                </p>
              ) : (
                budgets.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/40 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {patientName(b.patient)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {b.treatment_type}
                        {b.tier ? ` · Tier ${b.tier}` : ""}
                        {b.amount ? ` · S/ ${Number(b.amount).toLocaleString("es-PE", { minimumFractionDigits: 2 })}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        b.sent_at
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-purple-500/15 text-purple-400"
                      }`}
                    >
                      {b.sent_at ? "Esperando respuesta" : "Sin procesar"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
