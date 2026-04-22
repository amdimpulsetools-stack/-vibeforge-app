"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Calendar,
  MapPin,
  Stethoscope,
  Loader2,
  LogOut,
  XCircle,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronRight,
  Ban,
  Activity,
  HeartPulse,
  CalendarCheck,
  History,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Doctor {
  full_name: string;
  specialty: string | null;
  photo_url?: string | null;
}

interface Service {
  name: string;
  duration_minutes: number;
}

interface Office {
  name: string;
}

interface Appointment {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  origin: string | null;
  price_snapshot: number | null;
  doctors: Doctor;
  services: Service;
  offices: Office;
}

interface PatientInfo {
  id: string;
  first_name: string;
  last_name: string;
  portal_email: string | null;
  portal_phone: string | null;
  dni: string | null;
}

interface OrgInfo {
  name: string;
  slug: string;
  logo_url: string | null;
}

interface PortalSettings {
  portal_enabled: boolean;
  portal_allow_cancel: boolean;
  portal_allow_reschedule: boolean;
  portal_min_cancel_hours: number;
  portal_welcome_message: string | null;
  accent_color: string | null;
}

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
  });
}

function formatMonthYear(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date
    .toLocaleDateString("es-PE", { month: "long", year: "numeric" })
    .toLowerCase();
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().split("T")[0];
  return dateStr === today;
}

function isTomorrow(dateStr: string): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateStr === tomorrow.toISOString().split("T")[0];
}

function getDateLabel(dateStr: string): string | null {
  if (isToday(dateStr)) return "Hoy";
  if (isTomorrow(dateStr)) return "Mañana";
  return null;
}

function getDayOfWeek(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date
    .toLocaleDateString("es-PE", { weekday: "short" })
    .replace(".", "")
    .toUpperCase();
}

function getDayNumber(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return String(date.getDate());
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

type StatusKey =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

const statusConfig: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  scheduled: { label: "Programada", color: "#007AFF", icon: Calendar },
  confirmed: { label: "Confirmada", color: "#34C759", icon: CheckCircle2 },
  completed: { label: "Completada", color: "#8E8E93", icon: CheckCircle2 },
  cancelled: { label: "Cancelada", color: "#FF3B30", icon: XCircle },
  no_show: { label: "No asistió", color: "#FF9500", icon: AlertCircle },
};

export default function MisCitasPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [past, setPast] = useState<Appointment[]>([]);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [settings, setSettings] = useState<PortalSettings | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [tab, setTab] = useState<"proximas" | "historial">("proximas");

  const accent = settings?.accent_color || "#10b981";

  const fetchData = useCallback(async () => {
    try {
      const [sessionRes, appointmentsRes] = await Promise.all([
        fetch(`/api/portal/auth/session?slug=${slug}`),
        fetch(`/api/portal/appointments?slug=${slug}`),
      ]);

      const sessionData = await sessionRes.json();
      if (!sessionData.authenticated) {
        router.replace(`/portal/${slug}`);
        return;
      }
      if (sessionData.needs_registration) {
        router.replace(`/portal/${slug}/registro`);
        return;
      }

      setPatient(sessionData.patient);
      setOrg(sessionData.organization);
      setSettings(sessionData.portal_settings);

      if (appointmentsRes.ok) {
        const apptData = await appointmentsRes.json();
        setUpcoming(apptData.upcoming || []);
        setPast(apptData.past || []);
      }
    } catch {
      router.replace(`/portal/${slug}`);
    } finally {
      setLoading(false);
    }
  }, [slug, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCancel = async (appointmentId: string) => {
    setCancellingId(appointmentId);
    try {
      const res = await fetch("/api/portal/appointments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, appointment_id: appointmentId }),
      });

      if (res.ok) {
        setConfirmCancel(null);
        await fetchData();
      } else {
        const data = await res.json();
        alert(data.error || "Error al cancelar");
      }
    } catch {
      alert("Error de conexión");
    } finally {
      setCancellingId(null);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/portal/auth/logout", { method: "POST" });
      router.replace(`/portal/${slug}`);
    } catch {
      setLoggingOut(false);
    }
  };

  const stats = useMemo(() => {
    const lastVisit = past[0]?.appointment_date || null;
    const completed = past.filter((a) => a.status === "completed").length;
    const doctorCount = new Set(
      [...upcoming, ...past]
        .map((a) => a.doctors?.full_name)
        .filter(Boolean)
    ).size;
    return { lastVisit, completed, doctorCount };
  }, [upcoming, past]);

  const pastByMonth = useMemo(() => {
    const groups: { key: string; label: string; items: Appointment[] }[] = [];
    const map = new Map<string, Appointment[]>();
    for (const a of past) {
      const key = a.appointment_date.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    for (const [key, items] of map) {
      groups.push({
        key,
        label: formatMonthYear(items[0].appointment_date),
        items,
      });
    }
    return groups;
  }, [past]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F2F2F7]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  const nextAppointment = upcoming[0] || null;
  const restUpcoming = upcoming.slice(1);

  return (
    <div className="min-h-screen bg-[#F2F2F7] pb-16">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b border-black/5 bg-[#F2F2F7]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 pt-6 pb-3">
          <div>
            <p className="text-xs font-medium text-zinc-500">
              {org?.name}
            </p>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-zinc-900">
              Resumen
            </h1>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label="Salir"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-600 shadow-sm ring-1 ring-black/5 transition active:scale-95"
          >
            {loggingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 pt-5">
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5"
        >
          <h2 className="text-[22px] font-semibold tracking-tight text-zinc-900">
            Hola, {patient?.first_name || "paciente"}
          </h2>
          {settings?.portal_welcome_message && (
            <p className="mt-1 text-[15px] leading-snug text-zinc-500">
              {settings.portal_welcome_message}
            </p>
          )}
        </motion.div>

        {/* Summary tiles */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Resumen
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SummaryTile
              icon={CalendarCheck}
              iconColor="#FF3B30"
              label="Próxima cita"
              value={
                nextAppointment
                  ? getDateLabel(nextAppointment.appointment_date) ||
                    formatShortDate(nextAppointment.appointment_date)
                  : "—"
              }
              sub={
                nextAppointment
                  ? formatTime(nextAppointment.start_time)
                  : "Sin programar"
              }
            />
            <SummaryTile
              icon={Activity}
              iconColor="#FF9500"
              label="Citas completadas"
              value={String(stats.completed)}
              sub={stats.completed === 1 ? "visita" : "visitas"}
            />
            <SummaryTile
              icon={History}
              iconColor="#AF52DE"
              label="Última visita"
              value={stats.lastVisit ? formatShortDate(stats.lastVisit) : "—"}
              sub={stats.lastVisit ? "completada" : "Primera vez"}
            />
            <SummaryTile
              icon={HeartPulse}
              iconColor="#34C759"
              label="Especialistas"
              value={String(stats.doctorCount)}
              sub={stats.doctorCount === 1 ? "doctor" : "doctores"}
            />
          </div>
        </motion.section>

        {/* Tabs */}
        <div className="mb-4">
          <div className="flex rounded-2xl bg-black/5 p-1">
            <TabButton
              active={tab === "proximas"}
              onClick={() => setTab("proximas")}
              label="Próximas"
              count={upcoming.length}
            />
            <TabButton
              active={tab === "historial"}
              onClick={() => setTab("historial")}
              label="Historial"
              count={past.length}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {tab === "proximas" ? (
            <motion.div
              key="proximas"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              {/* Next appointment hero */}
              {nextAppointment && (
                <section className="mb-6">
                  <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Próxima cita
                  </h3>
                  <HeroCard
                    appointment={nextAppointment}
                    accent={accent}
                    allowCancel={settings?.portal_allow_cancel || false}
                    cancellingId={cancellingId}
                    confirmCancel={confirmCancel}
                    onConfirmCancel={setConfirmCancel}
                    onCancel={handleCancel}
                  />
                </section>
              )}

              {/* Rest upcoming */}
              {restUpcoming.length > 0 && (
                <section className="mb-6">
                  <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Programadas
                  </h3>
                  <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                    {restUpcoming.map((appt, i) => (
                      <AppointmentRow
                        key={appt.id}
                        appointment={appt}
                        allowCancel={settings?.portal_allow_cancel || false}
                        confirmCancel={confirmCancel}
                        cancellingId={cancellingId}
                        onConfirmCancel={setConfirmCancel}
                        onCancel={handleCancel}
                        divider={i < restUpcoming.length - 1}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Empty */}
              {upcoming.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5"
                >
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF3B30]/10">
                    <Calendar className="h-6 w-6 text-[#FF3B30]" />
                  </div>
                  <h3 className="text-[17px] font-semibold text-zinc-900">
                    Sin citas próximas
                  </h3>
                  <p className="mt-1 text-[14px] text-zinc-500">
                    Comunícate con tu clínica para agendar
                  </p>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="historial"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              {past.length === 0 ? (
                <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-200/60">
                    <History className="h-6 w-6 text-zinc-500" />
                  </div>
                  <h3 className="text-[17px] font-semibold text-zinc-900">
                    Sin historial todavía
                  </h3>
                  <p className="mt-1 text-[14px] text-zinc-500">
                    Tus citas anteriores aparecerán aquí
                  </p>
                </div>
              ) : (
                pastByMonth.map((group) => (
                  <section key={group.key} className="mb-6">
                    <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      {group.label}
                    </h3>
                    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                      {group.items.map((appt, i) => (
                        <AppointmentRow
                          key={appt.id}
                          appointment={appt}
                          allowCancel={false}
                          confirmCancel={null}
                          cancellingId={null}
                          onConfirmCancel={() => {}}
                          onCancel={() => {}}
                          divider={i < group.items.length - 1}
                          isPast
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
        active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
          active ? "bg-zinc-100 text-zinc-600" : "bg-zinc-200/60 text-zinc-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function SummaryTile({
  icon: Icon,
  iconColor,
  label,
  value,
  sub,
}: {
  icon: typeof Calendar;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="mb-2 flex items-center justify-between">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: iconColor + "1F" }}
        >
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </div>
        <span
          className="text-[11px] font-semibold"
          style={{ color: iconColor }}
        >
          {label}
        </span>
      </div>
      <div className="text-[20px] font-bold capitalize leading-tight tracking-tight text-zinc-900">
        {value}
      </div>
      <div className="text-[12px] text-zinc-500">{sub}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.scheduled;
  const Icon = config.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        backgroundColor: config.color + "1A",
        color: config.color,
      }}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function HeroCard({
  appointment,
  accent,
  allowCancel,
  cancellingId,
  confirmCancel,
  onConfirmCancel,
  onCancel,
}: {
  appointment: Appointment;
  accent: string;
  allowCancel: boolean;
  cancellingId: string | null;
  confirmCancel: string | null;
  onConfirmCancel: (id: string | null) => void;
  onCancel: (id: string) => void;
}) {
  const label = getDateLabel(appointment.appointment_date);
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
      {/* Gradient banner */}
      <div
        className="px-5 pt-5 pb-4"
        style={{
          background: `linear-gradient(135deg, ${accent}14 0%, ${accent}06 100%)`,
        }}
      >
        <div className="flex items-start gap-4">
          {/* Date block */}
          <div className="flex flex-col items-center rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5">
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: accent }}
            >
              {getDayOfWeek(appointment.appointment_date)}
            </span>
            <span className="text-[26px] font-bold leading-none tracking-tight text-zinc-900">
              {getDayNumber(appointment.appointment_date)}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {label && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{
                    backgroundColor: accent + "22",
                    color: accent,
                  }}
                >
                  {label}
                </span>
              )}
              <StatusPill status={appointment.status} />
            </div>
            <p className="mt-2 text-[15px] font-semibold capitalize text-zinc-900">
              {formatFullDate(appointment.appointment_date)}
            </p>
            <p className="text-[14px] text-zinc-500">
              {formatTime(appointment.start_time)} —{" "}
              {formatTime(appointment.end_time)}
            </p>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="divide-y divide-black/5">
        <DetailRow
          icon={Stethoscope}
          iconColor="#5856D6"
          title={appointment.doctors?.full_name || "Doctor"}
          subtitle={appointment.doctors?.specialty || "Especialista"}
          avatar={appointment.doctors?.photo_url}
          avatarFallback={
            appointment.doctors?.full_name
              ? initials(appointment.doctors.full_name)
              : null
          }
        />
        {appointment.services && (
          <DetailRow
            icon={FileText}
            iconColor="#007AFF"
            title={appointment.services.name}
            subtitle={`${appointment.services.duration_minutes} min`}
          />
        )}
        {appointment.offices && (
          <DetailRow
            icon={MapPin}
            iconColor="#FF3B30"
            title={appointment.offices.name}
            subtitle="Consultorio"
          />
        )}
      </div>

      {/* Cancel */}
      {allowCancel &&
        ["scheduled", "confirmed"].includes(appointment.status) && (
          <div className="border-t border-black/5 bg-zinc-50/50 px-5 py-3">
            <AnimatePresence mode="wait" initial={false}>
              {confirmCancel === appointment.id ? (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-between gap-2"
                >
                  <p className="text-[12px] text-zinc-600">
                    ¿Cancelar esta cita?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onConfirmCancel(null)}
                      className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-zinc-500 hover:bg-zinc-100"
                    >
                      No
                    </button>
                    <button
                      onClick={() => onCancel(appointment.id)}
                      disabled={cancellingId === appointment.id}
                      className="inline-flex items-center gap-1 rounded-full bg-[#FF3B30] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm active:scale-95"
                    >
                      {cancellingId === appointment.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Ban className="h-3 w-3" />
                      )}
                      Cancelar
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  key="btn"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => onConfirmCancel(appointment.id)}
                  className="text-[13px] font-medium text-[#FF3B30]"
                >
                  Cancelar cita
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}
    </div>
  );
}

function DetailRow({
  icon: Icon,
  iconColor,
  title,
  subtitle,
  avatar,
  avatarFallback,
}: {
  icon: typeof Calendar;
  iconColor: string;
  title: string;
  subtitle?: string;
  avatar?: string | null;
  avatarFallback?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      {avatar ? (
        <img
          src={avatar}
          alt={title}
          className="h-9 w-9 rounded-full object-cover ring-1 ring-black/5"
        />
      ) : avatarFallback ? (
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold text-white"
          style={{ backgroundColor: iconColor }}
        >
          {avatarFallback}
        </div>
      ) : (
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: iconColor + "1F" }}
        >
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-zinc-900">
          {title}
        </p>
        {subtitle && (
          <p className="truncate text-[12px] text-zinc-500">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function AppointmentRow({
  appointment,
  allowCancel,
  confirmCancel,
  cancellingId,
  onConfirmCancel,
  onCancel,
  divider,
  isPast = false,
}: {
  appointment: Appointment;
  allowCancel: boolean;
  confirmCancel: string | null;
  cancellingId: string | null;
  onConfirmCancel: (id: string | null) => void;
  onCancel: (id: string) => void;
  divider: boolean;
  isPast?: boolean;
}) {
  const label = getDateLabel(appointment.appointment_date);
  const cfg = statusConfig[appointment.status] || statusConfig.scheduled;
  return (
    <div className={divider ? "border-b border-black/5" : ""}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Date block */}
        <div
          className="flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-xl"
          style={{
            backgroundColor: isPast ? "#E5E5EA80" : cfg.color + "1F",
          }}
        >
          <span
            className="text-[9px] font-bold uppercase"
            style={{ color: isPast ? "#8E8E93" : cfg.color }}
          >
            {getDayOfWeek(appointment.appointment_date)}
          </span>
          <span
            className={`text-[16px] font-bold leading-none ${
              isPast ? "text-zinc-500" : "text-zinc-900"
            }`}
          >
            {getDayNumber(appointment.appointment_date)}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {label && !isPast && (
              <span className="rounded-full bg-[#FF3B30]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#FF3B30]">
                {label}
              </span>
            )}
            <StatusPill status={appointment.status} />
          </div>
          <p
            className={`mt-0.5 truncate text-[14px] font-semibold ${
              isPast ? "text-zinc-600" : "text-zinc-900"
            }`}
          >
            {appointment.doctors?.full_name || "Doctor"}
          </p>
          <p className="truncate text-[12px] text-zinc-500">
            {formatTime(appointment.start_time)}
            {appointment.services && ` · ${appointment.services.name}`}
          </p>
        </div>

        <ChevronRight className="h-4 w-4 flex-shrink-0 text-zinc-300" />
      </div>

      {/* Cancel */}
      {allowCancel &&
        !isPast &&
        ["scheduled", "confirmed"].includes(appointment.status) && (
          <div className="px-4 pb-3">
            <AnimatePresence mode="wait" initial={false}>
              {confirmCancel === appointment.id ? (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center justify-end gap-2 overflow-hidden pt-1"
                >
                  <button
                    onClick={() => onConfirmCancel(null)}
                    className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-zinc-500 hover:bg-zinc-100"
                  >
                    No
                  </button>
                  <button
                    onClick={() => onCancel(appointment.id)}
                    disabled={cancellingId === appointment.id}
                    className="inline-flex items-center gap-1 rounded-full bg-[#FF3B30] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm active:scale-95"
                  >
                    {cancellingId === appointment.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Ban className="h-3 w-3" />
                    )}
                    Cancelar
                  </button>
                </motion.div>
              ) : (
                <motion.button
                  key="btn"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => onConfirmCancel(appointment.id)}
                  className="text-[12px] font-medium text-[#FF3B30]"
                >
                  Cancelar cita
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}
    </div>
  );
}
