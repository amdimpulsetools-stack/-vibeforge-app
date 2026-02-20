import type { Database } from "./database";

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
