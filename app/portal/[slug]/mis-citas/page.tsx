"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
  Plus,
  X,
  Phone,
  IdCard,
  Mail,
  User as UserIcon,
  Check,
  Pencil,
  DollarSign,
  CalendarPlus,
  StickyNote,
  MessageSquare,
  PhoneCall,
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
  allow_online_booking?: boolean;
}

interface ClinicContact {
  phone: string | null;
  email: string | null;
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
  const [contact, setContact] = useState<ClinicContact>({ phone: null, email: null });
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [tab, setTab] = useState<"proximas" | "historial">("proximas");
  const [historyFilter, setHistoryFilter] = useState<"all" | StatusKey>("all");
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);
  const [showSpecialists, setShowSpecialists] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showContact, setShowContact] = useState(false);

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
      if (sessionData.clinic_contact) setContact(sessionData.clinic_contact);

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

  const filteredPast = useMemo(() => {
    if (historyFilter === "all") return past;
    return past.filter((a) => a.status === historyFilter);
  }, [past, historyFilter]);

  const pastByMonth = useMemo(() => {
    const groups: { key: string; label: string; items: Appointment[] }[] = [];
    const map = new Map<string, Appointment[]>();
    for (const a of filteredPast) {
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
  }, [filteredPast]);

  const specialists = useMemo(() => {
    const map = new Map<
      string,
      { name: string; specialty: string | null; count: number; photo: string | null }
    >();
    for (const a of [...upcoming, ...past]) {
      const name = a.doctors?.full_name;
      if (!name) continue;
      const cur = map.get(name);
      if (cur) {
        cur.count += 1;
      } else {
        map.set(name, {
          name,
          specialty: a.doctors?.specialty || null,
          count: 1,
          photo: a.doctors?.photo_url || null,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [upcoming, past]);

  const historyCounts = useMemo(() => {
    const base = { all: past.length } as Record<string, number>;
    for (const a of past) {
      base[a.status] = (base[a.status] || 0) + 1;
    }
    return base;
  }, [past]);

  if (loading) {
    return <PortalSkeleton />;
  }

  const nextAppointment = upcoming[0] || null;
  const restUpcoming = upcoming.slice(1);
  const allowOnlineBooking = settings?.allow_online_booking !== false;
  const handleBookingClick = () => {
    if (allowOnlineBooking) return; // let <Link> navigate
    setShowContact(true);
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] pb-16 lg:pb-8">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b border-black/5 bg-[#F2F2F7]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-5 pt-6 pb-3 lg:px-8 lg:pt-8">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-zinc-500 lg:text-sm">
              {org?.name}
            </p>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-zinc-900 lg:text-4xl">
              Resumen
            </h1>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {/* Agendar cita — conditional */}
            {allowOnlineBooking ? (
              <Link
                href={`/book/${slug}`}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{
                  backgroundColor: accent,
                  ["--tw-ring-color" as string]: accent,
                }}
              >
                <Plus className="h-4 w-4" />
                Agendar cita
              </Link>
            ) : (
              <button
                onClick={handleBookingClick}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{
                  backgroundColor: accent,
                  ["--tw-ring-color" as string]: accent,
                }}
              >
                <PhoneCall className="h-4 w-4" />
                Agendar cita
              </button>
            )}

            {/* Profile */}
            <button
              onClick={() => setShowProfile(true)}
              aria-label="Mi perfil"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-600 shadow-sm ring-1 ring-black/5 transition hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-zinc-400"
            >
              {patient?.first_name ? (
                <span
                  className="text-[13px] font-bold text-white"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%",
                    borderRadius: "9999px",
                    backgroundColor: accent,
                  }}
                >
                  {initials(
                    `${patient.first_name} ${patient.last_name || ""}`.trim()
                  )}
                </span>
              ) : (
                <UserIcon className="h-4 w-4" />
              )}
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="Salir"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-600 shadow-sm ring-1 ring-black/5 transition hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-zinc-400"
            >
              {loggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pt-5 lg:px-8 lg:pt-6">
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 lg:mb-8"
        >
          <h2 className="text-[22px] font-semibold tracking-tight text-zinc-900 lg:text-3xl">
            Hola, {patient?.first_name || "paciente"}
          </h2>
          {settings?.portal_welcome_message && (
            <p className="mt-1 max-w-prose text-[15px] leading-snug text-zinc-500 lg:text-base">
              {settings.portal_welcome_message}
            </p>
          )}
        </motion.div>

        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8">
          {/* ── MAIN COLUMN ── */}
          <div className="min-w-0">
        {/* Summary tiles (mobile only — on desktop they live in the sidebar) */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6 lg:hidden"
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
              onClick={
                nextAppointment
                  ? () => setDetailAppt(nextAppointment)
                  : undefined
              }
            />
            <SummaryTile
              icon={Activity}
              iconColor="#FF9500"
              label="Citas completadas"
              value={String(stats.completed)}
              sub={stats.completed === 1 ? "visita" : "visitas"}
              onClick={
                past.length > 0
                  ? () => {
                      setTab("historial");
                      setHistoryFilter("completed");
                    }
                  : undefined
              }
            />
            <SummaryTile
              icon={History}
              iconColor="#AF52DE"
              label="Última visita"
              value={stats.lastVisit ? formatShortDate(stats.lastVisit) : "—"}
              sub={stats.lastVisit ? "completada" : "Primera vez"}
              onClick={
                past[0] ? () => setDetailAppt(past[0]) : undefined
              }
            />
            <SummaryTile
              icon={HeartPulse}
              iconColor="#34C759"
              label="Especialistas"
              value={String(stats.doctorCount)}
              sub={stats.doctorCount === 1 ? "doctor" : "doctores"}
              onClick={
                specialists.length > 0
                  ? () => setShowSpecialists(true)
                  : undefined
              }
            />
          </div>
        </motion.section>

        {/* Tabs — mobile only */}
        <div className="mb-4 lg:hidden">
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

        {/* Mobile: tab-driven. Desktop: show both sections stacked. */}
        <div className="lg:hidden">
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
                    onOpen={() => setDetailAppt(nextAppointment)}
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
                        onOpen={() => setDetailAppt(appt)}
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
                  className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5"
                >
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF3B30]/10">
                    <Calendar className="h-6 w-6 text-[#FF3B30]" />
                  </div>
                  <h3 className="text-[17px] font-semibold text-zinc-900">
                    Sin citas próximas
                  </h3>
                  <p className="mt-1 text-[14px] text-zinc-500">
                    Agenda una nueva cita en segundos
                  </p>
                  <Link
                    href={`/book/${slug}`}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-semibold text-white shadow-sm transition active:scale-95"
                    style={{ backgroundColor: accent }}
                  >
                    <CalendarPlus className="h-4 w-4" />
                    Agendar cita
                  </Link>
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
                <>
                  <HistoryFilterChips
                    value={historyFilter}
                    onChange={setHistoryFilter}
                    counts={historyCounts}
                  />
                  {pastByMonth.length === 0 ? (
                    <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
                      <p className="text-[14px] text-zinc-500">
                        No hay citas con ese filtro
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
                              onOpen={() => setDetailAppt(appt)}
                              divider={i < group.items.length - 1}
                              isPast
                            />
                          ))}
                        </div>
                      </section>
                    ))
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </div>

        {/* ── DESKTOP: both sections stacked (no tabs) ── */}
        <div className="hidden lg:block space-y-8">
          {/* Próxima cita hero */}
          {nextAppointment ? (
            <section>
              <h3 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
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
                onOpen={() => setDetailAppt(nextAppointment)}
              />
            </section>
          ) : (
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
                {allowOnlineBooking
                  ? "Agenda una nueva cita en segundos"
                  : "Contacta a la clínica para agendar"}
              </p>
              {allowOnlineBooking ? (
                <Link
                  href={`/book/${slug}`}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-95"
                  style={{ backgroundColor: accent }}
                >
                  <CalendarPlus className="h-4 w-4" />
                  Agendar cita
                </Link>
              ) : (
                <button
                  onClick={() => setShowContact(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-95"
                  style={{ backgroundColor: accent }}
                >
                  <PhoneCall className="h-4 w-4" />
                  Contactar clínica
                </button>
              )}
            </motion.div>
          )}

          {/* Programadas */}
          {restUpcoming.length > 0 && (
            <section>
              <h3 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
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
                    onOpen={() => setDetailAppt(appt)}
                    divider={i < restUpcoming.length - 1}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Historial */}
          {past.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Historial
                </h3>
              </div>
              <HistoryFilterChips
                value={historyFilter}
                onChange={setHistoryFilter}
                counts={historyCounts}
              />
              {pastByMonth.length === 0 ? (
                <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
                  <p className="text-[14px] text-zinc-500">
                    No hay citas con ese filtro
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {pastByMonth.map((group) => (
                    <div key={group.key}>
                      <h4 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        {group.label}
                      </h4>
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
                            onOpen={() => setDetailAppt(appt)}
                            divider={i < group.items.length - 1}
                            isPast
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
          </div>

          {/* ── DESKTOP SIDEBAR ── */}
          <aside className="hidden lg:block">
            <div className="lg:sticky lg:top-28 space-y-4">
              {/* Summary tiles */}
              <div>
                <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Resumen
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <SummaryTile
                    icon={CalendarCheck}
                    iconColor="#FF3B30"
                    label="Próxima"
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
                    onClick={
                      nextAppointment
                        ? () => setDetailAppt(nextAppointment)
                        : undefined
                    }
                  />
                  <SummaryTile
                    icon={Activity}
                    iconColor="#FF9500"
                    label="Completadas"
                    value={String(stats.completed)}
                    sub={stats.completed === 1 ? "visita" : "visitas"}
                  />
                  <SummaryTile
                    icon={History}
                    iconColor="#AF52DE"
                    label="Última"
                    value={
                      stats.lastVisit ? formatShortDate(stats.lastVisit) : "—"
                    }
                    sub={stats.lastVisit ? "completada" : "Primera vez"}
                    onClick={
                      past[0] ? () => setDetailAppt(past[0]) : undefined
                    }
                  />
                  <SummaryTile
                    icon={HeartPulse}
                    iconColor="#34C759"
                    label="Doctores"
                    value={String(stats.doctorCount)}
                    sub={stats.doctorCount === 1 ? "doctor" : "doctores"}
                    onClick={
                      specialists.length > 0
                        ? () => setShowSpecialists(true)
                        : undefined
                    }
                  />
                </div>
              </div>

              {/* Mi perfil card */}
              {patient && (
                <button
                  onClick={() => setShowProfile(true)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-zinc-400"
                >
                  <div
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white"
                    style={{ backgroundColor: accent }}
                  >
                    {initials(
                      `${patient.first_name} ${patient.last_name || ""}`.trim()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-zinc-900">
                      {patient.first_name} {patient.last_name}
                    </p>
                    <p className="truncate text-[12px] text-zinc-500">
                      Ver y editar mi perfil
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-zinc-300" />
                </button>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* Mobile FAB — shown only when header button is hidden (< sm) */}
      {allowOnlineBooking ? (
        <Link
          href={`/book/${slug}`}
          aria-label="Agendar nueva cita"
          className="fixed bottom-5 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-3 text-[14px] font-semibold text-white shadow-lg transition active:scale-95 sm:hidden"
          style={{
            backgroundColor: accent,
            boxShadow: `0 10px 30px -8px ${accent}80`,
          }}
        >
          <Plus className="h-4 w-4" />
          Agendar cita
        </Link>
      ) : (
        <button
          onClick={() => setShowContact(true)}
          aria-label="Contactar clínica para agendar"
          className="fixed bottom-5 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-3 text-[14px] font-semibold text-white shadow-lg transition active:scale-95 sm:hidden"
          style={{
            backgroundColor: accent,
            boxShadow: `0 10px 30px -8px ${accent}80`,
          }}
        >
          <PhoneCall className="h-4 w-4" />
          Agendar cita
        </button>
      )}

      {/* Sheets */}
      <AppointmentDetailSheet
        appointment={detailAppt}
        org={org}
        accent={accent}
        allowCancel={settings?.portal_allow_cancel || false}
        cancellingId={cancellingId}
        confirmCancel={confirmCancel}
        onConfirmCancel={setConfirmCancel}
        onCancel={handleCancel}
        onClose={() => {
          setDetailAppt(null);
          setConfirmCancel(null);
        }}
      />

      <SpecialistsSheet
        open={showSpecialists}
        onClose={() => setShowSpecialists(false)}
        specialists={specialists}
      />

      <ProfileSheet
        open={showProfile}
        onClose={() => setShowProfile(false)}
        patient={patient}
        accent={accent}
        slug={slug}
        onUpdate={(updated) =>
          setPatient((p) => (p ? { ...p, ...updated } : p))
        }
      />

      <ContactSheet
        open={showContact}
        onClose={() => setShowContact(false)}
        contact={contact}
        org={org}
        accent={accent}
      />
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
  onClick,
}: {
  icon: typeof Calendar;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  onClick?: () => void;
}) {
  const content = (
    <>
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
    </>
  );
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-black/5 transition active:scale-[0.98]"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      {content}
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
  onOpen,
}: {
  appointment: Appointment;
  accent: string;
  allowCancel: boolean;
  cancellingId: string | null;
  confirmCancel: string | null;
  onConfirmCancel: (id: string | null) => void;
  onCancel: (id: string) => void;
  onOpen: () => void;
}) {
  const label = getDateLabel(appointment.appointment_date);
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
      {/* Gradient banner */}
      <button
        type="button"
        onClick={onOpen}
        className="block w-full px-5 pt-5 pb-4 text-left transition active:opacity-80"
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
      </button>

      {/* Details */}
      <button
        type="button"
        onClick={onOpen}
        className="block w-full divide-y divide-black/5 text-left"
      >
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
      </button>

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
  onOpen,
  divider,
  isPast = false,
}: {
  appointment: Appointment;
  allowCancel: boolean;
  confirmCancel: string | null;
  cancellingId: string | null;
  onConfirmCancel: (id: string | null) => void;
  onCancel: (id: string) => void;
  onOpen: () => void;
  divider: boolean;
  isPast?: boolean;
}) {
  const label = getDateLabel(appointment.appointment_date);
  const cfg = statusConfig[appointment.status] || statusConfig.scheduled;
  return (
    <div className={divider ? "border-b border-black/5" : ""}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-black/5"
      >
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
      </button>

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

function HistoryFilterChips({
  value,
  onChange,
  counts,
}: {
  value: "all" | StatusKey;
  onChange: (v: "all" | StatusKey) => void;
  counts: Record<string, number>;
}) {
  const options: { key: "all" | StatusKey; label: string; color: string }[] = [
    { key: "all", label: "Todas", color: "#1C1C1E" },
    { key: "completed", label: "Completadas", color: "#34C759" },
    { key: "cancelled", label: "Canceladas", color: "#FF3B30" },
    { key: "no_show", label: "No asistió", color: "#FF9500" },
  ];
  return (
    <div className="-mx-5 mb-4 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-2">
        {options.map((opt) => {
          const count = counts[opt.key] || 0;
          const active = value === opt.key;
          if (opt.key !== "all" && count === 0) return null;
          return (
            <button
              key={opt.key}
              onClick={() => onChange(opt.key)}
              className="flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition active:scale-95"
              style={{
                backgroundColor: active ? opt.color : "white",
                color: active ? "white" : opt.color,
                boxShadow: active
                  ? `0 2px 8px -2px ${opt.color}60`
                  : "inset 0 0 0 1px rgb(0 0 0 / 0.06)",
              }}
            >
              {opt.label}
              <span className="ml-1 opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const on = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const panel = isDesktop
    ? {
        initial: { x: "100%" },
        animate: { x: 0 },
        exit: { x: "100%" },
        className:
          "fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto rounded-l-3xl bg-[#F2F2F7] shadow-2xl",
      }
    : {
        initial: { y: "100%" },
        animate: { y: 0 },
        exit: { y: "100%" },
        className:
          "fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[90vh] max-w-md overflow-y-auto rounded-t-3xl bg-[#F2F2F7] shadow-2xl",
      };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <motion.div
            initial={panel.initial}
            animate={panel.animate}
            exit={panel.exit}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={panel.className}
            role="dialog"
            aria-modal="true"
          >
            {/* Drag handle — hidden on desktop */}
            <div className="sticky top-0 z-10 flex justify-center bg-gradient-to-b from-[#F2F2F7] to-transparent pt-3 pb-2 lg:hidden">
              <div className="h-1 w-10 rounded-full bg-zinc-300" />
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function AppointmentDetailSheet({
  appointment,
  org,
  accent,
  allowCancel,
  cancellingId,
  confirmCancel,
  onConfirmCancel,
  onCancel,
  onClose,
}: {
  appointment: Appointment | null;
  org: OrgInfo | null;
  accent: string;
  allowCancel: boolean;
  cancellingId: string | null;
  confirmCancel: string | null;
  onConfirmCancel: (id: string | null) => void;
  onCancel: (id: string) => void;
  onClose: () => void;
}) {
  const open = !!appointment;
  const cfg = appointment
    ? statusConfig[appointment.status] || statusConfig.scheduled
    : null;
  const label = appointment ? getDateLabel(appointment.appointment_date) : null;
  const canCancel =
    !!appointment &&
    allowCancel &&
    ["scheduled", "confirmed"].includes(appointment.status);

  const handleAddToCalendar = () => {
    if (!appointment) return;
    const [y, m, d] = appointment.appointment_date.split("-").map(Number);
    const [sh, sm] = appointment.start_time.split(":").map(Number);
    const [eh, em] = appointment.end_time.split(":").map(Number);
    const pad = (n: number) => String(n).padStart(2, "0");
    const start = `${y}${pad(m)}${pad(d)}T${pad(sh)}${pad(sm)}00`;
    const end = `${y}${pad(m)}${pad(d)}T${pad(eh)}${pad(em)}00`;
    const title = [
      appointment.services?.name || "Cita médica",
      org?.name,
    ]
      .filter(Boolean)
      .join(" — ");
    const description = [
      appointment.doctors?.full_name
        ? `Doctor: ${appointment.doctors.full_name}${
            appointment.doctors.specialty
              ? ` (${appointment.doctors.specialty})`
              : ""
          }`
        : null,
      appointment.services?.name ? `Servicio: ${appointment.services.name}` : null,
      appointment.notes ? `Notas: ${appointment.notes}` : null,
    ]
      .filter(Boolean)
      .join("\\n");
    const location = appointment.offices?.name || "";
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Yenda//Portal//ES",
      "BEGIN:VEVENT",
      `UID:${appointment.id}@yenda.app`,
      `DTSTAMP:${start}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cita-${appointment.appointment_date}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const originLabel = (origin: string | null | undefined) => {
    if (!origin) return "—";
    const map: Record<string, string> = {
      portal: "Portal del paciente",
      whatsapp: "WhatsApp",
      manual: "Manual (recepción)",
      booking: "Reserva en línea",
      online: "Reserva en línea",
    };
    return map[origin] || origin;
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      {appointment && cfg && (
        <div className="pb-6">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-3">
            <h2 className="text-[20px] font-bold tracking-tight text-zinc-900">
              Detalle de cita
            </h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200/70 text-zinc-600 active:scale-95"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Banner */}
          <div className="mx-5 mb-4 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
            <div
              className="px-5 py-4"
              style={{
                background: `linear-gradient(135deg, ${accent}14 0%, ${accent}06 100%)`,
              }}
            >
              <div className="flex items-center gap-1.5">
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
              <p className="mt-2 text-[17px] font-bold capitalize text-zinc-900">
                {formatFullDate(appointment.appointment_date)}
              </p>
              <p className="text-[14px] text-zinc-600">
                {formatTime(appointment.start_time)} —{" "}
                {formatTime(appointment.end_time)}
                {appointment.services && (
                  <span className="text-zinc-400">
                    {" · "}
                    {appointment.services.duration_minutes} min
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="mx-5 mb-4 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
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
              <div className="border-t border-black/5">
                <DetailRow
                  icon={FileText}
                  iconColor="#007AFF"
                  title={appointment.services.name}
                  subtitle={`Servicio · ${appointment.services.duration_minutes} min`}
                />
              </div>
            )}
            {appointment.offices && (
              <div className="border-t border-black/5">
                <DetailRow
                  icon={MapPin}
                  iconColor="#FF3B30"
                  title={appointment.offices.name}
                  subtitle="Consultorio"
                />
              </div>
            )}
            {appointment.price_snapshot != null && (
              <div className="border-t border-black/5">
                <DetailRow
                  icon={DollarSign}
                  iconColor="#34C759"
                  title={`S/ ${Number(appointment.price_snapshot).toFixed(2)}`}
                  subtitle="Precio"
                />
              </div>
            )}
            <div className="border-t border-black/5">
              <DetailRow
                icon={MessageSquare}
                iconColor="#AF52DE"
                title={originLabel(appointment.origin)}
                subtitle="Origen de la cita"
              />
            </div>
          </div>

          {/* Notes */}
          {appointment.notes && (
            <div className="mx-5 mb-4">
              <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Notas
              </h3>
              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="flex gap-3">
                  <StickyNote className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#FF9500]" />
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-700">
                    {appointment.notes}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mx-5 space-y-2">
            <button
              onClick={handleAddToCalendar}
              className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-black/5 transition active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#007AFF]/15">
                  <CalendarPlus className="h-4 w-4 text-[#007AFF]" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-zinc-900">
                    Añadir al calendario
                  </p>
                  <p className="text-[12px] text-zinc-500">
                    Descarga archivo .ics
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-300" />
            </button>

            {canCancel && (
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <AnimatePresence mode="wait" initial={false}>
                  {confirmCancel === appointment.id ? (
                    <motion.div
                      key="confirm"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-3"
                    >
                      <p className="text-[13px] text-zinc-600">
                        ¿Seguro que deseas cancelar esta cita?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => onConfirmCancel(null)}
                          className="flex-1 rounded-full bg-zinc-200/70 px-4 py-2 text-[13px] font-semibold text-zinc-700 active:scale-95"
                        >
                          No, mantener
                        </button>
                        <button
                          onClick={() => onCancel(appointment.id)}
                          disabled={cancellingId === appointment.id}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#FF3B30] px-4 py-2 text-[13px] font-semibold text-white shadow-sm active:scale-95"
                        >
                          {cancellingId === appointment.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Ban className="h-3.5 w-3.5" />
                          )}
                          Cancelar cita
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="btn"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => onConfirmCancel(appointment.id)}
                      className="flex w-full items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FF3B30]/15">
                          <Ban className="h-4 w-4 text-[#FF3B30]" />
                        </div>
                        <div>
                          <p className="text-[14px] font-semibold text-[#FF3B30]">
                            Cancelar cita
                          </p>
                          <p className="text-[12px] text-zinc-500">
                            La clínica será notificada
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-zinc-300" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function SpecialistsSheet({
  open,
  onClose,
  specialists,
}: {
  open: boolean;
  onClose: () => void;
  specialists: {
    name: string;
    specialty: string | null;
    count: number;
    photo: string | null;
  }[];
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="pb-8">
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-[20px] font-bold tracking-tight text-zinc-900">
            Mis especialistas
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200/70 text-zinc-600 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mx-5 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
          {specialists.map((s, i) => (
            <div
              key={s.name}
              className={`flex items-center gap-3 px-4 py-3 ${
                i < specialists.length - 1 ? "border-b border-black/5" : ""
              }`}
            >
              {s.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.photo}
                  alt={s.name}
                  className="h-10 w-10 rounded-full object-cover ring-1 ring-black/5"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5856D6] text-[13px] font-bold text-white">
                  {initials(s.name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-zinc-900">
                  {s.name}
                </p>
                <p className="truncate text-[12px] text-zinc-500">
                  {s.specialty || "Especialista"}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-[16px] font-bold text-zinc-900">
                  {s.count}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                  {s.count === 1 ? "cita" : "citas"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}

function ProfileSheet({
  open,
  onClose,
  patient,
  accent,
  slug,
  onUpdate,
}: {
  open: boolean;
  onClose: () => void;
  patient: PatientInfo | null;
  accent: string;
  slug: string;
  onUpdate: (patch: Partial<PatientInfo>) => void;
}) {
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue, setPhoneValue] = useState(patient?.portal_phone || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPhoneValue(patient?.portal_phone || "");
    setEditingPhone(false);
    setError(null);
  }, [patient, open]);

  const savePhone = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, portal_phone: phoneValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al guardar");
        return;
      }
      onUpdate({ portal_phone: data.portal_phone });
      setEditingPhone(false);
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const fullName = patient
    ? `${patient.first_name} ${patient.last_name || ""}`.trim()
    : "";

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="pb-8">
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-[20px] font-bold tracking-tight text-zinc-900">
            Mi perfil
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200/70 text-zinc-600 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Hero */}
        <div className="mx-5 mb-4 flex flex-col items-center rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full text-[26px] font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            {fullName ? initials(fullName) : "—"}
          </div>
          <p className="mt-3 text-[17px] font-bold text-zinc-900">
            {fullName || "—"}
          </p>
        </div>

        {/* Fields */}
        <div className="mx-5 mb-4 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
          <ProfileField
            icon={IdCard}
            iconColor="#5856D6"
            label="DNI"
            value={patient?.dni || "—"}
            locked
          />
          <div className="border-t border-black/5">
            <ProfileField
              icon={Mail}
              iconColor="#007AFF"
              label="Email"
              value={patient?.portal_email || "—"}
              locked
              hint="Usado para iniciar sesión"
            />
          </div>
          <div className="border-t border-black/5 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#34C759]/15">
                <Phone className="h-4 w-4 text-[#34C759]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Teléfono
                </p>
                {editingPhone ? (
                  <>
                    <input
                      type="tel"
                      value={phoneValue}
                      onChange={(e) => setPhoneValue(e.target.value)}
                      placeholder="+51 ..."
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[14px] outline-none focus:border-[#34C759]"
                      autoFocus
                    />
                    {error && (
                      <p className="mt-1 text-[12px] text-[#FF3B30]">
                        {error}
                      </p>
                    )}
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          setEditingPhone(false);
                          setPhoneValue(patient?.portal_phone || "");
                          setError(null);
                        }}
                        className="flex-1 rounded-full bg-zinc-200/70 px-3 py-1.5 text-[12px] font-semibold text-zinc-700 active:scale-95"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={savePhone}
                        disabled={saving}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-[#34C759] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm active:scale-95"
                      >
                        {saving ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Guardar
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-[14px] text-zinc-900">
                    {patient?.portal_phone || (
                      <span className="text-zinc-400">Sin teléfono</span>
                    )}
                  </p>
                )}
              </div>
              {!editingPhone && (
                <button
                  onClick={() => setEditingPhone(true)}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 active:scale-95"
                  aria-label="Editar teléfono"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="px-6 text-center text-[11px] text-zinc-400">
          Para cambiar nombre, DNI o email, comunícate con tu clínica.
        </p>
      </div>
    </BottomSheet>
  );
}

function ProfileField({
  icon: Icon,
  iconColor,
  label,
  value,
  locked,
  hint,
}: {
  icon: typeof Calendar;
  iconColor: string;
  label: string;
  value: string;
  locked?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: iconColor + "1F" }}
      >
        <Icon className="h-4 w-4" style={{ color: iconColor }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
          {locked && <span className="ml-1 text-zinc-300">·</span>}
        </p>
        <p className="truncate text-[14px] text-zinc-900">{value}</p>
        {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
      </div>
    </div>
  );
}

function ContactSheet({
  open,
  onClose,
  contact,
  org,
  accent,
}: {
  open: boolean;
  onClose: () => void;
  contact: ClinicContact;
  org: OrgInfo | null;
  accent: string;
}) {
  const digits = (contact.phone || "").replace(/[^\d]/g, "");
  const waHref = digits ? `https://wa.me/${digits}` : null;
  const telHref = contact.phone ? `tel:${contact.phone}` : null;
  const mailHref = contact.email ? `mailto:${contact.email}` : null;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="pb-8">
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="text-[20px] font-bold tracking-tight text-zinc-900">
            Agendar una cita
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200/70 text-zinc-600 transition hover:bg-zinc-300 active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-5 mb-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <p className="text-[14px] leading-relaxed text-zinc-700">
            Para agendar una nueva cita en{" "}
            <span className="font-semibold text-zinc-900">{org?.name}</span>,
            comunícate con la clínica por cualquiera de estos canales.
          </p>
        </div>

        <div className="mx-5 space-y-2">
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5 transition hover:shadow-md active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366]/15">
                  <MessageSquare className="h-4 w-4 text-[#25D366]" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-zinc-900">
                    WhatsApp
                  </p>
                  <p className="text-[12px] text-zinc-500">{contact.phone}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-300" />
            </a>
          )}

          {telHref && (
            <a
              href={telHref}
              className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5 transition hover:shadow-md active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#007AFF]/15">
                  <PhoneCall className="h-4 w-4 text-[#007AFF]" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-zinc-900">
                    Llamar
                  </p>
                  <p className="text-[12px] text-zinc-500">{contact.phone}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-300" />
            </a>
          )}

          {mailHref && (
            <a
              href={mailHref}
              className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5 transition hover:shadow-md active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#AF52DE]/15">
                  <Mail className="h-4 w-4 text-[#AF52DE]" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-zinc-900">
                    Email
                  </p>
                  <p className="text-[12px] text-zinc-500">{contact.email}</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-300" />
            </a>
          )}

          {!waHref && !telHref && !mailHref && (
            <div className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
              <p className="text-[14px] text-zinc-500">
                La clínica aún no ha configurado sus datos de contacto.
              </p>
            </div>
          )}
        </div>

        <p
          className="mt-4 px-6 text-center text-[11px]"
          style={{ color: accent }}
        >
          Las reservas se gestionan directamente con la clínica.
        </p>
      </div>
    </BottomSheet>
  );
}

function PortalSkeleton() {
  return (
    <div className="min-h-screen bg-[#F2F2F7] pb-16">
      {/* Header skeleton */}
      <header className="sticky top-0 z-20 border-b border-black/5 bg-[#F2F2F7]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-5 pt-6 pb-3 lg:px-8 lg:pt-8">
          <div>
            <div className="mb-2 h-3 w-24 animate-pulse rounded bg-zinc-200" />
            <div className="h-7 w-36 animate-pulse rounded bg-zinc-200 lg:h-9 lg:w-44" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-10 animate-pulse rounded-full bg-zinc-200" />
            <div className="h-10 w-10 animate-pulse rounded-full bg-zinc-200" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 pt-5 lg:px-8">
        <div className="mb-5 h-7 w-44 animate-pulse rounded bg-zinc-200" />
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8">
          <div>
            <div className="mb-6 grid grid-cols-2 gap-3 lg:hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-white" />
              ))}
            </div>
            <div className="mb-4 h-10 w-full animate-pulse rounded-2xl bg-zinc-200 lg:hidden" />
            <div className="h-48 animate-pulse rounded-3xl bg-white" />
            <div className="mt-4 h-32 animate-pulse rounded-2xl bg-white" />
          </div>
          <aside className="hidden lg:block">
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-white" />
              ))}
            </div>
            <div className="mt-4 h-16 animate-pulse rounded-2xl bg-white" />
          </aside>
        </div>
      </main>
    </div>
  );
}
