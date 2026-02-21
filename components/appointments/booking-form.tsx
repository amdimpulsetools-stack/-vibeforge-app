"use client";

import { useState, useMemo } from "react";
import { format, getDay, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { X, AlertTriangle, Clock, User, Stethoscope, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MOCK_DOCTORS,
  MOCK_SERVICES,
  MOCK_DOCTOR_SERVICES,
  MOCK_DOCTOR_SCHEDULES,
  MOCK_BREAK_TIMES,
  getServicesForDoctor,
  getDoctorAvailableDays,
  type Appointment,
} from "@/lib/clinic-data";

const DAY_NAMES: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

interface BookingFormProps {
  initialDate?: string;
  initialTime?: string;
  onClose: () => void;
  onSave: (appointment: Omit<Appointment, "id" | "created_at" | "updated_at">) => void;
}

export function BookingForm({
  initialDate,
  initialTime,
  onClose,
  onSave,
}: BookingFormProps) {
  // Form state
  const [doctorId, setDoctorId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(
    initialDate ?? format(new Date(), "yyyy-MM-dd")
  );
  const [startTime, setStartTime] = useState(initialTime ?? "09:00");
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ============================================================
  // Requisito #3: Filtrar servicios por doctor seleccionado
  // ============================================================
  const availableServices = useMemo(() => {
    if (!doctorId) return [];
    return getServicesForDoctor(doctorId, MOCK_DOCTOR_SERVICES, MOCK_SERVICES);
  }, [doctorId]);

  // ============================================================
  // Requisito #4: Días disponibles del doctor seleccionado
  // ============================================================
  const availableDays = useMemo(() => {
    if (!doctorId) return [];
    return getDoctorAvailableDays(doctorId, MOCK_DOCTOR_SCHEDULES);
  }, [doctorId]);

  // Verificar si la fecha seleccionada es un día válido para el doctor
  const selectedDayOfWeek = appointmentDate
    ? getDay(parseISO(appointmentDate))
    : -1;
  const isDayValid = doctorId
    ? availableDays.includes(selectedDayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6)
    : true;

  // Horario del doctor para el día seleccionado
  const doctorScheduleForDay = useMemo(() => {
    if (!doctorId || !appointmentDate) return null;
    return MOCK_DOCTOR_SCHEDULES.find(
      (s) =>
        s.doctor_id === doctorId &&
        s.day_of_week === selectedDayOfWeek &&
        s.is_active
    ) ?? null;
  }, [doctorId, appointmentDate, selectedDayOfWeek]);

  // Calcular hora de fin basada en la duración del servicio
  const endTime = useMemo(() => {
    if (!serviceId || !startTime) return "";
    const service = MOCK_SERVICES.find((s) => s.id === serviceId);
    if (!service) return "";
    const [h, m] = startTime.split(":").map(Number);
    const totalMinutes = h * 60 + m + service.duration_minutes;
    const endH = Math.floor(totalMinutes / 60);
    const endM = totalMinutes % 60;
    return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  }, [serviceId, startTime]);

  // Nombre del doctor seleccionado
  const selectedDoctor = MOCK_DOCTORS.find((d) => d.id === doctorId);

  function handleDoctorChange(newDoctorId: string) {
    setDoctorId(newDoctorId);
    setServiceId(""); // resetear servicio al cambiar doctor
    setErrors((prev) => ({ ...prev, doctor: "", service: "" }));
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!doctorId) newErrors.doctor = "Selecciona un doctor";
    if (!serviceId) newErrors.service = "Selecciona un servicio";
    if (!patientName.trim()) newErrors.patientName = "El nombre del paciente es requerido";
    if (!appointmentDate) newErrors.date = "Selecciona una fecha";
    if (!startTime) newErrors.startTime = "Selecciona un horario";

    // Validar que el día sea disponible para el doctor
    if (doctorId && appointmentDate && !isDayValid) {
      newErrors.date = `El doctor no atiende los ${DAY_NAMES[selectedDayOfWeek]}. Días disponibles: ${availableDays
        .map((d) => DAY_NAMES[d])
        .join(", ")}`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    onSave({
      doctor_id: doctorId,
      service_id: serviceId,
      patient_name: patientName.trim(),
      patient_phone: patientPhone.trim() || null,
      patient_email: patientEmail.trim() || null,
      appointment_date: appointmentDate,
      start_time: startTime,
      end_time: endTime,
      status: "pending",
      notes: notes.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Nueva Cita</h2>
            <p className="text-sm text-muted-foreground">Reservar una cita médica</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* ============================================================
              DOCTOR — Requisito #3 y #4
              ============================================================ */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Stethoscope className="h-3.5 w-3.5 text-primary" />
              Doctor *
            </label>
            <select
              value={doctorId}
              onChange={(e) => handleDoctorChange(e.target.value)}
              className={cn(
                "w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors",
                "focus:border-primary focus:ring-1 focus:ring-primary",
                errors.doctor ? "border-destructive" : "border-border"
              )}
            >
              <option value="">Seleccionar doctor...</option>
              {MOCK_DOCTORS.filter((d) => d.is_active).map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name}
                  {doctor.specialty ? ` — ${doctor.specialty}` : ""}
                </option>
              ))}
            </select>
            {errors.doctor && (
              <p className="text-xs text-destructive">{errors.doctor}</p>
            )}

            {/* Días disponibles del doctor */}
            {doctorId && availableDays.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="text-[10px] text-muted-foreground mr-0.5">Atiende:</span>
                {availableDays.map((d) => (
                  <span
                    key={d}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                  >
                    {DAY_NAMES[d]}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ============================================================
              SERVICIO — filtrado por doctor (Requisito #3)
              ============================================================ */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <svg className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Servicio *
            </label>
            <select
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                setErrors((prev) => ({ ...prev, service: "" }));
              }}
              disabled={!doctorId}
              className={cn(
                "w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors",
                "focus:border-primary focus:ring-1 focus:ring-primary",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                errors.service ? "border-destructive" : "border-border"
              )}
            >
              <option value="">
                {!doctorId
                  ? "Primero selecciona un doctor"
                  : availableServices.length === 0
                  ? "Sin servicios asignados"
                  : "Seleccionar servicio..."}
              </option>
              {availableServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                  {service.duration_minutes ? ` (${service.duration_minutes} min)` : ""}
                  {service.price ? ` — $${service.price}` : ""}
                </option>
              ))}
            </select>
            {errors.service && (
              <p className="text-xs text-destructive">{errors.service}</p>
            )}
            {doctorId && availableServices.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Este doctor no tiene servicios asignados.
              </p>
            )}
          </div>

          {/* ============================================================
              PACIENTE
              ============================================================ */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <User className="h-3.5 w-3.5 text-primary" />
              Nombre del paciente *
            </label>
            <input
              type="text"
              value={patientName}
              onChange={(e) => {
                setPatientName(e.target.value);
                setErrors((prev) => ({ ...prev, patientName: "" }));
              }}
              placeholder="Ej: María González"
              className={cn(
                "w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground transition-colors",
                "focus:border-primary focus:ring-1 focus:ring-primary",
                errors.patientName ? "border-destructive" : "border-border"
              )}
            />
            {errors.patientName && (
              <p className="text-xs text-destructive">{errors.patientName}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Teléfono</label>
              <input
                type="tel"
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
                placeholder="+1 555-0000"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Email</label>
              <input
                type="email"
                value={patientEmail}
                onChange={(e) => setPatientEmail(e.target.value)}
                placeholder="correo@email.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
          </div>

          {/* ============================================================
              FECHA — validación contra horario del doctor (Requisito #4)
              ============================================================ */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <CalendarDays className="h-3.5 w-3.5 text-primary" />
              Fecha *
            </label>
            <input
              type="date"
              value={appointmentDate}
              onChange={(e) => {
                setAppointmentDate(e.target.value);
                setErrors((prev) => ({ ...prev, date: "" }));
              }}
              className={cn(
                "w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors",
                "focus:border-primary focus:ring-1 focus:ring-primary",
                errors.date || (doctorId && appointmentDate && !isDayValid)
                  ? "border-destructive"
                  : "border-border"
              )}
            />
            {errors.date && (
              <p className="text-xs text-destructive">{errors.date}</p>
            )}

            {/* Advertencia de día no disponible */}
            {doctorId && appointmentDate && !isDayValid && !errors.date && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <div>
                  <p className="text-xs font-medium text-destructive">
                    {selectedDoctor?.name} no atiende los {DAY_NAMES[selectedDayOfWeek]}.
                  </p>
                  <p className="mt-0.5 text-[11px] text-destructive/80">
                    Días disponibles:{" "}
                    {availableDays.map((d) => DAY_NAMES[d]).join(", ")}
                  </p>
                </div>
              </div>
            )}

            {/* Horario del doctor para el día seleccionado */}
            {doctorId && appointmentDate && isDayValid && doctorScheduleForDay && (
              <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs text-muted-foreground">
                  Horario:{" "}
                  <span className="font-semibold text-foreground">
                    {doctorScheduleForDay.start_time} – {doctorScheduleForDay.end_time}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* HORA */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Clock className="h-3.5 w-3.5 text-primary" />
                Hora de inicio *
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setErrors((prev) => ({ ...prev, startTime: "" }));
                }}
                min={doctorScheduleForDay?.start_time}
                max={doctorScheduleForDay?.end_time}
                className={cn(
                  "w-full rounded-lg border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors",
                  "focus:border-primary focus:ring-1 focus:ring-primary",
                  errors.startTime ? "border-destructive" : "border-border"
                )}
              />
              {errors.startTime && (
                <p className="text-xs text-destructive">{errors.startTime}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Hora de fin</label>
              <input
                type="time"
                value={endTime}
                readOnly
                className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground cursor-not-allowed"
              />
              {endTime && (
                <p className="text-[10px] text-muted-foreground">
                  Calculado por duración del servicio
                </p>
              )}
            </div>
          </div>

          {/* NOTAS */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones adicionales..."
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary resize-none transition-colors"
            />
          </div>

          {/* BOTONES */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              Guardar cita
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
