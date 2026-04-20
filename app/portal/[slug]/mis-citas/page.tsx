"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  MapPin,
  Stethoscope,
  Loader2,
  LogOut,
  XCircle,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Ban,
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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

const statusConfig: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  scheduled: {
    label: "Programada",
    color: "text-blue-400 bg-blue-500/10",
    icon: Calendar,
  },
  confirmed: {
    label: "Confirmada",
    color: "text-emerald-400 bg-emerald-500/10",
    icon: CheckCircle2,
  },
  completed: {
    label: "Completada",
    color: "text-zinc-400 bg-zinc-500/10",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "Cancelada",
    color: "text-red-400 bg-red-500/10",
    icon: XCircle,
  },
  no_show: {
    label: "No asistió",
    color: "text-amber-400 bg-amber-500/10",
    icon: AlertCircle,
  },
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
  const [showPast, setShowPast] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const nextAppointment = upcoming[0] || null;
  const restUpcoming = upcoming.slice(1);

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {org?.logo_url ? (
              <img
                src={org.logo_url}
                alt={org.name}
                className="h-8 w-8 rounded-lg object-cover"
              />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: accent + "20" }}
              >
                <Calendar className="h-4 w-4" style={{ color: accent }} />
              </div>
            )}
            <div>
              <h1 className="text-sm font-semibold leading-tight">
                Mis Citas
              </h1>
              <p className="text-xs text-zinc-500">{org?.name}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            {loggingOut ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            Salir
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-6">
        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h2 className="text-xl font-bold">
            Hola, {patient?.first_name || "paciente"} 👋
          </h2>
          {settings?.portal_welcome_message && (
            <p className="mt-1 text-sm text-zinc-400">
              {settings.portal_welcome_message}
            </p>
          )}
        </motion.div>

        {/* Next appointment — hero card */}
        {nextAppointment && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6"
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Próxima cita
            </p>
            <div
              className="rounded-2xl border p-5"
              style={{
                borderColor: accent + "40",
                backgroundColor: accent + "08",
              }}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {getDateLabel(nextAppointment.appointment_date) && (
                      <span
                        className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{
                          backgroundColor: accent + "20",
                          color: accent,
                        }}
                      >
                        {getDateLabel(nextAppointment.appointment_date)}
                      </span>
                    )}
                    <StatusBadge status={nextAppointment.status} />
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-zinc-500" />
                    <span className="capitalize">
                      {formatDate(nextAppointment.appointment_date)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-zinc-500" />
                    <span>
                      {formatTime(nextAppointment.start_time)} —{" "}
                      {formatTime(nextAppointment.end_time)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Stethoscope className="h-4 w-4 text-zinc-500" />
                    <span>
                      {nextAppointment.doctors?.full_name}
                      {nextAppointment.doctors?.specialty && (
                        <span className="text-zinc-500">
                          {" "}
                          · {nextAppointment.doctors.specialty}
                        </span>
                      )}
                    </span>
                  </div>
                  {nextAppointment.services && (
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-zinc-500" />
                      <span>{nextAppointment.services.name}</span>
                    </div>
                  )}
                  {nextAppointment.offices && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-zinc-500" />
                      <span>{nextAppointment.offices.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Cancel button */}
              {settings?.portal_allow_cancel &&
                ["scheduled", "confirmed"].includes(
                  nextAppointment.status
                ) && (
                  <div className="mt-4 border-t pt-3" style={{ borderColor: accent + "20" }}>
                    <AnimatePresence mode="wait">
                      {confirmCancel === nextAppointment.id ? (
                        <motion.div
                          key="confirm"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-2"
                        >
                          <p className="text-xs text-zinc-400">
                            ¿Seguro que deseas cancelar esta cita?
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                handleCancel(nextAppointment.id)
                              }
                              disabled={cancellingId === nextAppointment.id}
                              className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30 transition-colors"
                            >
                              {cancellingId === nextAppointment.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Ban className="h-3 w-3" />
                              )}
                              Sí, cancelar
                            </button>
                            <button
                              onClick={() => setConfirmCancel(null)}
                              className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
                            >
                              No, mantener
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.button
                          key="cancel-btn"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          onClick={() =>
                            setConfirmCancel(nextAppointment.id)
                          }
                          className="text-xs text-zinc-400 hover:text-red-400 transition-colors"
                        >
                          Cancelar esta cita
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                )}
            </div>
          </motion.div>
        )}

        {/* Rest upcoming */}
        {restUpcoming.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6"
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Próximas citas
            </p>
            <div className="space-y-2">
              {restUpcoming.map((appt) => (
                <AppointmentCard
                  key={appt.id}
                  appointment={appt}
                  accent={accent}
                  allowCancel={settings?.portal_allow_cancel || false}
                  confirmCancel={confirmCancel}
                  cancellingId={cancellingId}
                  onConfirmCancel={setConfirmCancel}
                  onCancel={handleCancel}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {upcoming.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center"
          >
            <Calendar className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
            <h3 className="font-medium text-zinc-300">
              No tienes citas próximas
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Comunícate con tu clínica para agendar una cita
            </p>
          </motion.div>
        )}

        {/* Past appointments */}
        {past.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <button
              onClick={() => setShowPast(!showPast)}
              className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              <span>Historial de citas ({past.length})</span>
              {showPast ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            <AnimatePresence>
              {showPast && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 space-y-2 overflow-hidden"
                >
                  {past.map((appt) => (
                    <AppointmentCard
                      key={appt.id}
                      appointment={appt}
                      accent={accent}
                      allowCancel={false}
                      confirmCancel={null}
                      cancellingId={null}
                      onConfirmCancel={() => {}}
                      onCancel={() => {}}
                      isPast
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.scheduled;
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.color}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function AppointmentCard({
  appointment,
  accent,
  allowCancel,
  confirmCancel,
  cancellingId,
  onConfirmCancel,
  onCancel,
  isPast = false,
}: {
  appointment: Appointment;
  accent: string;
  allowCancel: boolean;
  confirmCancel: string | null;
  cancellingId: string | null;
  onConfirmCancel: (id: string | null) => void;
  onCancel: (id: string) => void;
  isPast?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 ${
        isPast ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <StatusBadge status={appointment.status} />
            {!isPast && getDateLabel(appointment.appointment_date) && (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: accent + "20", color: accent }}
              >
                {getDateLabel(appointment.appointment_date)}
              </span>
            )}
          </div>

          <p className="text-sm capitalize">
            {formatDate(appointment.appointment_date)}
          </p>
          <p className="text-sm text-zinc-400">
            {formatTime(appointment.start_time)} —{" "}
            {formatTime(appointment.end_time)}
          </p>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <Stethoscope className="h-3 w-3" />
              {appointment.doctors?.full_name}
            </span>
            {appointment.services && (
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {appointment.services.name}
              </span>
            )}
            {appointment.offices && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {appointment.offices.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cancel */}
      {allowCancel &&
        !isPast &&
        ["scheduled", "confirmed"].includes(appointment.status) && (
          <div className="mt-3 border-t border-zinc-800 pt-2">
            <AnimatePresence mode="wait">
              {confirmCancel === appointment.id ? (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2"
                >
                  <button
                    onClick={() => onCancel(appointment.id)}
                    disabled={cancellingId === appointment.id}
                    className="flex items-center gap-1 rounded-lg bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    {cancellingId === appointment.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Ban className="h-3 w-3" />
                    )}
                    Confirmar
                  </button>
                  <button
                    onClick={() => onConfirmCancel(null)}
                    className="text-xs text-zinc-500 hover:text-white transition-colors"
                  >
                    No
                  </button>
                </motion.div>
              ) : (
                <motion.button
                  key="btn"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => onConfirmCancel(appointment.id)}
                  className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
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
