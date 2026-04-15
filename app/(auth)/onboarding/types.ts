// Shared types + constants for the onboarding wizard.

export interface Country {
  code: string;
  dial: string;
  flag: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: "PE", dial: "+51", flag: "🇵🇪", name: "Perú" },
  { code: "MX", dial: "+52", flag: "🇲🇽", name: "México" },
  { code: "CO", dial: "+57", flag: "🇨🇴", name: "Colombia" },
  { code: "AR", dial: "+54", flag: "🇦🇷", name: "Argentina" },
  { code: "CL", dial: "+56", flag: "🇨🇱", name: "Chile" },
  { code: "EC", dial: "+593", flag: "🇪🇨", name: "Ecuador" },
  { code: "BO", dial: "+591", flag: "🇧🇴", name: "Bolivia" },
  { code: "PY", dial: "+595", flag: "🇵🇾", name: "Paraguay" },
  { code: "UY", dial: "+598", flag: "🇺🇾", name: "Uruguay" },
  { code: "VE", dial: "+58", flag: "🇻🇪", name: "Venezuela" },
  { code: "BR", dial: "+55", flag: "🇧🇷", name: "Brasil" },
  { code: "US", dial: "+1", flag: "🇺🇸", name: "Estados Unidos" },
  { code: "ES", dial: "+34", flag: "🇪🇸", name: "España" },
];

export interface Specialty {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

// Days of the week: 0 = Sunday … 6 = Saturday (matches scheduler_settings)
export const WEEKDAYS = [
  { idx: 1, labelEs: "Lunes" },
  { idx: 2, labelEs: "Martes" },
  { idx: 3, labelEs: "Miércoles" },
  { idx: 4, labelEs: "Jueves" },
  { idx: 5, labelEs: "Viernes" },
  { idx: 6, labelEs: "Sábado" },
  { idx: 0, labelEs: "Domingo" },
] as const;

export type IntervalMin = 15 | 20 | 30 | 45 | 60;
export const INTERVAL_OPTIONS: IntervalMin[] = [15, 20, 30, 45, 60];

export interface WizardState {
  // Step 1 — personal
  fullName: string;
  phone: string;
  country: Country;
  selectedSpecialty: Specialty | null;
  // Step 2 — clinic
  clinicName: string;
  clinicPhone: string;
  clinicEmail: string;
  // Step 3 — hours
  startHour: number;
  endHour: number;
  interval: IntervalMin;
  /** Weekday indices that are enabled for work (0=Sun … 6=Sat) */
  activeDays: number[];
  // Step 4 — first service (optional)
  serviceName: string;
  serviceDuration: number; // minutes, multiple of 15
  servicePrice: string;    // keep as string for input; parse on save
}

export const TOTAL_STEPS = 4; // steps 1..4 — step 0 is the welcome splash
