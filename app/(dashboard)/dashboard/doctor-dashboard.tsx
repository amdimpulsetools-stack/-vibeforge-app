"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useUser } from "@/hooks/use-user";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  DollarSign,
  Users,
  Clock,
  ArrowRight,
  Loader2,
  Stethoscope,
  AlertCircle,
  FileSignature,
  Bell,
  CheckCircle2,
  CircleDot,
  UserPlus,
  Activity,
  ChevronRight,
  Play,
  ClipboardList,
  Target,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

interface TodayAgendaItem {
  id: string;
  patient_id: string | null;
  patient_name: string;
  start_time: string;
  end_time: string;
  status: string;
  service_name: string | null;
  office_name: string | null;
  has_note: boolean;
  note_signed: boolean;
}

interface UpcomingAppointment {
  id: string;
  patient_name: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  service_name: string | null;
  office_name: string | null;
}

interface UnsignedNote {
  id: string;
  appointment_id: string;
  patient_name: string;
  appointment_date: string;
  created_at: string;
}

interface PendingFollowup {
  id: string;
  patient_id: string;
  reason: string;
  priority: "red" | "yellow" | "green";
  follow_up_date: string;
  notes: string | null;
  patient_name: string;
}

interface RecentCompleted {
  id: string;
  patient_name: string;
  appointment_date: string;
  start_time: string;
  service_name: string | null;
  has_note: boolean;
  note_signed: boolean;
}

interface DoctorDashboardStats {
  today_appointments: number;
  today_completed: number;
  week_appointments: number;
  month_completed: number;
  month_total: number;
  month_revenue: number;
  total_patients: number;
  new_patients_month: number;
  today_agenda: TodayAgendaItem[];
  upcoming_appointments: UpcomingAppointment[];
  unsigned_notes_count: number;
  unsigned_notes: UnsignedNote[];
  followup_counts: { overdue: number; today: number; this_week: number };
  pending_followups: PendingFollowup[];
  recent_completed: RecentCompleted[];
}

interface DoctorStatsResponse {
  has_doctor_record: boolean;
  doctor_id: string | null;
  stats: DoctorDashboardStats | null;
}

// ── Constants ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  scheduled: { bg: "bg-muted/60", text: "text-muted-foreground", label: "Programada", dot: "bg-muted-foreground" },
  confirmed: { bg: "bg-blue-500/15", text: "text-blue-400", label: "Confirmada", dot: "bg-blue-400" },
  completed: { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "Completada", dot: "bg-emerald-400" },
  cancelled: { bg: "bg-red-500/15", text: "text-red-400", label: "Cancelada", dot: "bg-red-400" },
};

const PRIORITY_CONFIG: Record<string, { bg: string; border: string; text: string; dot: string; label: string }> = {
  red: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", dot: "bg-red-400", label: "Urgente" },
  yellow: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", dot: "bg-amber-400", label: "Moderado" },
  green: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", dot: "bg-emerald-400", label: "Rutina" },
};

// ── Animations ─────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", damping: 24, stiffness: 300 },
  },
};

// ── Greeting helper ────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function formatTime(time: string): string {
  return time?.slice(0, 5) ?? "";
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

// ── Main Component ─────────────────────────────────────────────────

export function DoctorDashboard({ userName }: { userName: string }) {
  const { user } = useUser();
  const { organizationId } = useOrganization();
  const [data, setData] = useState<DoctorStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !organizationId) return;

    const fetchStats = async () => {
      const supabase = createClient();
      // Try enhanced RPC first, fall back to original
      const { data: rpcData, error } = await supabase.rpc("get_doctor_dashboard_enhanced", {
        p_user_id: user.id,
        org_id: organizationId,
      });

      if (!error && rpcData) {
        setData(rpcData as unknown as DoctorStatsResponse);
      } else {
        // Fallback to original RPC
        const { data: fallbackData } = await supabase.rpc("get_doctor_personal_stats", {
          p_user_id: user.id,
          org_id: organizationId,
        });
        if (fallbackData) {
          setData(fallbackData as unknown as DoctorStatsResponse);
        }
      }
      setLoading(false);
    };

    fetchStats();
  }, [user, organizationId]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">Cargando tu dashboard...</p>
        </div>
      </div>
    );
  }

  if (!data?.has_doctor_record || !data.stats) {
    return <UnlinkedState userName={userName} />;
  }

  const stats = data.stats;
  const firstName = userName.split(" ")[0] || userName;
  const completionRateMonth =
    (stats.month_total ?? 0) > 0
      ? Math.round((stats.month_completed / (stats.month_total ?? 1)) * 100)
      : 0;

  const todayProgress =
    stats.today_appointments > 0
      ? Math.round((stats.today_completed / stats.today_appointments) * 100)
      : 0;

  const totalFollowups =
    (stats.followup_counts?.overdue ?? 0) +
    (stats.followup_counts?.today ?? 0) +
    (stats.followup_counts?.this_week ?? 0);

  return (
    <motion.div
      className="space-y-6 pb-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Header ── */}
      <motion.div variants={itemVariants} className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
            <Stethoscope className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              {getGreeting()}, {firstName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString("es", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stats.unsigned_notes_count > 0 && (
            <Link
              href="/scheduler"
              className="relative flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400 transition-all hover:bg-amber-500/20"
            >
              <FileSignature className="h-3.5 w-3.5" />
              {stats.unsigned_notes_count} sin firmar
            </Link>
          )}
          <Link
            href="/scheduler"
            className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2.5 text-sm font-medium transition-all hover:bg-accent/50"
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Ver agenda</span>
          </Link>
        </div>
      </motion.div>

      {/* ── Alert banners ── */}
      <AnimatePresence>
        {(stats.followup_counts?.overdue ?? 0) > 0 && (
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, height: 0 }}
          >
            <Link
              href="/scheduler/follow-ups"
              className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 transition-all hover:bg-red-500/15"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/15">
                <Bell className="h-4 w-4 text-red-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-400">
                  {stats.followup_counts.overdue} seguimiento{stats.followup_counts.overdue !== 1 ? "s" : ""} vencido{stats.followup_counts.overdue !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-red-400/70">Requieren atención inmediata</p>
              </div>
              <ArrowRight className="h-4 w-4 text-red-400/50" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── KPI Cards ── */}
      <motion.div variants={itemVariants} className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title="Citas hoy"
          value={stats.today_appointments}
          icon={CalendarDays}
          color="blue"
          progress={todayProgress}
          subtitle={`${stats.today_completed} completada${stats.today_completed !== 1 ? "s" : ""}`}
        />
        <KpiCard
          title="Esta semana"
          value={stats.week_appointments}
          icon={Activity}
          color="purple"
          subtitle={`${stats.month_completed} completadas este mes`}
        />
        <KpiCard
          title="Ingresos del mes"
          value={formatCurrency(stats.month_revenue ?? 0)}
          icon={DollarSign}
          color="emerald"
          subtitle={`${stats.month_completed} consultas`}
          isText
        />
        <KpiCard
          title="Mis pacientes"
          value={stats.total_patients}
          icon={Users}
          color="cyan"
          subtitle={stats.new_patients_month > 0 ? `+${stats.new_patients_month} nuevos` : undefined}
        />
        <KpiCard
          title="Tasa de completados"
          value={`${completionRateMonth}%`}
          icon={Target}
          color="amber"
          subtitle={`${stats.month_completed}/${stats.month_total ?? 0} citas este mes`}
          isText
        />
      </motion.div>

      {/* ── Main Grid: Agenda + Sidebar ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: Today's Agenda (2/3) */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <TodayAgenda
            items={stats.today_agenda ?? []}
            todayCount={stats.today_appointments}
            completedCount={stats.today_completed}
          />
        </motion.div>

        {/* Right: Sidebar panels (1/3) */}
        <div className="space-y-4">
          {/* Followups Panel */}
          <motion.div variants={itemVariants}>
            <FollowupsPanel
              followups={stats.pending_followups ?? []}
              counts={stats.followup_counts ?? { overdue: 0, today: 0, this_week: 0 }}
            />
          </motion.div>

          {/* Unsigned Notes */}
          {stats.unsigned_notes_count > 0 && (
            <motion.div variants={itemVariants}>
              <UnsignedNotesPanel
                notes={stats.unsigned_notes ?? []}
                totalCount={stats.unsigned_notes_count}
              />
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Bottom Grid: Upcoming + Recent ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div variants={itemVariants}>
          <UpcomingAppointmentsPanel items={stats.upcoming_appointments ?? []} />
        </motion.div>
        <motion.div variants={itemVariants}>
          <RecentCompletedPanel items={stats.recent_completed ?? []} />
        </motion.div>
      </div>
    </motion.div>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { icon: string; bg: string; ring: string; progressBg: string }> = {
  blue: { icon: "text-blue-400", bg: "bg-blue-500/10", ring: "ring-blue-500/20", progressBg: "bg-blue-500" },
  purple: { icon: "text-purple-400", bg: "bg-purple-500/10", ring: "ring-purple-500/20", progressBg: "bg-purple-500" },
  emerald: { icon: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20", progressBg: "bg-emerald-500" },
  cyan: { icon: "text-cyan-400", bg: "bg-cyan-500/10", ring: "ring-cyan-500/20", progressBg: "bg-cyan-500" },
  amber: { icon: "text-amber-400", bg: "bg-amber-500/10", ring: "ring-amber-500/20", progressBg: "bg-amber-500" },
};

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
  progress,
  isText,
}: {
  title: string;
  value: number | string;
  icon: typeof CalendarDays;
  color: string;
  subtitle?: string;
  progress?: number;
  isText?: boolean;
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
          {isText ? value : (typeof value === "number" ? value.toLocaleString() : value)}
        </span>
      </div>
      {progress !== undefined && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted/40">
          <motion.div
            className={`h-full rounded-full ${c.progressBg}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
          />
        </div>
      )}
      {subtitle && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

// ── Today's Agenda (Timeline) ──────────────────────────────────────

function TodayAgenda({
  items,
  todayCount,
  completedCount,
}: {
  items: TodayAgendaItem[];
  todayCount: number;
  completedCount: number;
}) {
  // Determine "current" appointment based on time
  const now = new Date();
  const currentTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const currentIndex = useMemo(() => {
    for (let i = 0; i < items.length; i++) {
      const start = items[i].start_time?.slice(0, 5) ?? "00:00";
      const end = items[i].end_time?.slice(0, 5) ?? "23:59";
      if (currentTimeStr >= start && currentTimeStr <= end && items[i].status !== "completed") {
        return i;
      }
    }
    // Find next upcoming
    for (let i = 0; i < items.length; i++) {
      const start = items[i].start_time?.slice(0, 5) ?? "00:00";
      if (currentTimeStr < start && items[i].status !== "completed") {
        return i;
      }
    }
    return -1;
  }, [items, currentTimeStr]);

  return (
    <div className="rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
            <CalendarDays className="h-3.5 w-3.5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold">Agenda de hoy</h2>
            <p className="text-[11px] text-muted-foreground">
              {completedCount}/{todayCount} completadas
            </p>
          </div>
        </div>
        <Link
          href="/scheduler"
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          Agenda completa
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/30">
            <CalendarDays className="h-6 w-6 text-muted-foreground/30" />
          </div>
          <p className="mt-3 text-sm font-medium text-muted-foreground">No tienes citas hoy</p>
          <p className="text-xs text-muted-foreground/60">Disfruta tu día libre</p>
        </div>
      ) : (
        <div className="divide-y divide-border/20">
          {items.map((item, idx) => {
            const isCurrent = idx === currentIndex;
            const isCompleted = item.status === "completed";
            const statusConf = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.scheduled;

            return (
              <div
                key={item.id}
                className={`group/item relative flex items-center gap-3 px-5 py-3 transition-all ${
                  isCurrent
                    ? "bg-primary/5 ring-1 ring-inset ring-primary/20"
                    : "hover:bg-muted/20"
                }`}
              >
                {/* Timeline dot */}
                <div className="flex flex-col items-center gap-0.5 self-stretch">
                  <div
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ${
                      isCurrent
                        ? "bg-primary ring-primary/30 animate-pulse"
                        : isCompleted
                          ? "bg-emerald-400 ring-emerald-400/30"
                          : "bg-muted-foreground/30 ring-muted/30"
                    }`}
                  />
                  {idx < items.length - 1 && (
                    <div className={`w-px flex-1 ${isCompleted ? "bg-emerald-500/30" : "bg-border/40"}`} />
                  )}
                </div>

                {/* Time */}
                <div className="w-[72px] shrink-0">
                  <p className={`text-sm font-mono font-semibold ${isCurrent ? "text-primary" : ""}`}>
                    {formatTime(item.start_time)}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground/60">
                    {formatTime(item.end_time)}
                  </p>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`truncate text-sm font-semibold ${isCompleted ? "text-muted-foreground line-through" : ""}`}>
                      {item.patient_name}
                    </p>
                    {isCurrent && (
                      <span className="flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        <Play className="h-2.5 w-2.5" fill="currentColor" />
                        AHORA
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.service_name ?? "Consulta general"}
                    {item.office_name ? ` · ${item.office_name}` : ""}
                  </p>
                </div>

                {/* Status + Note indicator */}
                <div className="flex items-center gap-2 shrink-0">
                  {item.has_note && (
                    <div className={`flex h-5 w-5 items-center justify-center rounded ${item.note_signed ? "text-emerald-400" : "text-amber-400"}`}>
                      <FileSignature className="h-3 w-3" />
                    </div>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusConf.bg} ${statusConf.text}`}>
                    {statusConf.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Followups Panel ────────────────────────────────────────────────

function FollowupsPanel({
  followups,
  counts,
}: {
  followups: PendingFollowup[];
  counts: { overdue: number; today: number; this_week: number };
}) {
  const total = counts.overdue + counts.today + counts.this_week;

  return (
    <div className="rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/40 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
            <Bell className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <h2 className="text-sm font-bold">Seguimientos</h2>
        </div>
        <Link
          href="/scheduler/follow-ups"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          Ver todos
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Mini counter badges */}
      {total > 0 && (
        <div className="flex gap-2 px-5 py-3 border-b border-border/20">
          {counts.overdue > 0 && (
            <span className="flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              {counts.overdue} vencido{counts.overdue !== 1 ? "s" : ""}
            </span>
          )}
          {counts.today > 0 && (
            <span className="flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              {counts.today} hoy
            </span>
          )}
          {counts.this_week > 0 && (
            <span className="flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-400">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              {counts.this_week} esta semana
            </span>
          )}
        </div>
      )}

      {followups.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8">
          <CheckCircle2 className="h-6 w-6 text-emerald-400/40" />
          <p className="mt-2 text-xs text-muted-foreground">Sin seguimientos pendientes</p>
        </div>
      ) : (
        <div className="divide-y divide-border/20">
          {followups.slice(0, 5).map((f) => {
            const pConf = PRIORITY_CONFIG[f.priority] ?? PRIORITY_CONFIG.green;
            const days = daysUntil(f.follow_up_date);
            const isOverdue = days < 0;

            return (
              <div
                key={f.id}
                className="flex items-start gap-3 px-5 py-2.5 transition-colors hover:bg-muted/20"
              >
                <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${pConf.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{f.patient_name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{f.reason}</p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                    isOverdue
                      ? "bg-red-500/10 text-red-400"
                      : days === 0
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {isOverdue ? `${Math.abs(days)}d atrás` : days === 0 ? "Hoy" : `en ${days}d`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Unsigned Notes Panel ───────────────────────────────────────────

function UnsignedNotesPanel({
  notes,
  totalCount,
}: {
  notes: UnsignedNote[];
  totalCount: number;
}) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-card">
      <div className="flex items-center justify-between border-b border-border/40 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
            <FileSignature className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold">Notas sin firmar</h2>
            <p className="text-[11px] text-muted-foreground">{totalCount} pendiente{totalCount !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>
      <div className="divide-y divide-border/20">
        {notes.map((n) => (
          <div
            key={n.id}
            className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/20"
          >
            <ClipboardList className="h-3.5 w-3.5 shrink-0 text-amber-400/60" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{n.patient_name}</p>
              <p className="text-[11px] text-muted-foreground">{formatDateShort(n.appointment_date)}</p>
            </div>
            <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Upcoming Appointments ──────────────────────────────────────────

function UpcomingAppointmentsPanel({ items }: { items: UpcomingAppointment[] }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10">
            <Clock className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <h2 className="text-sm font-bold">Próximas citas</h2>
        </div>
        <Link
          href="/scheduler"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          Ver agenda
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8">
          <CalendarDays className="h-6 w-6 text-muted-foreground/30" />
          <p className="mt-2 text-xs text-muted-foreground">Sin citas próximas</p>
        </div>
      ) : (
        <div className="divide-y divide-border/20">
          {items.map((appt) => {
            const statusConf = STATUS_CONFIG[appt.status] ?? STATUS_CONFIG.scheduled;
            const days = daysUntil(appt.appointment_date);

            return (
              <div
                key={appt.id}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/20"
              >
                <div className="flex h-9 w-9 flex-col items-center justify-center rounded-xl bg-muted/40">
                  <span className="text-[10px] font-bold leading-none">
                    {formatDateShort(appt.appointment_date).split(" ")[0]}
                  </span>
                  <span className="text-[9px] uppercase text-muted-foreground leading-none mt-0.5">
                    {formatDateShort(appt.appointment_date).split(" ")[1]}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{appt.patient_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatTime(appt.start_time)}
                    {appt.service_name ? ` · ${appt.service_name}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusConf.bg} ${statusConf.text}`}>
                    {statusConf.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {days === 1 ? "mañana" : `en ${days}d`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Recent Completed ───────────────────────────────────────────────

function RecentCompletedPanel({ items }: { items: RecentCompleted[] }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <h2 className="text-sm font-bold">Consultas recientes</h2>
        </div>
        <Link
          href="/scheduler/history"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          Historial
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8">
          <Activity className="h-6 w-6 text-muted-foreground/30" />
          <p className="mt-2 text-xs text-muted-foreground">Sin consultas recientes</p>
        </div>
      ) : (
        <div className="divide-y divide-border/20">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/20"
            >
              <div className="flex h-9 w-9 flex-col items-center justify-center rounded-xl bg-muted/40">
                <span className="text-[10px] font-bold leading-none">
                  {formatDateShort(item.appointment_date).split(" ")[0]}
                </span>
                <span className="text-[9px] uppercase text-muted-foreground leading-none mt-0.5">
                  {formatDateShort(item.appointment_date).split(" ")[1]}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.patient_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatTime(item.start_time)}
                  {item.service_name ? ` · ${item.service_name}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {item.has_note ? (
                  <span
                    className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                      item.note_signed
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-amber-500/10 text-amber-400"
                    }`}
                  >
                    <FileSignature className="h-2.5 w-2.5" />
                    {item.note_signed ? "Firmada" : "Sin firmar"}
                  </span>
                ) : (
                  <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    Sin nota
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Unlinked State ─────────────────────────────────────────────────

function UnlinkedState({ userName }: { userName: string }) {
  return (
    <motion.div
      className="space-y-6 pb-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Stethoscope className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Mi Dashboard</h1>
          <p className="text-muted-foreground">
            Bienvenido, {userName.split(" ")[0] || userName}
          </p>
        </div>
      </div>
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
        <h2 className="text-lg font-bold mb-2">Cuenta no vinculada</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Tu cuenta de usuario aún no está vinculada a un registro de doctor.
          Contacta al administrador de tu organización para vincular tu perfil.
        </p>
      </div>
    </motion.div>
  );
}
