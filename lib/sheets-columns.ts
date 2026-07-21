// Pure, dependency-free column definitions shared between the Google Sheets
// mirror (server, lib/google-sheets.ts) and the appointment-history CSV export
// (client, scheduler/history). No server imports here so it is safe to bundle
// into a "use client" component.
//
// SINGLE SOURCE OF TRUTH for the exact column order and the ES status labels.

const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000; // Peru is a stable UTC-5 (no DST).

// Exact column order (kept in sync with the Sheet tabs).
export const SHEET_EXPORT_COLUMNS = [
  "Fecha cita",
  "Hora",
  "Hasta",
  "Paciente",
  "Teléfono",
  "Doctor",
  "Servicio",
  "Sede",
  "Estado",
  "Origen",
  "Precio S/",
  "Pago",
  "Creada el",
  "ID Yenda",
] as const;

// Spanish status labels (enum values from types/database.ts).
const STATUS_ES: Record<string, string> = {
  scheduled: "Programada",
  confirmed: "Confirmada",
  completed: "Atendida",
  cancelled: "Cancelada",
  no_show: "No asistió",
};

export function mapStatusEs(status: string): string {
  return STATUS_ES[status] ?? status;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" → "dd/mm/aaaa". */
export function formatDateEs(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

/** UTC timestamptz string → "dd/mm/aaaa HH:MM" in Lima time (no TZ library). */
export function formatCreatedLima(utcISO: string): string {
  const d = new Date(utcISO);
  if (isNaN(d.getTime())) return "";
  const l = new Date(d.getTime() - LIMA_OFFSET_MS);
  return `${pad(l.getUTCDate())}/${pad(l.getUTCMonth() + 1)}/${l.getUTCFullYear()} ${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}`;
}

export interface SheetExportAppointment {
  id: string;
  patient_name: string | null;
  patient_phone: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  origin: string | null;
  payment_method: string | null;
  price_snapshot: number | null;
  created_at: string;
  doctors: { full_name: string } | null;
  offices: { name: string } | null;
  services: { name: string } | null;
}

/** Plain-string row for CSV export — same columns as the Sheet. */
export function buildExportRow(a: SheetExportAppointment): string[] {
  return [
    formatDateEs(a.appointment_date),
    a.start_time?.slice(0, 5) ?? "",
    a.end_time?.slice(0, 5) ?? "",
    a.patient_name ?? "",
    a.patient_phone ?? "",
    a.doctors?.full_name ?? "",
    a.services?.name ?? "",
    a.offices?.name ?? "",
    mapStatusEs(a.status),
    a.origin ?? "",
    a.price_snapshot != null ? String(a.price_snapshot) : "",
    a.payment_method ?? "",
    formatCreatedLima(a.created_at),
    a.id,
  ];
}
