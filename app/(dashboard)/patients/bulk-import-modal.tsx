"use client";

// Bulk patient import modal.
//
// Day 4 of the pre-launch blockers (see
// docs/launch-prep/bulk-import-audit.md): the data path is now fully
// server-side. The modal does:
//   1. Parse the CSV in-browser (preview only, no DB writes).
//   2. Let the admin confirm the column mapping.
//   3. POST the file + mapping to /api/patient-imports/start.
//   4. Poll /api/patient-imports/[id] every 2s for status.
//   5. Show counts; offer a download of the failed-rows CSV.

import { useState, useCallback, useRef, useEffect } from "react";
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
import {
  parseCSV,
  autoMapColumns,
  mapRow,
  validateRow,
  type MappedPatient,
  type RawRow,
  type RowValidation,
} from "@/lib/patient-imports/csv";

/* ─── Types ─── */

type ImportStep = "upload" | "mapping" | "preview" | "importing" | "done";

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

type ImportSummary = {
  total_rows: number;
  inserted_rows: number;
  skipped_duplicates: number;
  failed_rows: number;
};

interface BulkImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkImportModal({ onClose, onSuccess }: BulkImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, keyof MappedPatient | "">>({});
  const [validations, setValidations] = useState<RowValidation[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importId, setImportId] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importing, setImporting] = useState(false);

  /* ─── Step 1: Upload ─── */

  const handleFile = useCallback((selected: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);

      if (headers.length === 0 || rows.length === 0) {
        toast.error("El archivo está vacío o no tiene el formato correcto");
        return;
      }

      setFile(selected);
      setFileName(selected.name);
      setRawHeaders(headers);
      setRawRows(rows);
      setColumnMapping(autoMapColumns(headers));
      setStep("mapping");
    };
    reader.readAsText(selected);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const dropped = e.dataTransfer.files[0];
      if (dropped && (dropped.name.endsWith(".csv") || dropped.name.endsWith(".txt") || dropped.name.endsWith(".tsv"))) {
        handleFile(dropped);
      } else {
        toast.error("Solo se aceptan archivos CSV, TSV o TXT");
      }
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0];
      if (picked) handleFile(picked);
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
    const mapped = rawRows.map((row, idx) => {
      const data = mapRow(row, columnMapping);
      return validateRow(data, idx, row);
    });
    setValidations(mapped);
    setStep("preview");
  };

  /* ─── Step 3: Preview ─── */

  const validRows = validations.filter((v) => v.errors.length === 0);
  const errorRows = validations.filter((v) => v.errors.length > 0);
  const warningRows = validations.filter((v) => v.warnings.length > 0 && v.errors.length === 0);

  /* ─── Step 4: Import — server-side via /api/patient-imports/start ─── */

  const startImport = useCallback(async () => {
    if (!file) return;
    setStep("importing");
    setImporting(true);
    setImportProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mapping", JSON.stringify(columnMapping));

    try {
      const res = await fetch("/api/patient-imports/start", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Error al iniciar la importación");
        setStep("preview");
        setImporting(false);
        return;
      }
      const data = (await res.json()) as { import_id: string } & ImportSummary;
      setImportId(data.import_id);
      setImportSummary({
        total_rows: data.total_rows,
        inserted_rows: data.inserted_rows,
        skipped_duplicates: data.skipped_duplicates,
        failed_rows: data.failed_rows,
      });
      setImportProgress(100);
      setImporting(false);
      setStep("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error de red al importar");
      setStep("preview");
      setImporting(false);
    }
  }, [file, columnMapping]);

  /* ─── Polling — if the request returns before the server finishes (rare
        because we wait for completion) we still poll so the UI keeps in
        sync. Real-world the start endpoint blocks until done. ─── */

  useEffect(() => {
    if (step !== "importing" || !importId || importSummary) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/patient-imports/${importId}`);
        if (!res.ok) return;
        const data = (await res.json()) as ImportSummary & {
          status: "uploading" | "processing" | "completed" | "failed";
          progress: number;
        };
        if (cancelled) return;
        setImportProgress(data.progress);
        if (data.status === "completed" || data.status === "failed") {
          setImportSummary({
            total_rows: data.total_rows,
            inserted_rows: data.inserted_rows,
            skipped_duplicates: data.skipped_duplicates,
            failed_rows: data.failed_rows,
          });
          setStep("done");
        }
      } catch {
        // Swallow polling errors — next tick retries.
      }
    };
    const interval = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [step, importId, importSummary]);

  /* ─── Download failed CSV ─── */

  const downloadFailedCsv = () => {
    if (!importId) return;
    window.location.href = `/api/patient-imports/${importId}/failed-csv`;
  };

  /* ─── Download Template ─── */

  const downloadTemplate = () => {
    const headers = ["nombre", "apellido", "dni", "tipo_documento", "telefono", "email", "fecha_nacimiento", "departamento", "distrito", "notas"];
    const exampleRow = ["María", "García López", "12345678", "DNI", "987654321", "maria@email.com", "15/03/1990", "Lima", "Miraflores", "Paciente referida"];
    const csv = "﻿" + headers.join(",") + "\n" + exampleRow.join(",") + "\n";
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
            disabled={importing}
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
                  <li>Máximo <strong className="text-foreground">5000 filas</strong> y 10MB por archivo</li>
                </ul>
              </div>

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
                  onClick={() => { setStep("upload"); setRawHeaders([]); setRawRows([]); setFile(null); }}
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
                <p className="text-xs text-muted-foreground mt-1">
                  Procesando en el servidor. Puedes cerrar la ventana y volver más tarde — la importación continuará.
                </p>
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
          {step === "done" && importSummary && (
            <div className="flex flex-col items-center justify-center gap-4 py-6">
              <div className="rounded-full bg-emerald-500/10 p-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold">Importación completada</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Total procesado: {importSummary.total_rows} filas
                </p>
              </div>
              <div className="grid w-full max-w-xs grid-cols-3 gap-3">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-center">
                  <p className="text-lg font-bold text-emerald-400">{importSummary.inserted_rows}</p>
                  <p className="text-[10px] text-muted-foreground">Importados</p>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-center">
                  <p className="text-lg font-bold text-amber-400">{importSummary.skipped_duplicates}</p>
                  <p className="text-[10px] text-muted-foreground">Duplicados</p>
                </div>
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-center">
                  <p className="text-lg font-bold text-red-400">{importSummary.failed_rows}</p>
                  <p className="text-[10px] text-muted-foreground">Fallidos</p>
                </div>
              </div>
              {(importSummary.failed_rows > 0 || importSummary.skipped_duplicates > 0) && importId && (
                <button
                  onClick={downloadFailedCsv}
                  className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar CSV de errores
                </button>
              )}
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
