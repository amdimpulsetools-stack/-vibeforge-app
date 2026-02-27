import type { Database } from "./database";

// Organization types
export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type OrganizationInsert = Database["public"]["Tables"]["organizations"]["Insert"];
export type OrganizationUpdate = Database["public"]["Tables"]["organizations"]["Update"];

export type OrganizationMember = Database["public"]["Tables"]["organization_members"]["Row"];
export type OrganizationMemberInsert = Database["public"]["Tables"]["organization_members"]["Insert"];
export type OrgRole = "owner" | "admin" | "member";

// Aliases de tabla
export type Office = Database["public"]["Tables"]["offices"]["Row"];
export type OfficeInsert = Database["public"]["Tables"]["offices"]["Insert"];
export type OfficeUpdate = Database["public"]["Tables"]["offices"]["Update"];

export type ServiceCategory = Database["public"]["Tables"]["service_categories"]["Row"];
export type ServiceCategoryInsert = Database["public"]["Tables"]["service_categories"]["Insert"];
export type ServiceCategoryUpdate = Database["public"]["Tables"]["service_categories"]["Update"];

export type Service = Database["public"]["Tables"]["services"]["Row"];
export type ServiceInsert = Database["public"]["Tables"]["services"]["Insert"];
export type ServiceUpdate = Database["public"]["Tables"]["services"]["Update"];

export type Doctor = Database["public"]["Tables"]["doctors"]["Row"];
export type DoctorInsert = Database["public"]["Tables"]["doctors"]["Insert"];
export type DoctorUpdate = Database["public"]["Tables"]["doctors"]["Update"];

export type DoctorService = Database["public"]["Tables"]["doctor_services"]["Row"];
export type DoctorSchedule = Database["public"]["Tables"]["doctor_schedules"]["Row"];
export type DoctorScheduleInsert = Database["public"]["Tables"]["doctor_schedules"]["Insert"];

export type Appointment = Database["public"]["Tables"]["appointments"]["Row"];
export type AppointmentInsert = Database["public"]["Tables"]["appointments"]["Insert"];
export type AppointmentUpdate = Database["public"]["Tables"]["appointments"]["Update"];

export type Patient = Database["public"]["Tables"]["patients"]["Row"];
export type PatientInsert = Database["public"]["Tables"]["patients"]["Insert"];
export type PatientUpdate = Database["public"]["Tables"]["patients"]["Update"];

export type PatientTag = Database["public"]["Tables"]["patient_tags"]["Row"];
export type PatientTagInsert = Database["public"]["Tables"]["patient_tags"]["Insert"];

export type PatientPayment = Database["public"]["Tables"]["patient_payments"]["Row"];
export type PatientPaymentInsert = Database["public"]["Tables"]["patient_payments"]["Insert"];
export type PatientPaymentUpdate = Database["public"]["Tables"]["patient_payments"]["Update"];

// Appointment con relaciones para el scheduler
export type AppointmentWithRelations = Appointment & {
  doctors: Doctor;
  offices: Office;
  services: Service;
  patients?: Patient | null;
};

// Patient con tags y relaciones
export type PatientWithTags = Patient & {
  patient_tags: PatientTag[];
};

// Patient con historial completo
export type PatientWithHistory = PatientWithTags & {
  appointments: (Appointment & {
    doctors: Doctor;
    services: Service;
    offices: Office;
  })[];
  patient_payments: PatientPayment[];
};

export type LookupCategory = Database["public"]["Tables"]["lookup_categories"]["Row"];
export type LookupValue = Database["public"]["Tables"]["lookup_values"]["Row"];
export type LookupValueInsert = Database["public"]["Tables"]["lookup_values"]["Insert"];
export type LookupValueUpdate = Database["public"]["Tables"]["lookup_values"]["Update"];

// Tipos compuestos para UI
export type DoctorWithServices = Doctor & {
  doctor_services: (DoctorService & { services: Service })[];
};

export type DoctorWithSchedules = Doctor & {
  doctor_schedules: DoctorSchedule[];
};

export type ServiceWithCategory = Service & {
  service_categories: ServiceCategory;
};

export type LookupCategoryWithValues = LookupCategory & {
  lookup_values: LookupValue[];
};

// Schedule block (bloqueo de horarios en el scheduler)
export type ScheduleBlock = {
  id: string;
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  office_id: string | null;
  all_day: boolean;
  reason: string | null;
  organization_id: string;
  created_at: string;
};

// Paleta de colores para doctores
export const DOCTOR_COLORS = [
  { label: "Azul", value: "#3b82f6" },
  { label: "Púrpura", value: "#8b5cf6" },
  { label: "Rosa", value: "#ec4899" },
  { label: "Rojo", value: "#ef4444" },
  { label: "Naranja", value: "#f97316" },
  { label: "Amarillo", value: "#eab308" },
  { label: "Verde", value: "#22c55e" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Cyan", value: "#06b6d4" },
  { label: "Índigo", value: "#6366f1" },
] as const;

// Opciones de duración
export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

// Slugs de lookup categories
export const LOOKUP_SLUGS = {
  ORIGIN: "origin",
  PAYMENT_METHOD: "payment_method",
  APPOINTMENT_STATUS: "appointment_status",
  RESPONSIBLE: "responsible",
} as const;

// Colores de estado de cita
export const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  scheduled: "#9ca3af",
  confirmed: "#3b82f6",
  completed: "#22c55e",
  cancelled: "#ef4444",
  no_show: "#f59e0b",
};

// Intervalos del scheduler
export const SCHEDULER_START_HOUR = 8;
export const SCHEDULER_END_HOUR = 20;
export const SCHEDULER_INTERVAL = 30;

// Días de la semana (lunes primero)
export const DAYS_OF_WEEK = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
] as const;

// Colores de estado de paciente
export const PATIENT_STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  inactive: "#9ca3af",
};

// Tags predefinidos comunes
export const COMMON_PATIENT_TAGS = [
  "VIP",
  "Fertilidad",
  "Gestante",
  "Control",
  "Cirugía",
  "Nuevo",
] as const;
