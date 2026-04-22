"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  FileText,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  MapPin,
  Stethoscope,
  AlertCircle,
  IdCard,
  Search,
  X,
} from "lucide-react";
import { useParams } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BookingOrg {
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  phone: string;
  email: string;
}

interface BookingSettings {
  max_advance_days: number;
  min_lead_hours: number;
  welcome_message: string | null;
  require_email: boolean;
  require_phone: boolean;
  require_dni: boolean;
  accent_color: string | null;
  portal_enabled: boolean;
}

interface BookingDoctor {
  id: string;
  full_name: string;
  specialty: string | null;
  photo_url: string | null;
  default_office_id: string | null;
}

interface BookingService {
  id: string;
  name: string;
  duration_minutes: number;
  base_price: number;
  modality: string | null;
}

interface BookingDoctorService {
  doctor_id: string;
  service_id: string;
}

interface BookingSchedule {
  doctor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface BookingOffice {
  id: string;
  name: string;
}

interface ExistingAppointment {
  doctor_id: string;
  office_id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
}

interface ScheduleBlock {
  office_id: string | null;
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
}

interface BookingData {
  organization: BookingOrg;
  booking_settings: BookingSettings;
  doctors: BookingDoctor[];
  services: BookingService[];
  doctor_services: BookingDoctorService[];
  schedules: BookingSchedule[];
  offices: BookingOffice[];
  existing_appointments: ExistingAppointment[];
  schedule_blocks: ScheduleBlock[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateTimeSlots(
  startTime: string,
  endTime: string,
  durationMinutes: number
): string[] {
  const slots: string[] = [];
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startTotal = startH * 60 + startM;
  const endTotal = endH * 60 + endM;

  for (let t = startTotal; t + durationMinutes <= endTotal; t += durationMinutes) {
    const h = Math.floor(t / 60);
    const m = t % 60;
    slots.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
  }
  return slots;
}

function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function getNext14Days(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

// ── Steps ─────────────────────────────────────────────────────────────────────

type BookingStep = "doctor" | "service" | "datetime" | "info" | "confirm" | "success";

// ── Main Component ────────────────────────────────────────────────────────────

export default function PublicBookingPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BookingData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<BookingStep>("doctor");

  // Form state
  const [selectedDoctor, setSelectedDoctor] = useState<string>("");
  const [selectedService, setSelectedService] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedOffice, setSelectedOffice] = useState<string>("");
  const [doctorSearch, setDoctorSearch] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState<string>("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dni, setDni] = useState("");
  const [notes, setNotes] = useState("");

  // Fetch booking data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/book/${slug}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "No se pudo cargar la información");
          return;
        }
        const json: BookingData = await res.json();
        setData(json);

        // Pre-pick an office so downstream logic has one. Exact office is
        // re-resolved per doctor once the patient picks one (see effect
        // below). The patient never sees this control.
        if (json.offices.length > 0) {
          setSelectedOffice(json.offices[0].id);
        }
      } catch {
        setError("Error de conexión");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug]);

  // Auto-resolve office when the doctor changes:
  // 1. doctor.default_office_id (if set and still active)
  // 2. first active office (alphabetical)
  // Patient never picks the office.
  useEffect(() => {
    if (!data || !selectedDoctor) return;
    const doc = data.doctors.find((d) => d.id === selectedDoctor);
    if (!doc) return;
    const defaultId = doc.default_office_id;
    const exists =
      defaultId && data.offices.some((o) => o.id === defaultId);
    const officeId = exists ? defaultId! : data.offices[0]?.id || "";
    if (officeId && officeId !== selectedOffice) {
      setSelectedOffice(officeId);
    }
  }, [selectedDoctor, data, selectedOffice]);

  const accentColor = data?.booking_settings.accent_color || "#10b981";

  // Unique specialties (for filter chips) — only shown if >= 2 distinct.
  const specialties = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    for (const d of data.doctors) {
      if (d.specialty) set.add(d.specialty);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);

  // Filtered doctor list (search + specialty filter).
  const displayedDoctors = useMemo(() => {
    if (!data) return [];
    const q = doctorSearch.trim().toLowerCase();
    return data.doctors.filter((d) => {
      if (specialtyFilter && d.specialty !== specialtyFilter) return false;
      if (!q) return true;
      const hay = `${d.full_name} ${d.specialty || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, doctorSearch, specialtyFilter]);

  // Derived data
  const doctorServiceIds = useMemo(() => {
    if (!selectedDoctor || !data) return new Set<string>();
    return new Set(
      data.doctor_services
        .filter((ds) => ds.doctor_id === selectedDoctor)
        .map((ds) => ds.service_id)
    );
  }, [selectedDoctor, data]);

  const filteredServices = useMemo(() => {
    if (!data) return [];
    return data.services.filter((s) => doctorServiceIds.has(s.id));
  }, [data, doctorServiceIds]);

  const selectedServiceObj = data?.services.find((s) => s.id === selectedService);
  const selectedDoctorObj = data?.doctors.find((d) => d.id === selectedDoctor);
  const selectedOfficeObj = data?.offices.find((o) => o.id === selectedOffice);
  const duration = selectedServiceObj?.duration_minutes || 30;

  // Available dates (based on doctor schedule)
  const availableDates = useMemo(() => {
    if (!data || !selectedDoctor) return [];
    const doctorDays = new Set(
      data.schedules
        .filter((s) => s.doctor_id === selectedDoctor)
        .map((s) => s.day_of_week)
    );
    const maxDays = data.booking_settings.max_advance_days;
    const dates: string[] = [];
    const today = new Date();

    for (let i = 0; i < maxDays && dates.length < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      if (doctorDays.has(d.getDay())) {
        dates.push(d.toISOString().split("T")[0]);
      }
    }
    return dates;
  }, [data, selectedDoctor]);

  // Available time slots for selected date
  const availableSlots = useMemo(() => {
    if (!data || !selectedDoctor || !selectedDate || !selectedService) return [];

    const dow = new Date(selectedDate + "T12:00:00").getDay();
    const schedule = data.schedules.find(
      (s) => s.doctor_id === selectedDoctor && s.day_of_week === dow
    );
    if (!schedule) return [];

    const allSlots = generateTimeSlots(
      schedule.start_time.slice(0, 5),
      schedule.end_time.slice(0, 5),
      duration
    );

    // Filter out occupied slots
    const now = new Date();
    const minLeadMs = data.booking_settings.min_lead_hours * 60 * 60 * 1000;

    return allSlots.filter((slot) => {
      const [slotH, slotM] = slot.split(":").map(Number);
      const slotEndMinutes = slotH * 60 + slotM + duration;
      const slotEnd = `${Math.floor(slotEndMinutes / 60).toString().padStart(2, "0")}:${(slotEndMinutes % 60).toString().padStart(2, "0")}`;

      // Check min lead time
      const slotDateTime = new Date(`${selectedDate}T${slot}:00`);
      if (slotDateTime.getTime() - now.getTime() < minLeadMs) return false;

      // Check doctor conflicts
      const hasConflict = data.existing_appointments.some(
        (a) =>
          a.appointment_date === selectedDate &&
          (a.doctor_id === selectedDoctor || a.office_id === selectedOffice) &&
          a.start_time.slice(0, 5) < slotEnd &&
          a.end_time.slice(0, 5) > slot
      );
      if (hasConflict) return false;

      // Check schedule blocks
      const hasBlock = data.schedule_blocks.some((b) => {
        if (b.block_date !== selectedDate) return false;
        if (b.office_id && b.office_id !== selectedOffice) return false;
        if (b.all_day) return true;
        if (b.start_time && b.end_time) {
          return b.start_time.slice(0, 5) < slotEnd && b.end_time.slice(0, 5) > slot;
        }
        return false;
      });
      if (hasBlock) return false;

      return true;
    });
  }, [data, selectedDoctor, selectedService, selectedDate, selectedOffice, duration]);

  // Date navigation
  const [datePageStart, setDatePageStart] = useState(0);
  const visibleDates = availableDates.slice(datePageStart, datePageStart + 7);

  const handleSubmit = useCallback(async () => {
    if (!data || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/book/${slug}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_first_name: firstName,
          patient_last_name: lastName,
          patient_phone: phone,
          patient_email: email,
          patient_dni: dni,
          doctor_id: selectedDoctor,
          service_id: selectedService,
          office_id: selectedOffice,
          appointment_date: selectedDate,
          start_time: selectedTime,
          notes,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Error al crear la cita");
        setSubmitting(false);
        return;
      }

      setStep("success");
    } catch {
      setError("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  }, [data, submitting, slug, firstName, lastName, phone, email, dni, selectedDoctor, selectedService, selectedOffice, selectedDate, selectedTime, notes]);

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  // ── Error state (no data) ───────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-xl font-semibold text-zinc-900 mb-2">No disponible</h1>
          <p className="text-zinc-500">{error || "Página de reserva no disponible"}</p>
        </div>
      </div>
    );
  }

  const org = data.organization;
  const settings = data.booking_settings;

  // ── Success state ───────────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full"
            style={{ backgroundColor: accentColor + "20" }}
          >
            <CheckCircle2 className="h-10 w-10" style={{ color: accentColor }} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Cita reservada</h1>
          <p className="text-zinc-500">
            Tu cita ha sido agendada exitosamente. {email ? "Te enviamos un correo de confirmación." : ""}
          </p>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-left space-y-2">
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <Stethoscope className="h-4 w-4 text-zinc-500" />
              {selectedDoctorObj?.full_name} — {selectedServiceObj?.name}
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <Calendar className="h-4 w-4 text-zinc-500" />
              {formatDateDisplay(selectedDate)}
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <Clock className="h-4 w-4 text-zinc-500" />
              {selectedTime} hrs
            </div>
            {org.address && (
              <div className="flex items-center gap-2 text-sm text-zinc-700">
                <MapPin className="h-4 w-4 text-zinc-500" />
                {org.address}
              </div>
            )}
          </div>
          {org.phone && (
            <p className="text-sm text-zinc-500">
              Consultas: {org.phone}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Step progress ───────────────────────────────────────────────────────────
  const steps: { key: BookingStep; label: string }[] = [
    { key: "doctor", label: "Doctor" },
    { key: "service", label: "Servicio" },
    { key: "datetime", label: "Fecha y hora" },
    { key: "info", label: "Tus datos" },
    { key: "confirm", label: "Confirmar" },
  ];
  const currentStepIdx = steps.findIndex((s) => s.key === step);

  const canGoNext = (): boolean => {
    switch (step) {
      case "doctor":
        return !!selectedDoctor;
      case "service":
        return !!selectedService && !!selectedOffice;
      case "datetime":
        return !!selectedDate && !!selectedTime;
      case "info":
        if (firstName.trim().length < 2 || lastName.trim().length < 2) return false;
        if (settings.require_email && !email) return false;
        if (settings.require_phone && !phone) return false;
        if (settings.require_dni && !dni) return false;
        return true;
      default:
        return true;
    }
  };

  const goNext = () => {
    const idx = currentStepIdx;
    if (idx < steps.length - 1) {
      setStep(steps[idx + 1].key);
    }
  };

  const goPrev = () => {
    const idx = currentStepIdx;
    if (idx > 0) {
      setStep(steps[idx - 1].key);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center gap-3">
          {org.logo_url ? (
            <img
              src={org.logo_url}
              alt={org.name}
              width={32}
              height={32}
              loading="lazy"
              decoding="async"
              className="h-8 w-8 rounded-lg object-cover"
            />
          ) : (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: accentColor }}
            >
              {org.name.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-sm font-semibold">{org.name}</h1>
            <p className="text-xs text-zinc-500">Reserva en línea</p>
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <div className="flex items-center gap-1">
          {steps.map((s, i) => (
            <div
              key={s.key}
              className="flex-1 h-1 rounded-full transition-colors"
              style={{
                backgroundColor:
                  i <= currentStepIdx ? accentColor : "rgb(63 63 70)",
              }}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Paso {currentStepIdx + 1} de {steps.length}: {steps[currentStepIdx].label}
        </p>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Welcome message (only on first step) */}
        {step === "doctor" && settings.welcome_message && (
          <p className="text-zinc-500 text-sm">{settings.welcome_message}</p>
        )}

        {/* ── Step: Doctor ─────────────────────────────────────────────── */}
        {step === "doctor" && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Selecciona un especialista</h2>

            {/* Search input */}
            {data.doctors.length > 3 && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={doctorSearch}
                  onChange={(e) => setDoctorSearch(e.target.value)}
                  placeholder="Buscar por nombre o especialidad"
                  className="w-full rounded-lg border border-zinc-300 bg-white py-2.5 pl-9 pr-9 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500"
                  style={{
                    ["--tw-ring-color" as string]: accentColor,
                  }}
                />
                {doctorSearch && (
                  <button
                    type="button"
                    onClick={() => setDoctorSearch("")}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Specialty filter chips */}
            {specialties.length >= 2 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSpecialtyFilter("")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                    specialtyFilter === ""
                      ? "text-white"
                      : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:ring-zinc-300"
                  }`}
                  style={
                    specialtyFilter === ""
                      ? { backgroundColor: accentColor }
                      : undefined
                  }
                >
                  Todas ({data.doctors.length})
                </button>
                {specialties.map((sp) => {
                  const count = data.doctors.filter(
                    (d) => d.specialty === sp
                  ).length;
                  const active = specialtyFilter === sp;
                  return (
                    <button
                      key={sp}
                      type="button"
                      onClick={() =>
                        setSpecialtyFilter(active ? "" : sp)
                      }
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                        active
                          ? "text-white"
                          : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:ring-zinc-300"
                      }`}
                      style={
                        active ? { backgroundColor: accentColor } : undefined
                      }
                    >
                      {sp} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {displayedDoctors.length === 0 && (
                <p className="col-span-full rounded-xl bg-white p-6 text-center text-sm text-zinc-500 ring-1 ring-zinc-200">
                  No se encontraron doctores con ese criterio.
                </p>
              )}
              {displayedDoctors.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => {
                    setSelectedDoctor(doc.id);
                    setSelectedService("");
                    setSelectedDate("");
                    setSelectedTime("");
                  }}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                    selectedDoctor === doc.id
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  }`}
                  style={
                    selectedDoctor === doc.id
                      ? {
                          borderColor: accentColor + "80",
                          backgroundColor: accentColor + "15",
                        }
                      : undefined
                  }
                >
                  {doc.photo_url ? (
                    <img
                      src={doc.photo_url}
                      alt={doc.full_name}
                      width={48}
                      height={48}
                      loading="lazy"
                      decoding="async"
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold"
                      style={{ backgroundColor: accentColor + "20", color: accentColor }}
                    >
                      {doc.full_name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-sm">{doc.full_name}</p>
                    {doc.specialty && (
                      <p className="text-xs text-zinc-500">{doc.specialty}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step: Service ────────────────────────────────────────────── */}
        {step === "service" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Selecciona un servicio</h2>
            <div className="space-y-2">
              {filteredServices.map((svc) => (
                <button
                  key={svc.id}
                  onClick={() => {
                    setSelectedService(svc.id);
                    setSelectedDate("");
                    setSelectedTime("");
                  }}
                  className={`w-full flex items-center justify-between rounded-xl border p-4 text-left transition-all ${
                    selectedService === svc.id
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  }`}
                  style={
                    selectedService === svc.id
                      ? {
                          borderColor: accentColor + "80",
                          backgroundColor: accentColor + "15",
                        }
                      : undefined
                  }
                >
                  <div>
                    <p className="font-medium text-sm">{svc.name}</p>
                    <p className="text-xs text-zinc-500">
                      {svc.duration_minutes} min
                      {svc.modality === "virtual" && " · Virtual"}
                      {svc.modality === "both" && " · Presencial / Virtual"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: accentColor }}>
                    S/. {Number(svc.base_price).toFixed(2)}
                  </span>
                </button>
              ))}
              {filteredServices.length === 0 && (
                <p className="text-sm text-zinc-500 text-center py-8">
                  Este doctor no tiene servicios asignados.
                </p>
              )}
            </div>

            {/* Office is resolved automatically from doctor.default_office_id
                (or fallback to first office) — patients do not pick rooms. */}
          </div>
        )}

        {/* ── Step: Date & Time ────────────────────────────────────────── */}
        {step === "datetime" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Elige fecha y hora</h2>

            {/* Date selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-zinc-700">Fecha</h3>
                <div className="flex gap-1">
                  <button
                    onClick={() => setDatePageStart(Math.max(0, datePageStart - 7))}
                    disabled={datePageStart === 0}
                    className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      setDatePageStart(
                        Math.min(availableDates.length - 7, datePageStart + 7)
                      )
                    }
                    disabled={datePageStart + 7 >= availableDates.length}
                    className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {visibleDates.map((date) => {
                  const d = new Date(date + "T12:00:00");
                  const dayName = d.toLocaleDateString("es-PE", { weekday: "short" });
                  const dayNum = d.getDate();
                  const monthName = d.toLocaleDateString("es-PE", { month: "short" });
                  return (
                    <button
                      key={date}
                      onClick={() => {
                        setSelectedDate(date);
                        setSelectedTime("");
                      }}
                      className={`flex flex-col items-center rounded-xl py-2.5 px-1 text-center transition-all ${
                        selectedDate === date
                          ? "text-white"
                          : "border border-zinc-200 bg-white hover:border-zinc-300 text-zinc-700"
                      }`}
                      style={
                        selectedDate === date
                          ? { backgroundColor: accentColor }
                          : undefined
                      }
                    >
                      <span className="text-[10px] uppercase opacity-70">
                        {dayName}
                      </span>
                      <span className="text-lg font-bold leading-tight">
                        {dayNum}
                      </span>
                      <span className="text-[10px] opacity-70">{monthName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time slots */}
            {selectedDate && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-zinc-700">
                  Horarios disponibles — {formatDateDisplay(selectedDate)}
                </h3>
                {availableSlots.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-6">
                    No hay horarios disponibles para esta fecha.
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {availableSlots.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => setSelectedTime(slot)}
                        className={`rounded-lg py-2.5 text-sm font-medium transition-all ${
                          selectedTime === slot
                            ? "text-white"
                            : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                        }`}
                        style={
                          selectedTime === slot
                            ? { backgroundColor: accentColor }
                            : undefined
                        }
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step: Patient Info ────────────────────────────────────────── */}
        {step === "info" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Tus datos</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  Nombres *
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500"
                  style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
                  placeholder="Juan"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  Apellidos *
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500"
                  placeholder="Pérez"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                Teléfono {settings.require_phone ? "*" : "(opcional)"}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500"
                placeholder="+51 999 999 999"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Email {settings.require_email ? "*" : "(opcional)"}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500"
                placeholder="correo@ejemplo.com"
              />
            </div>

            {settings.require_dni && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700 flex items-center gap-1.5">
                  <IdCard className="h-3.5 w-3.5" />
                  Documento de identidad *
                </label>
                <input
                  type="text"
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500"
                  placeholder="12345678"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Motivo de consulta (opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 resize-none"
                placeholder="Describe brevemente el motivo de tu consulta..."
              />
            </div>
          </div>
        )}

        {/* ── Step: Confirm ────────────────────────────────────────────── */}
        {step === "confirm" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Confirma tu reserva</h2>

            <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-800">
              <div className="p-4 flex items-center gap-3">
                <Stethoscope className="h-5 w-5 text-zinc-500" />
                <div>
                  <p className="text-sm font-medium">{selectedDoctorObj?.full_name}</p>
                  <p className="text-xs text-zinc-500">{selectedDoctorObj?.specialty}</p>
                </div>
              </div>
              <div className="p-4 flex items-center gap-3">
                <FileText className="h-5 w-5 text-zinc-500" />
                <div>
                  <p className="text-sm font-medium">{selectedServiceObj?.name}</p>
                  <p className="text-xs text-zinc-500">
                    {selectedServiceObj?.duration_minutes} min — S/.{" "}
                    {Number(selectedServiceObj?.base_price).toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="p-4 flex items-center gap-3">
                <Calendar className="h-5 w-5 text-zinc-500" />
                <p className="text-sm">{formatDateDisplay(selectedDate)}</p>
              </div>
              <div className="p-4 flex items-center gap-3">
                <Clock className="h-5 w-5 text-zinc-500" />
                <p className="text-sm">{selectedTime} hrs</p>
              </div>
              {selectedOfficeObj && (
                <div className="p-4 flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-zinc-500" />
                  <p className="text-sm">{selectedOfficeObj.name}</p>
                </div>
              )}
              <div className="p-4 flex items-center gap-3">
                <User className="h-5 w-5 text-zinc-500" />
                <div>
                  <p className="text-sm font-medium">
                    {firstName} {lastName}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {[phone, email].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Navigation buttons ───────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2">
            <button
              onClick={goPrev}
              disabled={currentStepIdx === 0}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm text-zinc-500 hover:text-zinc-900 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>

            {step === "confirm" ? (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: accentColor }}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar reserva
              </button>
            ) : (
              <button
                onClick={goNext}
                disabled={!canGoNext()}
                className="flex items-center gap-1.5 rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                style={{ backgroundColor: canGoNext() ? accentColor : undefined }}
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t border-zinc-200 py-6 text-center space-y-2">
        {settings.portal_enabled && (
          <a
            href={`/portal/${org.slug}`}
            className="inline-flex items-center gap-1.5 text-sm hover:underline transition-colors"
            style={{ color: accentColor }}
          >
            ¿Ya eres paciente? Entra a tu portal
          </a>
        )}
        <p className="text-xs text-zinc-600">
          Reserva en línea · {org.name}
        </p>
      </footer>
    </div>
  );
}
