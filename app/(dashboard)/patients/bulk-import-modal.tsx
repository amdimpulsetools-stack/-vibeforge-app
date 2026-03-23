"use client";

import { useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  X,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Download,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Info,
} from "lucide-react";

/* ─── Types ─── */

type ImportStep = "upload" | "mapping" | "preview" | "importing" | "done";

type RawRow = Record<string, string>;

type MappedPatient = {
  first_name: string;
  last_name: string;
  dni?: string;
  document_type?: string;
  phone?: string;
  email?: string;
  birth_date?: string;
  departamento?: string;
  distrito?: string;
  is_foreigner?: boolean;
  nationality?: string;
  notes?: string;
  origin?: string;
  referral_source?: string;
  custom_field_1?: string;
  custom_field_2?: string;
};

type RowValidation = {
  row: number;
  data: MappedPatient;
  errors: string[];
  warnings: string[];
};

/* ─── Constants ─── */

const PATIENT_FIELDS: { key: keyof MappedPatient; label: string; required: boolean }[] = [
  { key: "first_name", label: "Nombre", required: true },
  { key: "last_name", label: "Apellido", required: true },
  { key: "dni", label: "DNI / Documento", required: false },
  { key: "document_type", label: "Tipo de documento", required: false },
  { key: "phone", label: "Teléfono", required: false },
  { key: "email", label: "Email", required: false },
  { key: "birth_date", label: "Fecha de nacimiento", required: false },
  { key: "departamento", label: "Departamento", required: false },
  { key: "distrito", label: "Distrito", required: false },
  { key: "is_foreigner", label: "Extranjero (sí/no)", required: false },
  { key: "nationality", label: "Nacionalidad", required: false },
  { key: "notes", label: "Notas", required: false },
  { key: "origin", label: "Origen", required: false },
  { key: "referral_source", label: "Referido por", required: false },
  { key: "custom_field_1", label: "Campo personalizado 1", required: false },
  { key: "custom_field_2", label: "Campo personalizado 2", required: false },
];

// Common CSV header aliases for auto-mapping
const HEADER_ALIASES: Record<string, keyof MappedPatient> = {
  nombre: "first_name",
  nombres: "first_name",
  "primer nombre": "first_name",
  "first name": "first_name",
  first_name: "first_name",
  firstname: "first_name",
  name: "first_name",
  apellido: "first_name" in {} ? "last_name" : "last_name",
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

/* ─── CSV Parser ─── */

function parseCSV(text: string): { headers: string[]; rows: RawRow[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  // Detect delimiter (comma, semicolon, tab)
  const firstLine = lines[0];
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
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
    if (values.every((v) => !v)) continue; // skip empty rows
    const row: RawRow = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

/* ─── Validation ─── */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function parseDateFlexible(value: string): string | null {
  if (!value) return null;
  // Try YYYY-MM-DD
  if (DATE_REGEX.test(value)) return value;
  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Try MM/DD/YYYY
  const mdyMatch = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (mdyMatch) {
    // Already handled above; in ambiguous cases assume DD/MM/YYYY (LATAM convention)
    return null;
  }
  return null;
}

function validateRow(data: MappedPatient, rowIndex: number): RowValidation {
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
  if (data.document_type && !["DNI", "CE", "Pasaporte"].includes(data.document_type)) {
    warnings.push(`Tipo de documento "${data.document_type}" no válido — se usará DNI`);
  }

  return { row: rowIndex + 1, data, errors, warnings };
}

/* ─── Component ─── */

interface BulkImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkImportModal({ onClose, onSuccess }: BulkImportModalProps) {
  const { organizationId } = useOrganization();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState("");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, keyof MappedPatient | "">>({});
  const [validations, setValidations] = useState<RowValidation[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{ success: number; failed: number; duplicates: number }>({
    success: 0,
    failed: 0,
    duplicates: 0,
  });

  /* ─── Step 1: Upload ─── */

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);

      if (headers.length === 0 || rows.length === 0) {
        toast.error("El archivo está vacío o no tiene el formato correcto");
        return;
      }

      setFileName(file.name);
      setRawHeaders(headers);
      setRawRows(rows);

      // Auto-map columns based on header aliases
      const autoMapping: Record<string, keyof MappedPatient | ""> = {};
      headers.forEach((h) => {
        const normalized = h.toLowerCase().trim();
        if (HEADER_ALIASES[normalized]) {
          autoMapping[h] = HEADER_ALIASES[normalized];
        } else {
          autoMapping[h] = "";
        }
      });
      setColumnMapping(autoMapping);
      setStep("mapping");
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith(".csv") || file.name.endsWith(".txt") || file.name.endsWith(".tsv"))) {
        handleFile(file);
      } else {
        toast.error("Solo se aceptan archivos CSV, TSV o TXT");
      }
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  /* ─── Step 2: Mapping ─── */

  const handleMappingChange = (csvHeader: string, field: keyof MappedPatient | "") => {
    setColumnMapping((prev) => ({ ...prev, [csvHeader]: field }));
  };

  const isMappingValid = () => {
    const mapped = Object.values(columnMapping).filter(Boolean);
    return mapped.includes("first_name") && mapped.includes("last_name");
  };

  const proceedToPreview = () => {
    // Map raw rows to patient data
    const mapped = rawRows.map((row, idx) => {
      const patient: Record<string, string | boolean | undefined> = {};

      Object.entries(columnMapping).forEach(([csvHeader, field]) => {
        if (!field) return;
        const value = row[csvHeader]?.trim() || "";
        if (!value) return;

        if (field === "is_foreigner") {
          patient[field] = ["sí", "si", "yes", "true", "1", "s"].includes(value.toLowerCase());
        } else if (field === "birth_date") {
          const parsed = parseDateFlexible(value);
          if (parsed) patient[field] = parsed;
        } else if (field === "document_type") {
          const upper = value.toUpperCase();
          if (["DNI", "CE", "PASAPORTE"].includes(upper)) {
            patient[field] = upper === "PASAPORTE" ? "Pasaporte" : upper;
          }
        } else {
          patient[field] = value;
        }
      });

      return validateRow(patient as MappedPatient, idx);
    });

    setValidations(mapped);
    setStep("preview");
  };

  /* ─── Step 3: Preview ─── */

  const validRows = validations.filter((v) => v.errors.length === 0);
  const errorRows = validations.filter((v) => v.errors.length > 0);
  const warningRows = validations.filter((v) => v.warnings.length > 0 && v.errors.length === 0);

  /* ─── Step 4: Import ─── */

  const startImport = async () => {
    if (!organizationId) return;
    setStep("importing");
    setImportProgress(0);

    const supabase = createClient();
    let success = 0;
    let failed = 0;
    let duplicates = 0;
    const batchSize = 25;
    const toImport = validRows;

    for (let i = 0; i < toImport.length; i += batchSize) {
      const batch = toImport.slice(i, i + batchSize);
      const records = batch.map((v) => {
        const p = v.data;
        return {
          organization_id: organizationId,
          first_name: p.first_name,
          last_name: p.last_name,
          dni: p.dni && p.dni.length <= 20 ? p.dni : null,
          document_type: p.document_type && ["DNI", "CE", "Pasaporte"].includes(p.document_type) ? p.document_type : "DNI",
          phone: p.phone?.substring(0, 20) || null,
          email: p.email && EMAIL_REGEX.test(p.email) ? p.email : null,
          birth_date: p.birth_date || null,
          departamento: p.departamento || null,
          distrito: p.distrito || null,
          is_foreigner: p.is_foreigner || false,
          nationality: p.nationality || null,
          notes: p.notes?.substring(0, 500) || null,
          origin: p.origin || null,
          referral_source: p.referral_source?.substring(0, 200) || null,
          custom_field_1: p.custom_field_1?.substring(0, 200) || null,
          custom_field_2: p.custom_field_2?.substring(0, 200) || null,
          status: "active" as const,
        };
      });

      const { data, error } = await supabase.from("patients").insert(records).select("id");

      if (error) {
        // If batch fails, try one by one to identify duplicates
        for (const record of records) {
          const { error: singleError } = await supabase.from("patients").insert(record).select("id");
          if (singleError) {
            if (singleError.message?.includes("duplicate") || singleError.code === "23505") {
              duplicates++;
            } else {
              failed++;
            }
          } else {
            success++;
          }
        }
      } else {
        success += data?.length || records.length;
      }

      setImportProgress(Math.min(100, Math.round(((i + batch.length) / toImport.length) * 100)));
    }

    setImportResults({ success, failed, duplicates });
    setStep("done");
  };

  /* ─── Download Template ─── */

  const downloadTemplate = () => {
    const headers = ["nombre", "apellido", "dni", "tipo_documento", "telefono", "email", "fecha_nacimiento", "departamento", "distrito", "notas"];
    const exampleRow = ["María", "García López", "12345678", "DNI", "987654321", "maria@email.com", "15/03/1990", "Lima", "Miraflores", "Paciente referida"];
    const csv = "\ufeff" + headers.join(",") + "\n" + exampleRow.join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla_pacientes.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  /* ─── Render ─── */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <Upload className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Importación masiva de pacientes</h3>
              <p className="text-[11px] text-muted-foreground">
                {step === "upload" && "Sube tu archivo CSV o Excel exportado"}
                {step === "mapping" && "Mapea las columnas de tu archivo"}
                {step === "preview" && "Revisa los datos antes de importar"}
                {step === "importing" && "Importando pacientes..."}
                {step === "done" && "Importación completada"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={step === "importing"}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-30 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-1 border-b border-border px-5 py-2.5">
          {(["upload", "mapping", "preview", "importing"] as ImportStep[]).map((s, idx) => {
            const labels = ["Subir", "Mapear", "Revisar", "Importar"];
            const isActive = s === step;
            const isDone =
              (s === "upload" && step !== "upload") ||
              (s === "mapping" && !["upload", "mapping"].includes(step)) ||
              (s === "preview" && ["importing", "done"].includes(step)) ||
              (s === "importing" && step === "done");
            return (
              <div key={s} className="flex items-center gap-1">
                {idx > 0 && <div className="mx-1 h-px w-4 bg-border" />}
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    isActive && "bg-primary/10 text-primary",
                    isDone && "text-emerald-400",
                    !isActive && !isDone && "text-muted-foreground"
                  )}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px]">
                      {idx + 1}
                    </span>
                  )}
                  {labels[idx]}
                </div>
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* ─── STEP: Upload ─── */}
          {step === "upload" && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/60 bg-muted/10 p-10 transition-colors hover:border-primary/40 hover:bg-muted/20 cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">
                    Arrastra tu archivo CSV aquí
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    o haz click para seleccionar
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>

              {/* Info */}
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Info className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium">Formatos soportados</span>
                </div>
                <ul className="space-y-1.5 text-[11px] text-muted-foreground ml-5">
                  <li>CSV exportado de otro software (separado por comas, punto y coma, o tabs)</li>
                  <li>Excel guardado como CSV (Archivo → Guardar como → CSV UTF-8)</li>
                  <li>La primera fila debe contener los encabezados (nombre, apellido, etc.)</li>
                  <li>Solo <strong className="text-foreground">nombre</strong> y <strong className="text-foreground">apellido</strong> son obligatorios</li>
                </ul>
              </div>

              {/* Template download */}
              <button
                onClick={downloadTemplate}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Descargar plantilla de ejemplo
              </button>
            </div>
          )}

          {/* ─── STEP: Mapping ─── */}
          {step === "mapping" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-3">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                <div className="flex-1">
                  <p className="text-xs font-medium">{fileName}</p>
                  <p className="text-[11px] text-muted-foreground">{rawRows.length} filas encontradas</p>
                </div>
                <button
                  onClick={() => { setStep("upload"); setRawHeaders([]); setRawRows([]); }}
                  className="rounded-lg p-1 text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                Asigna cada columna de tu archivo al campo correspondiente. Las columnas reconocidas se mapean automáticamente.
              </p>

              <div className="space-y-2">
                {rawHeaders.map((header) => {
                  const currentMapping = columnMapping[header];
                  const usedFields = Object.entries(columnMapping)
                    .filter(([h, f]) => f && h !== header)
                    .map(([, f]) => f);

                  return (
                    <div
                      key={header}
                      className="flex items-center gap-3 rounded-lg border border-border/50 bg-background p-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{header}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          Ej: {rawRows[0]?.[header] || "—"}
                        </p>
                      </div>
                      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <select
                        value={currentMapping || ""}
                        onChange={(e) => handleMappingChange(header, e.target.value as keyof MappedPatient | "")}
                        className={cn(
                          "w-44 shrink-0 rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50",
                          currentMapping ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        <option value="">— Ignorar —</option>
                        {PATIENT_FIELDS.map((f) => (
                          <option
                            key={f.key}
                            value={f.key}
                            disabled={usedFields.includes(f.key)}
                          >
                            {f.label} {f.required ? "*" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {!isMappingValid() && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <p className="text-[11px] text-amber-400">
                    Debes mapear al menos <strong>Nombre</strong> y <strong>Apellido</strong> para continuar.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP: Preview ─── */}
          {step === "preview" && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                  <p className="text-lg font-bold text-emerald-400">{validRows.length}</p>
                  <p className="text-[11px] text-muted-foreground">Listos para importar</p>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-center">
                  <p className="text-lg font-bold text-amber-400">{warningRows.length}</p>
                  <p className="text-[11px] text-muted-foreground">Con advertencias</p>
                </div>
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-center">
                  <p className="text-lg font-bold text-red-400">{errorRows.length}</p>
                  <p className="text-[11px] text-muted-foreground">Con errores (se omitirán)</p>
                </div>
              </div>

              {/* Error details */}
              {errorRows.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-red-400">Filas con errores (no se importarán):</p>
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 space-y-1">
                    {errorRows.slice(0, 20).map((v) => (
                      <p key={v.row} className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-red-400">Fila {v.row}:</span>{" "}
                        {v.errors.join(", ")}
                      </p>
                    ))}
                    {errorRows.length > 20 && (
                      <p className="text-[11px] text-muted-foreground">
                        ...y {errorRows.length - 20} más
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Warning details */}
              {warningRows.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-amber-400">Advertencias (se importarán con ajustes):</p>
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 space-y-1">
                    {warningRows.slice(0, 10).map((v) => (
                      <p key={v.row} className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-amber-400">Fila {v.row}:</span>{" "}
                        {v.warnings.join(", ")}
                      </p>
                    ))}
                    {warningRows.length > 10 && (
                      <p className="text-[11px] text-muted-foreground">
                        ...y {warningRows.length - 10} más
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Preview table */}
              {validRows.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Vista previa (primeros 10):</p>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="px-2.5 py-2 text-left font-medium text-muted-foreground">#</th>
                          <th className="px-2.5 py-2 text-left font-medium text-muted-foreground">Nombre</th>
                          <th className="px-2.5 py-2 text-left font-medium text-muted-foreground">Apellido</th>
                          <th className="px-2.5 py-2 text-left font-medium text-muted-foreground">DNI</th>
                          <th className="px-2.5 py-2 text-left font-medium text-muted-foreground">Teléfono</th>
                          <th className="px-2.5 py-2 text-left font-medium text-muted-foreground">Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validRows.slice(0, 10).map((v) => (
                          <tr key={v.row} className="border-b border-border/50 last:border-0">
                            <td className="px-2.5 py-1.5 text-muted-foreground">{v.row}</td>
                            <td className="px-2.5 py-1.5">{v.data.first_name}</td>
                            <td className="px-2.5 py-1.5">{v.data.last_name}</td>
                            <td className="px-2.5 py-1.5 text-muted-foreground">{v.data.dni || "—"}</td>
                            <td className="px-2.5 py-1.5 text-muted-foreground">{v.data.phone || "—"}</td>
                            <td className="px-2.5 py-1.5 text-muted-foreground">{v.data.email || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP: Importing ─── */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center gap-4 py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium">Importando pacientes...</p>
                <p className="text-xs text-muted-foreground mt-1">No cierres esta ventana</p>
              </div>
              <div className="w-full max-w-xs">
                <div className="h-2 overflow-hidden rounded-full bg-muted/30">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
                <p className="mt-1.5 text-center text-xs text-muted-foreground">{importProgress}%</p>
              </div>
            </div>
          )}

          {/* ─── STEP: Done ─── */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <div className="rounded-full bg-emerald-500/10 p-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold">Importación completada</p>
              </div>
              <div className="grid w-full max-w-xs grid-cols-3 gap-3">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-center">
                  <p className="text-lg font-bold text-emerald-400">{importResults.success}</p>
                  <p className="text-[10px] text-muted-foreground">Importados</p>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-center">
                  <p className="text-lg font-bold text-amber-400">{importResults.duplicates}</p>
                  <p className="text-[10px] text-muted-foreground">Duplicados</p>
                </div>
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-center">
                  <p className="text-lg font-bold text-red-400">{importResults.failed}</p>
                  <p className="text-[10px] text-muted-foreground">Fallidos</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-border px-5 py-4">
          {step === "upload" && (
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          )}

          {step === "mapping" && (
            <>
              <button
                onClick={() => setStep("upload")}
                className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Atrás
              </button>
              <button
                onClick={proceedToPreview}
                disabled={!isMappingValid()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
              >
                Revisar datos
                <ArrowRight className="h-3 w-3" />
              </button>
            </>
          )}

          {step === "preview" && (
            <>
              <button
                onClick={() => setStep("mapping")}
                className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Atrás
              </button>
              <button
                onClick={startImport}
                disabled={validRows.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
              >
                Importar {validRows.length} pacientes
                <Upload className="h-3 w-3" />
              </button>
            </>
          )}

          {step === "done" && (
            <button
              onClick={() => { onSuccess(); onClose(); }}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-all"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
