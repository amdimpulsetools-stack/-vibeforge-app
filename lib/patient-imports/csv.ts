// Server-side CSV parsing + row validation + mapping for the patient
// bulk import. Mirrors (and replaces) the in-browser logic that used to
// live in app/(dashboard)/patients/bulk-import-modal.tsx, so the new
// flow can run end-to-end on the server.
//
// Pure functions. No I/O. Safe to test in isolation.

export type RawRow = Record<string, string>;

export type MappedPatient = {
  first_name: string;
  last_name: string;
  dni?: string | null;
  document_type?: "DNI" | "CE" | "Pasaporte";
  phone?: string | null;
  email?: string | null;
  birth_date?: string | null;
  departamento?: string | null;
  distrito?: string | null;
  is_foreigner?: boolean;
  nationality?: string | null;
  notes?: string | null;
  origin?: string | null;
  referral_source?: string | null;
  custom_field_1?: string | null;
  custom_field_2?: string | null;
};

export type RowValidation = {
  row: number; // 1-based row number in the original CSV (header = row 1)
  data: MappedPatient;
  errors: string[];
  warnings: string[];
  raw: RawRow;
};

// Spanish-friendly header aliases. Lowercased keys.
export const HEADER_ALIASES: Record<string, keyof MappedPatient> = {
  nombre: "first_name",
  nombres: "first_name",
  "primer nombre": "first_name",
  "first name": "first_name",
  first_name: "first_name",
  firstname: "first_name",
  name: "first_name",
  apellido: "last_name",
  apellidos: "last_name",
  "last name": "last_name",
  last_name: "last_name",
  lastname: "last_name",
  surname: "last_name",
  dni: "dni",
  documento: "dni",
  "nro documento": "dni",
  "numero documento": "dni",
  "numero de documento": "dni",
  document: "dni",
  "document number": "dni",
  "tipo documento": "document_type",
  "tipo de documento": "document_type",
  tipo_documento: "document_type",
  document_type: "document_type",
  telefono: "phone",
  "teléfono": "phone",
  celular: "phone",
  phone: "phone",
  mobile: "phone",
  tel: "phone",
  email: "email",
  correo: "email",
  "correo electrónico": "email",
  "correo electronico": "email",
  mail: "email",
  "fecha de nacimiento": "birth_date",
  "fecha nacimiento": "birth_date",
  fecha_nacimiento: "birth_date",
  nacimiento: "birth_date",
  birth_date: "birth_date",
  birthdate: "birth_date",
  "date of birth": "birth_date",
  dob: "birth_date",
  departamento: "departamento",
  department: "departamento",
  distrito: "distrito",
  district: "distrito",
  extranjero: "is_foreigner",
  nacionalidad: "nationality",
  nationality: "nationality",
  notas: "notes",
  notes: "notes",
  observaciones: "notes",
  origen: "origin",
  origin: "origin",
  referido: "referral_source",
  "referido por": "referral_source",
  referral: "referral_source",
  referral_source: "referral_source",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateFlexible(value: string): string | null {
  if (!value) return null;
  if (DATE_ISO_REGEX.test(value)) return value;
  const dmyMatch = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/** Parse a CSV text blob. Detects comma/semicolon/tab delimiter and supports quoted fields. */
export function parseCSV(text: string): { headers: string[]; rows: RawRow[] } {
  // Strip BOM if present.
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const firstLine = lines[0];
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const delimiter = tabs > commas && tabs > semis ? "\t" : semis > commas ? ";" : ",";

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.every((v) => !v)) continue;
    const row: RawRow = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

/** Build an auto column mapping from CSV headers using HEADER_ALIASES. */
export function autoMapColumns(
  headers: string[]
): Record<string, keyof MappedPatient | ""> {
  const mapping: Record<string, keyof MappedPatient | ""> = {};
  for (const h of headers) {
    const normalized = h.toLowerCase().trim();
    mapping[h] = HEADER_ALIASES[normalized] ?? "";
  }
  return mapping;
}

/** Map a single CSV row to MappedPatient using a header → field mapping. */
export function mapRow(
  row: RawRow,
  columnMapping: Record<string, keyof MappedPatient | "">
): MappedPatient {
  const patient: Partial<MappedPatient> = {};
  for (const [csvHeader, field] of Object.entries(columnMapping)) {
    if (!field) continue;
    const value = row[csvHeader]?.trim() ?? "";
    if (!value) continue;

    if (field === "is_foreigner") {
      patient.is_foreigner = ["sí", "si", "yes", "true", "1", "s"].includes(value.toLowerCase());
    } else if (field === "birth_date") {
      const parsed = parseDateFlexible(value);
      if (parsed) patient.birth_date = parsed;
    } else if (field === "document_type") {
      const upper = value.toUpperCase();
      if (upper === "DNI" || upper === "CE") patient.document_type = upper;
      else if (upper === "PASAPORTE") patient.document_type = "Pasaporte";
    } else {
      // All remaining fields are plain string columns.
      (patient as Record<string, string>)[field] = value;
    }
  }
  return patient as MappedPatient;
}

/** Validate a single mapped row. Returns errors (fatal) + warnings (non-fatal). */
export function validateRow(
  data: MappedPatient,
  rowIndex: number,
  raw: RawRow
): RowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data.first_name || data.first_name.length < 2) {
    errors.push("Nombre es requerido (mínimo 2 caracteres)");
  }
  if (data.first_name && data.first_name.length > 100) {
    errors.push("Nombre muy largo (máximo 100 caracteres)");
  }
  if (!data.last_name || data.last_name.length < 2) {
    errors.push("Apellido es requerido (mínimo 2 caracteres)");
  }
  if (data.last_name && data.last_name.length > 100) {
    errors.push("Apellido muy largo (máximo 100 caracteres)");
  }
  if (data.email && !EMAIL_REGEX.test(data.email)) {
    warnings.push("Email inválido — se importará sin email");
  }
  if (data.dni && data.dni.length > 20) {
    warnings.push("Documento muy largo — se truncará a 20 caracteres");
  }
  if (data.phone && data.phone.length > 20) {
    warnings.push("Teléfono muy largo — se truncará a 20 caracteres");
  }

  return { row: rowIndex + 2, data, errors, warnings, raw };
}

/**
 * Compute the same dedup_key the DB generated column produces. Keep in
 * sync with mig 143. We use this to dedupe within the CSV itself
 * (intra-file duplicates) before hitting Postgres.
 */
export function computeDedupKey(p: MappedPatient): string {
  const dni = p.dni?.trim();
  if (dni && dni.length > 0) {
    return `dni:${dni.toLowerCase()}`;
  }
  return `np:${(p.first_name ?? "").trim().toLowerCase()}|${(p.last_name ?? "").trim().toLowerCase()}|${(p.phone ?? "").trim()}`;
}

/** Build a CSV (string) of failed rows + their reason. */
export function buildFailedCsv(rows: { row: number; reason: string; raw: RawRow }[]): string {
  if (rows.length === 0) return "﻿fila,motivo\n";
  const headers = Object.keys(rows[0].raw);
  const csvEscape = (v: string) => {
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };
  const lines: string[] = [];
  lines.push(["fila", "motivo", ...headers].map(csvEscape).join(","));
  for (const r of rows) {
    const cells = [String(r.row), r.reason, ...headers.map((h) => r.raw[h] ?? "")];
    lines.push(cells.map(csvEscape).join(","));
  }
  return "﻿" + lines.join("\n") + "\n";
}
