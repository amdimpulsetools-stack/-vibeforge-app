// Datos de clínica — mock para desarrollo
// Reemplaza las consultas a Supabase cuando estén disponibles

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed";
export type GlobalVariableType = "text" | "number" | "boolean" | "color";

export interface Doctor {
  id: string;
  name: string;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DoctorSchedule {
  id: string;
  doctor_id: string;
  day_of_week: DayOfWeek;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BreakTime {
  id: string;
  doctor_id: string | null; // null = global
  name: string;
  start_time: string;
  end_time: string;
  day_of_week: DayOfWeek | null; // null = todos los días
  is_recurring: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  doctor_id: string;
  service_id: string;
  patient_name: string;
  patient_phone: string | null;
  patient_email: string | null;
  appointment_date: string; // "YYYY-MM-DD"
  start_time: string;        // "HH:MM"
  end_time: string;          // "HH:MM"
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface GlobalVariable {
  id: string;
  key: string;
  value: string;
  type: GlobalVariableType;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ----------------------------------------------------------------
// Mock Data
// ----------------------------------------------------------------

export const MOCK_DOCTORS: Doctor[] = [
  {
    id: "doc-1",
    name: "Dr. Carlos García",
    specialty: "Medicina General",
    email: "garcia@clinica.com",
    phone: "+1 555-0101",
    avatar_url: null,
    color: "#10b981",
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "doc-2",
    name: "Dra. Ana Martínez",
    specialty: "Cardiología",
    email: "martinez@clinica.com",
    phone: "+1 555-0102",
    avatar_url: null,
    color: "#6366f1",
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "doc-3",
    name: "Dr. Pedro López",
    specialty: "Pediatría",
    email: "lopez@clinica.com",
    phone: "+1 555-0103",
    avatar_url: null,
    color: "#f59e0b",
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

export const MOCK_SERVICES: Service[] = [
  {
    id: "svc-1",
    name: "Consulta General",
    description: "Consulta médica de atención primaria",
    duration_minutes: 30,
    price: 50,
    color: "#10b981",
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "svc-2",
    name: "Electrocardiograma",
    description: "ECG estándar de 12 derivaciones",
    duration_minutes: 60,
    price: 120,
    color: "#6366f1",
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "svc-3",
    name: "Ecocardiograma",
    description: "Ecografía cardíaca",
    duration_minutes: 60,
    price: 200,
    color: "#ec4899",
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "svc-4",
    name: "Control Pediátrico",
    description: "Control de niño sano",
    duration_minutes: 45,
    price: 60,
    color: "#f59e0b",
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "svc-5",
    name: "Vacunación",
    description: "Aplicación de vacunas pediátricas",
    duration_minutes: 20,
    price: 30,
    color: "#14b8a6",
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "svc-6",
    name: "Radiografía",
    description: "Radiografía digital",
    duration_minutes: 30,
    price: 80,
    color: "#8b5cf6",
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

// doctor_id → service_ids asignados
export const MOCK_DOCTOR_SERVICES: Record<string, string[]> = {
  "doc-1": ["svc-1", "svc-6"],           // García: Consulta + Radiografía
  "doc-2": ["svc-2", "svc-3", "svc-6"],  // Martínez: ECG + Eco + Radiografía
  "doc-3": ["svc-1", "svc-4", "svc-5"],  // López: Consulta + Control Pediátrico + Vacunación
};

// Horarios de doctores: día de la semana (1=Lunes … 6=Sábado, 0=Domingo)
export const MOCK_DOCTOR_SCHEDULES: DoctorSchedule[] = [
  // Dr. García — Lun a Vie 08:00-18:00
  { id: "sch-1", doctor_id: "doc-1", day_of_week: 1, start_time: "08:00", end_time: "18:00", is_active: true, created_at: "", updated_at: "" },
  { id: "sch-2", doctor_id: "doc-1", day_of_week: 2, start_time: "08:00", end_time: "18:00", is_active: true, created_at: "", updated_at: "" },
  { id: "sch-3", doctor_id: "doc-1", day_of_week: 3, start_time: "08:00", end_time: "18:00", is_active: true, created_at: "", updated_at: "" },
  { id: "sch-4", doctor_id: "doc-1", day_of_week: 4, start_time: "08:00", end_time: "18:00", is_active: true, created_at: "", updated_at: "" },
  { id: "sch-5", doctor_id: "doc-1", day_of_week: 5, start_time: "08:00", end_time: "18:00", is_active: true, created_at: "", updated_at: "" },

  // Dra. Martínez — Lun, Mié, Vie 09:00-17:00
  { id: "sch-6", doctor_id: "doc-2", day_of_week: 1, start_time: "09:00", end_time: "17:00", is_active: true, created_at: "", updated_at: "" },
  { id: "sch-7", doctor_id: "doc-2", day_of_week: 3, start_time: "09:00", end_time: "17:00", is_active: true, created_at: "", updated_at: "" },
  { id: "sch-8", doctor_id: "doc-2", day_of_week: 5, start_time: "09:00", end_time: "17:00", is_active: true, created_at: "", updated_at: "" },

  // Dr. López — Mar, Jue, Sáb 08:00-16:00
  { id: "sch-9",  doctor_id: "doc-3", day_of_week: 2, start_time: "08:00", end_time: "16:00", is_active: true, created_at: "", updated_at: "" },
  { id: "sch-10", doctor_id: "doc-3", day_of_week: 4, start_time: "08:00", end_time: "16:00", is_active: true, created_at: "", updated_at: "" },
  { id: "sch-11", doctor_id: "doc-3", day_of_week: 6, start_time: "08:00", end_time: "16:00", is_active: true, created_at: "", updated_at: "" },
];

export const MOCK_BREAK_TIMES: BreakTime[] = [
  // Break global — almuerzo todos los días
  {
    id: "brk-1",
    doctor_id: null,
    name: "Almuerzo",
    start_time: "13:00",
    end_time: "14:00",
    day_of_week: null,
    is_recurring: true,
    is_active: true,
    created_at: "",
    updated_at: "",
  },
  // Break Dr. García — pausa mañana
  {
    id: "brk-2",
    doctor_id: "doc-1",
    name: "Pausa Mañana",
    start_time: "10:30",
    end_time: "10:45",
    day_of_week: null,
    is_recurring: true,
    is_active: true,
    created_at: "",
    updated_at: "",
  },
  // Break Dra. Martínez — pausa tarde
  {
    id: "brk-3",
    doctor_id: "doc-2",
    name: "Pausa Tarde",
    start_time: "15:00",
    end_time: "15:20",
    day_of_week: null,
    is_recurring: true,
    is_active: true,
    created_at: "",
    updated_at: "",
  },
];

// Tipo de cita enriquecida para el calendario (camelCase para UI)
export interface CalendarAppointment {
  id: string;
  patientName: string;
  serviceName: string;
  serviceColor: string;
  doctorName: string;
  doctorColor: string;
  date: string;       // "YYYY-MM-DD"
  startTime: string;  // "HH:MM"
  endTime: string;    // "HH:MM"
  status: string;
}

// Helper: obtener appointments enriquecidos con nombre de doctor y servicio
export function enrichAppointments(
  appointments: Appointment[],
  doctors: Doctor[],
  services: Service[]
): CalendarAppointment[] {
  return appointments.map((appt) => {
    const doctor = doctors.find((d) => d.id === appt.doctor_id);
    const service = services.find((s) => s.id === appt.service_id);
    return {
      id: appt.id,
      patientName: appt.patient_name,
      date: appt.appointment_date,
      startTime: appt.start_time,
      endTime: appt.end_time,
      status: appt.status,
      doctorName: doctor?.name ?? "Doctor desconocido",
      doctorColor: doctor?.color ?? "#10b981",
      serviceName: service?.name ?? "Servicio desconocido",
      serviceColor: service?.color ?? "#10b981",
    };
  });
}

// Helper: obtener días disponibles de un doctor (array de day_of_week)
export function getDoctorAvailableDays(doctorId: string, schedules: DoctorSchedule[]): DayOfWeek[] {
  return schedules
    .filter((s) => s.doctor_id === doctorId && s.is_active)
    .map((s) => s.day_of_week);
}

// Helper: obtener breaks aplicables a un día y opcionalmente doctor
export function getBreaksForDay(
  dayOfWeek: DayOfWeek,
  breakTimes: BreakTime[],
  doctorId?: string
) {
  return breakTimes.filter(
    (b) =>
      b.is_active &&
      (b.day_of_week === null || b.day_of_week === dayOfWeek) &&
      (b.doctor_id === null || b.doctor_id === doctorId)
  );
}

// Helper: obtener servicios de un doctor
export function getServicesForDoctor(
  doctorId: string,
  doctorServices: Record<string, string[]>,
  services: Service[]
): Service[] {
  const serviceIds = doctorServices[doctorId] ?? [];
  return services.filter((s) => serviceIds.includes(s.id) && s.is_active);
}

export const MOCK_APPOINTMENTS: Appointment[] = [
  {
    id: "apt-1",
    doctor_id: "doc-1",
    service_id: "svc-1",
    patient_name: "María González",
    patient_phone: "+1 555-1001",
    patient_email: "maria@email.com",
    appointment_date: "2026-02-23",
    start_time: "09:00",
    end_time: "09:30",
    status: "confirmed",
    notes: null,
    created_at: "2026-02-20T00:00:00Z",
    updated_at: "2026-02-20T00:00:00Z",
  },
  {
    id: "apt-2",
    doctor_id: "doc-1",
    service_id: "svc-6",
    patient_name: "Juan Pérez",
    patient_phone: "+1 555-1002",
    patient_email: null,
    appointment_date: "2026-02-23",
    start_time: "10:00",
    end_time: "10:30",
    status: "pending",
    notes: "Paciente con historial de alergias",
    created_at: "2026-02-20T00:00:00Z",
    updated_at: "2026-02-20T00:00:00Z",
  },
  {
    id: "apt-3",
    doctor_id: "doc-2",
    service_id: "svc-2",
    patient_name: "Roberto Sánchez",
    patient_phone: "+1 555-1003",
    patient_email: "roberto@email.com",
    appointment_date: "2026-02-23",
    start_time: "09:30",
    end_time: "10:30",
    status: "confirmed",
    notes: null,
    created_at: "2026-02-20T00:00:00Z",
    updated_at: "2026-02-20T00:00:00Z",
  },
  {
    id: "apt-4",
    doctor_id: "doc-3",
    service_id: "svc-4",
    patient_name: "Sofía Ramírez",
    patient_phone: "+1 555-1004",
    patient_email: null,
    appointment_date: "2026-02-24",
    start_time: "08:00",
    end_time: "08:45",
    status: "confirmed",
    notes: "Control 6 meses",
    created_at: "2026-02-20T00:00:00Z",
    updated_at: "2026-02-20T00:00:00Z",
  },
  {
    id: "apt-5",
    doctor_id: "doc-1",
    service_id: "svc-1",
    patient_name: "Luis Torres",
    patient_phone: null,
    patient_email: "luis@email.com",
    appointment_date: "2026-02-24",
    start_time: "11:00",
    end_time: "11:30",
    status: "pending",
    notes: null,
    created_at: "2026-02-20T00:00:00Z",
    updated_at: "2026-02-20T00:00:00Z",
  },
  {
    id: "apt-6",
    doctor_id: "doc-2",
    service_id: "svc-3",
    patient_name: "Elena Vargas",
    patient_phone: "+1 555-1006",
    patient_email: "elena@email.com",
    appointment_date: "2026-02-25",
    start_time: "14:00",
    end_time: "15:00",
    status: "confirmed",
    notes: null,
    created_at: "2026-02-20T00:00:00Z",
    updated_at: "2026-02-20T00:00:00Z",
  },
];

export const MOCK_GLOBAL_VARIABLES: GlobalVariable[] = [
  {
    id: "gv-1",
    key: "clinic_name",
    value: "Clínica Salud Total",
    type: "text",
    description: "Nombre de la clínica",
    sort_order: 0,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "gv-2",
    key: "clinic_phone",
    value: "+1 555-0100",
    type: "text",
    description: "Teléfono principal de la clínica",
    sort_order: 1,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "gv-3",
    key: "appointment_duration_default",
    value: "30",
    type: "number",
    description: "Duración por defecto de citas (minutos)",
    sort_order: 2,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "gv-4",
    key: "primary_color",
    value: "#10b981",
    type: "color",
    description: "Color primario de la interfaz",
    sort_order: 3,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "gv-5",
    key: "send_reminders",
    value: "true",
    type: "boolean",
    description: "Enviar recordatorios de cita por email",
    sort_order: 4,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "gv-6",
    key: "clinic_address",
    value: "Av. Principal 123, Ciudad",
    type: "text",
    description: "Dirección física de la clínica",
    sort_order: 5,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "gv-7",
    key: "max_appointments_per_day",
    value: "20",
    type: "number",
    description: "Máximo de citas por día",
    sort_order: 6,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];
