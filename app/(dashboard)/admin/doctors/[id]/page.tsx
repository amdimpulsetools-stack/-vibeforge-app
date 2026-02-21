"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Clock, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MOCK_DOCTORS,
  MOCK_SERVICES,
  MOCK_DOCTOR_SERVICES,
  MOCK_DOCTOR_SCHEDULES,
  type DayOfWeek,
  type DoctorSchedule,
} from "@/lib/clinic-data";
import { toast } from "sonner";

const ALL_DAYS: { dow: DayOfWeek; label: string; short: string }[] = [
  { dow: 1, label: "Lunes",     short: "Lun" },
  { dow: 2, label: "Martes",    short: "Mar" },
  { dow: 3, label: "Miércoles", short: "Mié" },
  { dow: 4, label: "Jueves",    short: "Jue" },
  { dow: 5, label: "Viernes",   short: "Vie" },
  { dow: 6, label: "Sábado",    short: "Sáb" },
  { dow: 0, label: "Domingo",   short: "Dom" },
];

type TabId = "info" | "horario" | "servicios";

export default function DoctorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const doctor = MOCK_DOCTORS.find((d) => d.id === id);
  if (!doctor) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Doctor no encontrado</p>
        <button
          onClick={() => router.push("/admin/doctors")}
          className="mt-4 text-sm text-primary underline"
        >
          Volver al listado
        </button>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<TabId>("info");

  // Info
  const [name, setName] = useState(doctor.name);
  const [specialty, setSpecialty] = useState(doctor.specialty ?? "");
  const [email, setEmail] = useState(doctor.email ?? "");
  const [phone, setPhone] = useState(doctor.phone ?? "");
  const [color, setColor] = useState(doctor.color);

  // Horario — inicializar con datos del mock
  const initialSchedule = ALL_DAYS.reduce(
    (acc, { dow }) => {
      const existing = MOCK_DOCTOR_SCHEDULES.find(
        (s) => s.doctor_id === id && s.day_of_week === dow
      );
      acc[dow] = {
        is_active: existing?.is_active ?? false,
        start_time: existing?.start_time ?? "08:00",
        end_time: existing?.end_time ?? "18:00",
      };
      return acc;
    },
    {} as Record<number, { is_active: boolean; start_time: string; end_time: string }>
  );
  const [schedule, setSchedule] = useState(initialSchedule);

  // Servicios asignados
  const assignedServiceIds = MOCK_DOCTOR_SERVICES[id] ?? [];
  const [selectedServices, setSelectedServices] = useState<Set<string>>(
    new Set(assignedServiceIds)
  );

  function toggleDay(dow: DayOfWeek) {
    setSchedule((prev) => ({
      ...prev,
      [dow]: { ...prev[dow], is_active: !prev[dow].is_active },
    }));
  }

  function updateScheduleTime(
    dow: DayOfWeek,
    field: "start_time" | "end_time",
    value: string
  ) {
    setSchedule((prev) => ({
      ...prev,
      [dow]: { ...prev[dow], [field]: value },
    }));
  }

  function toggleService(serviceId: string) {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.add(serviceId);
      }
      return next;
    });
  }

  function handleSave() {
    // En producción: llamar a Supabase para persistir cambios
    toast.success("Cambios guardados correctamente");
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "info",      label: "Información" },
    { id: "horario",   label: "Horario" },
    { id: "servicios", label: "Servicios" },
  ];

  const activeDaysCount = Object.values(schedule).filter((s) => s.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/admin/doctors")}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl text-white font-bold text-lg"
            style={{ backgroundColor: color }}
          >
            {name.split(" ").pop()?.[0] ?? "D"}
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">{doctor.name}</h1>
            {specialty && (
              <p className="text-sm text-muted-foreground">{specialty}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleSave}
          className="ml-auto flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Save className="h-4 w-4" />
          Guardar cambios
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              activeTab === tab.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Información */}
      {activeTab === "info" && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Nombre completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Especialidad</label>
              <input
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground">Teléfono</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Color identificador</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border border-border bg-background p-1"
              />
              <span className="text-sm text-muted-foreground">{color}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Horario */}
      {activeTab === "horario" && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground">Días de atención</h2>
              <p className="text-sm text-muted-foreground">
                Define qué días y en qué horario atiende el doctor
              </p>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {activeDaysCount} día{activeDaysCount !== 1 ? "s" : ""} activo{activeDaysCount !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-2">
            {ALL_DAYS.map(({ dow, label }) => {
              const dayData = schedule[dow];
              return (
                <div
                  key={dow}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-xl border p-4 transition-colors",
                    dayData.is_active
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-muted/20"
                  )}
                >
                  {/* Toggle día */}
                  <button
                    type="button"
                    onClick={() => toggleDay(dow)}
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-all",
                      dayData.is_active
                        ? "text-white shadow-sm"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    )}
                    style={dayData.is_active ? { backgroundColor: color } : undefined}
                  >
                    {dayData.is_active ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      label.slice(0, 2)
                    )}
                  </button>

                  <span
                    className={cn(
                      "w-28 text-sm font-semibold",
                      dayData.is_active ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {label}
                  </span>

                  {/* Horarios */}
                  <div
                    className={cn(
                      "flex items-center gap-2 transition-opacity",
                      !dayData.is_active && "pointer-events-none opacity-40"
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <input
                        type="time"
                        value={dayData.start_time}
                        onChange={(e) =>
                          updateScheduleTime(dow, "start_time", e.target.value)
                        }
                        className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                      />
                    </div>
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="time"
                      value={dayData.end_time}
                      onChange={(e) =>
                        updateScheduleTime(dow, "end_time", e.target.value)
                      }
                      className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    />
                  </div>

                  {!dayData.is_active && (
                    <span className="ml-auto text-xs text-muted-foreground">Sin atención</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Servicios */}
      {activeTab === "servicios" && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-foreground">Servicios habilitados</h2>
            <p className="text-sm text-muted-foreground">
              Solo los servicios marcados estarán disponibles al reservar citas con este doctor
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {MOCK_SERVICES.filter((s) => s.is_active).map((service) => {
              const isSelected = selectedServices.has(service.id);
              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => toggleService(service.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-4 text-left transition-all",
                    isSelected
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:border-border/80 hover:bg-accent/50"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                      isSelected ? "text-white" : "bg-muted text-muted-foreground"
                    )}
                    style={isSelected ? { backgroundColor: service.color } : undefined}
                  >
                    {isSelected ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span className="text-xs font-bold">
                        {service.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={cn("text-sm font-semibold", isSelected ? "text-foreground" : "text-muted-foreground")}>
                      {service.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{service.duration_minutes} min</span>
                      {service.price && <span>· ${service.price}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            {selectedServices.size} servicio{selectedServices.size !== 1 ? "s" : ""} seleccionado{selectedServices.size !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
