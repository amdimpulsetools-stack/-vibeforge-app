// Server-side (and browser-safe) CSV parsing + row validation + mapping
// for the SERVICES bulk import. Mirrors lib/patient-imports/csv.ts.
//
// Pure functions. No I/O. Safe to test in isolation and to run both in
// the browser (preview) and on the server (authoritative validation).
//
// Scope: we ONLY import name, base_price, duration_minutes, category
// (by name) and is_active. Tiers, insurance and fiscal (SUNAT) fields
// stay per-service manual config and are intentionally NOT importable.

export type RawRow = Record<string, string>;

export type MappedService = {
  name: string;
  base_price: number | null;
  duration_minutes: number | null;
  category: string | null;
  is_active: boolean;
};

export type RowValidation = {
  row: number; // 1-based row number in the original CSV (header = row 1)
  data: MappedService;
  errors: string[];
  warnings: string[];
  raw: RawRow;
};

// Logical fields the importer understands.
export type ServiceField = "name" | "base_price" | "duration_minutes" | "category" | "is_active";

// Spanish-friendly header aliases. Lowercased keys.
export const HEADER_ALIASES: Record<string, ServiceField> = {
  // name
  servicio: "name",
  nombre: "name",
  "nombre del servicio": "name",
  "nombre servicio": "name",
  name: "name",
  service: "name",
  // base_price
  precio: "base_price",
  "precio base": "base_price",
  "precio (s/.)": "base_price",
  monto: "base_price",
  costo: "base_price",
  price: "base_price",
  base_price: "base_price",
  "base price": "base_price",
  // duration_minutes
  "duración": "duration_minutes",
  duracion: "duration_minutes",
  "duración (min)": "duration_minutes",
  "duracion (min)": "duration_minutes",
  "duración minutos": "duration_minutes",
  "duracion minutos": "duration_minutes",
  minutos: "duration_minutes",
  duration: "duration_minutes",
  duration_minutes: "duration_minutes",
  // category
  "categoría": "category",
  categoria: "category",
  "categoría del servicio": "category",
  "categoria del servicio": "category",
  category: "category",
  rubro: "category",
  // is_active
  activo: "is_active",
  "activo (sí/no)": "is_active",
  estado: "is_active",
  active: "is_active",
  is_active: "is_active",
};

const TRUE_VALUES = ["sí", "si", "true", "1", "activo", "activa", "yes", "s", "x", "verdadero"];
const FALSE_VALUES = ["no", "false", "0", "inactivo", "inactiva", "n", "", "falso"];

/** Parse a price string: strips currency symbols, thousand separators, handles comma decimals. */
export function parsePrice(value: string): number | null {
  if (!value) return null;
  let cleaned = value.replace(/s\/\.?/gi, "").replace(/[$€£\s]/g, "").trim();
  if (!cleaned) return null;
  // If both "." and "," present, assume "." is thousands and "," is decimal (es-PE/es style).
  if (cleaned.includes(",") && cleaned.includes(".")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(",", ".");
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse an integer minutes value. */
export function parseDuration(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/min(utos)?/gi, "").replace(/[^\d-]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isInteger(n) ? n : null;
}

/** Parse a boolean-ish "is_active" cell. Defaults to true when blank/unknown. */
export function parseIsActive(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (TRUE_VALUES.includes(v)) return true;
  if (FALSE_VALUES.includes(v)) return false;
  return true; // default: active
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
export function autoMapColumns(headers: string[]): Record<string, ServiceField | ""> {
  const mapping: Record<string, ServiceField | ""> = {};
  for (const h of headers) {
    const normalized = h.toLowerCase().trim();
    mapping[h] = HEADER_ALIASES[normalized] ?? "";
  }
  return mapping;
}

/** Map a single CSV row to MappedService using a header → field mapping. */
export function mapRow(
  row: RawRow,
  columnMapping: Record<string, ServiceField | "">
): MappedService {
  const service: MappedService = {
    name: "",
    base_price: null,
    duration_minutes: null,
    category: null,
    is_active: true,
  };
  for (const [csvHeader, field] of Object.entries(columnMapping)) {
    if (!field) continue;
    const value = row[csvHeader]?.trim() ?? "";

    if (field === "name") {
      service.name = value;
    } else if (field === "base_price") {
      service.base_price = parsePrice(value);
    } else if (field === "duration_minutes") {
      service.duration_minutes = parseDuration(value);
    } else if (field === "category") {
      service.category = value || null;
    } else if (field === "is_active") {
      service.is_active = parseIsActive(value);
    }
  }
  return service;
}

/** Validate a single mapped row. Returns errors (fatal) + warnings (non-fatal). */
export function validateRow(
  data: MappedService,
  rowIndex: number,
  raw: RawRow
): RowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data.name || data.name.length < 2) {
    errors.push("Nombre del servicio es requerido (mínimo 2 caracteres)");
  }
  if (data.name && data.name.length > 100) {
    errors.push("Nombre muy largo (máximo 100 caracteres)");
  }

  if (data.base_price === null) {
    // Blank price → default to 0 with a warning (matches the form default).
    warnings.push("Precio vacío o inválido — se usará 0");
  } else if (data.base_price < 0) {
    errors.push("El precio no puede ser negativo");
  }

  if (data.duration_minutes === null) {
    warnings.push("Duración vacía o inválida — se usará 30 minutos");
  } else if (data.duration_minutes <= 0) {
    errors.push("La duración debe ser un entero positivo");
  } else if (data.duration_minutes % 15 !== 0) {
    errors.push("La duración debe ser múltiplo de 15 minutos");
  }

  if (!data.category) {
    errors.push("La categoría es requerida");
  } else if (data.category.length > 100) {
    errors.push("Categoría muy larga (máximo 100 caracteres)");
  }

  return { row: rowIndex + 2, data, errors, warnings, raw };
}

/**
 * Normalize the values the importer will actually persist, applying the
 * same defaults the validation warnings described (price 0, duration 30).
 */
export function normalizeForInsert(data: MappedService): {
  name: string;
  base_price: number;
  duration_minutes: number;
  category: string;
  is_active: boolean;
} {
  return {
    name: data.name.trim(),
    base_price: data.base_price !== null && data.base_price >= 0 ? data.base_price : 0,
    duration_minutes:
      data.duration_minutes !== null &&
      data.duration_minutes > 0 &&
      data.duration_minutes % 15 === 0
        ? data.duration_minutes
        : 30,
    category: (data.category ?? "").trim(),
    is_active: data.is_active,
  };
}

/** Intra-CSV dedup key: case-insensitive (category|name). */
export function computeDedupKey(d: MappedService): string {
  return `${(d.category ?? "").trim().toLowerCase()}|${(d.name ?? "").trim().toLowerCase()}`;
}
