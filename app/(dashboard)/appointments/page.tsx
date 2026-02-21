"use client";

import { useState } from "react";
import {
  format,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  LayoutGrid,
  X,
  Clock,
  User,
  Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WeekView } from "@/components/calendar/week-view";
import { DayView } from "@/components/calendar/day-view";
import type { CalendarAppointment } from "@/lib/clinic-data";
import { BookingForm } from "@/components/appointments/booking-form";
import {
  MOCK_APPOINTMENTS,
  MOCK_DOCTORS,
  MOCK_SERVICES,
  MOCK_BREAK_TIMES,
  enrichAppointments,
  type Appointment,
} from "@/lib/clinic-data";
import { toast } from "sonner";

type ViewMode = "week" | "day";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  completed: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
};

export default function AppointmentsPage() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 1, 23)); // 23 Feb 2026
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<CalendarAppointment | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>(MOCK_APPOINTMENTS);

  // Enriquecer citas con nombres de doctor y servicio
  const enriched = enrichAppointments(appointments, MOCK_DOCTORS, MOCK_SERVICES);

  function navigate(direction: "prev" | "next") {
    if (viewMode === "week") {
      setCurrentDate((d) =>
        direction === "prev" ? subWeeks(d, 1) : addWeeks(d, 1)
      );
    } else {
      setCurrentDate((d) =>
        direction === "prev" ? subDays(d, 1) : addDays(d, 1)
      );
    }
  }

  function goToToday() {
    setCurrentDate(new Date());
  }

  function getHeaderTitle(): string {
    if (viewMode === "week") {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      const startStr = format(weekStart, "d MMM", { locale: es });
      const endStr = format(weekEnd, "d MMM yyyy", { locale: es });
      return `${startStr} – ${endStr}`;
    }
    return format(currentDate, "EEEE, d MMMM yyyy", { locale: es });
  }

  function handleSlotClick(date: string, time: string) {
    setSelectedSlot({ date, time });
    setShowBookingForm(true);
  }

  function handleSaveAppointment(
    apptData: Omit<Appointment, "id" | "created_at" | "updated_at">
  ) {
    const newAppt: Appointment = {
      ...apptData,
      id: `apt-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setAppointments((prev) => [...prev, newAppt]);
    setShowBookingForm(false);
    setSelectedSlot(null);
    toast.success("Cita guardada correctamente");
  }

  return (
    <div className="flex h-full flex-col space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Citas</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {getHeaderTitle()}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Navegación */}
          <div className="flex items-center rounded-lg border border-border bg-card">
            <button
              onClick={() => navigate("prev")}
              className="flex h-9 w-9 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goToToday}
              className="border-x border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
            >
              Hoy
            </button>
            <button
              onClick={() => navigate("next")}
              className="flex h-9 w-9 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Toggle vista */}
          <div className="flex items-center rounded-lg border border-border bg-card p-1">
            <button
              onClick={() => setViewMode("week")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                viewMode === "week"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Semana
            </button>
            <button
              onClick={() => setViewMode("day")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                viewMode === "day"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Día
            </button>
          </div>

          {/* Nueva cita */}
          <button
            onClick={() => setShowBookingForm(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nueva cita
          </button>
        </div>
      </div>

      {/* Leyenda breaks */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-amber-300/80 dark:bg-amber-700/80" />
          <span>Descanso / Break</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-primary/30" />
          <span>Cita</span>
        </div>
      </div>

      {/* Vista de calendario */}
      <div className="flex-1 min-h-0">
        {viewMode === "week" ? (
          <WeekView
            currentDate={currentDate}
            appointments={enriched}
            breakTimes={MOCK_BREAK_TIMES}
            onAppointmentClick={setSelectedAppointment}
            onSlotClick={handleSlotClick}
          />
        ) : (
          <DayView
            currentDate={currentDate}
            appointments={enriched}
            breakTimes={MOCK_BREAK_TIMES}
            onAppointmentClick={setSelectedAppointment}
            onSlotClick={handleSlotClick}
          />
        )}
      </div>

      {/* Modal: Detalle de cita */}
      {selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-lg font-bold">Detalle de Cita</h3>
              <button
                onClick={() => setSelectedAppointment(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              {/* Nombre servicio destacado */}
              <div
                className="flex items-center gap-3 rounded-xl p-4"
                style={{
                  backgroundColor: `${selectedAppointment.serviceColor}15`,
                  borderLeft: `4px solid ${selectedAppointment.serviceColor}`,
                }}
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Servicio
                  </p>
                  <p
                    className="text-lg font-bold"
                    style={{ color: selectedAppointment.serviceColor }}
                  >
                    {selectedAppointment.serviceName}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <User className="h-3 w-3" /> Paciente
                  </p>
                  <p className="text-sm font-semibold">{selectedAppointment.patientName}</p>
                </div>
                <div className="space-y-1">
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Stethoscope className="h-3 w-3" /> Doctor
                  </p>
                  <p className="text-sm font-semibold">{selectedAppointment.doctorName}</p>
                </div>
                <div className="space-y-1">
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Clock className="h-3 w-3" /> Horario
                  </p>
                  <p className="text-sm font-semibold">
                    {selectedAppointment.startTime} – {selectedAppointment.endTime}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Estado
                  </p>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                      STATUS_COLORS[selectedAppointment.status]
                    )}
                  >
                    {STATUS_LABELS[selectedAppointment.status]}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-border px-6 py-4">
              <button
                onClick={() => setSelectedAppointment(null)}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Formulario de nueva cita */}
      {showBookingForm && (
        <BookingForm
          initialDate={selectedSlot?.date}
          initialTime={selectedSlot?.time}
          onClose={() => {
            setShowBookingForm(false);
            setSelectedSlot(null);
          }}
          onSave={handleSaveAppointment}
        />
      )}
    </div>
  );
}
