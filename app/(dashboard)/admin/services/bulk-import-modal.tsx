"use client";

// Bulk SERVICES import modal. Mirrors the patient BulkImportModal
// (app/(dashboard)/patients/bulk-import-modal.tsx) in look and UX, but:
//   - Auto-maps columns by header alias (no manual mapping step needed —
//     service catalogs use few, well-known columns).
//   - Steps: upload → preview/validate → import → results summary.
//   - Categories are matched/created by NAME server-side.
//   - Synchronous: one POST to /api/service-imports/start, no polling.

import { useState, useCallback, useRef } from "react";
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
  type RawRow,
  type RowValidation,
} from "@/lib/service-imports/csv";

type ImportStep = "upload" | "preview" | "importing" | "done";

type ImportSummary = {
  total_rows: number;
  created: number;
  skipped: number;
  failed: number;
  created_categories: string[];
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
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [validations, setValidations] = useState<RowValidation[]>([]);
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

      const mapping = autoMapColumns(headers);
      const mappedFields = Object.values(mapping).filter(Boolean);
      if (!mappedFields.includes("name") || !mappedFields.includes("category")) {
        toast.error(
          "No se reconocieron las columnas Servicio y Categoría. Revisa los encabezados o usa la plantilla."
        );
        return;
      }

      const validated = rows.map((row, idx) => validateRow(mapRow(row, mapping), idx, row));

      setFile(selected);
      setFileName(selected.name);
      setRawRows(rows);
      setValidations(validated);
      setStep("preview");
    };
    reader.readAsText(selected);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const dropped = e.dataTransfer.files[0];
      if (
        dropped &&
        (dropped.name.endsWith(".csv") ||
          dropped.name.endsWith(".txt") ||
          dropped.name.endsWith(".tsv"))
      ) {
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

  /* ─── Step 2: Preview ─── */

  const validRows = validations.filter((v) => v.errors.length === 0);
  const errorRows = validations.filter((v) => v.errors.length > 0);
  const warningRows = validations.filter(
    (v) => v.warnings.length > 0 && v.errors.length === 0
  );

  /* ─── Step 3: Import — server-side via /api/service-imports/start ─── */

  const startImport = useCallback(async () => {
    if (!file) return;
    setStep("importing");
    setImporting(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/service-imports/start", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Error al importar los servicios");
        setStep("preview");
        setImporting(false);
        return;
      }
      const data = (await res.json()) as ImportSummary;
      setImportSummary(data);
      setImporting(false);
      setStep("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error de red al importar");
      setStep("preview");
      setImporting(false);
    }
  }, [file]);

  /* ─── Download Template ─── */

  const downloadTemplate = () => {
    const headers = ["servicio", "categoria", "precio", "duracion", "activo"];
    const exampleRows = [
      ["Consulta de Fertilidad", "Consultas", "150.00", "30", "sí"],
      ["Ecografía Transvaginal", "Procedimientos", "120.00", "15", "sí"],
    ];
    const csv =
      "﻿" +
      headers.join(",") +
      "\n" +
      exampleRows.map((r) => r.join(",")).join("\n") +
      "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla_servicios.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  /* ─── Render ─── */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <Upload className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Importación masiva de servicios</h3>
              <p className="text-[11px] text-muted-foreground">
                {step === "upload" && "Sube tu archivo CSV o Excel exportado"}
                {step === "preview" && "Revisa los datos antes de importar"}
                {step === "importing" && "Importando servicios..."}
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
          {(["upload", "preview", "importing"] as ImportStep[]).map((s, idx) => {
            const labels = ["Subir", "Revisar", "Importar"];
            const isActive = s === step;
            const isDone =
              (s === "upload" && step !== "upload") ||
              (s === "preview" && ["importing", "done"].includes(step)) ||
              (s === "importing" && step === "done");
            return (
              <div key={s} className="flex items-center gap-1">
                {idx > 0 && <div className="mx-1 h-px w-4 bg-border" />}
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    isActive && "bg-primary/10 text-primary",
                    isDone && "text-success-400",
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
                  <p className="text-sm font-medium">Arrastra tu archivo CSV aquí</p>
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
                  <span className="text-xs font-medium">Formato esperado</span>
                </div>
                <ul className="space-y-1.5 text-[11px] text-muted-foreground ml-5 list-disc">
                  <li>
                    Columnas: <strong className="text-foreground">servicio</strong>,{" "}
                    <strong className="text-foreground">categoria</strong>, precio, duracion,
                    activo
                  </li>
                  <li>
                    <strong className="text-foreground">servicio</strong> y{" "}
                    <strong className="text-foreground">categoria</strong> son obligatorios
                  </li>
                  <li>La duración debe ser múltiplo de 15 (15, 30, 45, 60...)</li>
                  <li>
                    Las categorías que no existan se{" "}
                    <strong className="text-foreground">crearán automáticamente</strong>
                  </li>
                  <li>activo acepta: sí / no / true / false / 1 / 0 (vacío = activo)</li>
                  <li>
                    Máximo <strong className="text-foreground">2000 filas</strong> y 5MB por
                    archivo
                  </li>
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

          {/* ─── STEP: Preview ─── */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-muted/30 p-3">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                <div className="flex-1">
                  <p className="text-xs font-medium">{fileName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {rawRows.length} filas encontradas
                  </p>
                </div>
                <button
                  onClick={() => {
                    setStep("upload");
                    setRawRows([]);
                    setValidations([]);
                    setFile(null);
                  }}
                  className="rounded-lg p-1 text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-success-500/20 bg-success-500/5 p-3 text-center">
                  <p className="text-lg font-bold text-success-400">{validRows.length}</p>
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
                  <p className="text-xs font-medium text-red-400">
                    Filas con errores (no se importarán):
                  </p>
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
                  <p className="text-xs font-medium text-amber-400">
                    Advertencias (se importarán con ajustes):
                  </p>
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
                          <th className="px-2.5 py-2 text-left font-medium text-muted-foreground">Servicio</th>
                          <th className="px-2.5 py-2 text-left font-medium text-muted-foreground">Categoría</th>
                          <th className="px-2.5 py-2 text-left font-medium text-muted-foreground">Precio</th>
                          <th className="px-2.5 py-2 text-left font-medium text-muted-foreground">Duración</th>
                          <th className="px-2.5 py-2 text-left font-medium text-muted-foreground">Activo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validRows.slice(0, 10).map((v) => (
                          <tr key={v.row} className="border-b border-border/50 last:border-0">
                            <td className="px-2.5 py-1.5 text-muted-foreground">{v.row}</td>
                            <td className="px-2.5 py-1.5">{v.data.name}</td>
                            <td className="px-2.5 py-1.5 text-muted-foreground">{v.data.category || "—"}</td>
                            <td className="px-2.5 py-1.5 text-muted-foreground">
                              S/. {(v.data.base_price ?? 0).toFixed(2)}
                            </td>
                            <td className="px-2.5 py-1.5 text-muted-foreground">
                              {v.data.duration_minutes ?? 30} min
                            </td>
                            <td className="px-2.5 py-1.5 text-muted-foreground">
                              {v.data.is_active ? "Sí" : "No"}
                            </td>
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
                <p className="text-sm font-medium">Importando servicios...</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Procesando en el servidor. No cierres esta ventana.
                </p>
              </div>
            </div>
          )}

          {/* ─── STEP: Done ─── */}
          {step === "done" && importSummary && (
            <div className="flex flex-col items-center justify-center gap-4 py-6">
              <div className="rounded-full bg-success-500/10 p-3">
                <CheckCircle2 className="h-8 w-8 text-success-400" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold">Importación completada</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Total procesado: {importSummary.total_rows} filas
                </p>
              </div>
              <div className="grid w-full max-w-xs grid-cols-3 gap-3">
                <div className="rounded-lg border border-success-500/20 bg-success-500/5 p-2.5 text-center">
                  <p className="text-lg font-bold text-success-400">{importSummary.created}</p>
                  <p className="text-[10px] text-muted-foreground">Creados</p>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-center">
                  <p className="text-lg font-bold text-amber-400">{importSummary.skipped}</p>
                  <p className="text-[10px] text-muted-foreground">Duplicados</p>
                </div>
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-center">
                  <p className="text-lg font-bold text-red-400">{importSummary.failed}</p>
                  <p className="text-[10px] text-muted-foreground">Fallidos</p>
                </div>
              </div>
              {importSummary.created_categories.length > 0 && (
                <div className="w-full max-w-sm rounded-lg border border-border/50 bg-muted/20 p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">
                    Categorías creadas automáticamente:{" "}
                    <span className="font-medium text-foreground">
                      {importSummary.created_categories.join(", ")}
                    </span>
                  </p>
                </div>
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

          {step === "preview" && (
            <>
              <button
                onClick={() => setStep("upload")}
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
                Importar {validRows.length} servicios
                <Upload className="h-3 w-3" />
              </button>
            </>
          )}

          {step === "done" && (
            <button
              onClick={() => {
                onSuccess();
                onClose();
              }}
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
