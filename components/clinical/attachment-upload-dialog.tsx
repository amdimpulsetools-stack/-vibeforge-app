"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AttachmentUploadDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  patientId: string;
  appointmentId?: string | null;
  clinicalNoteId?: string | null;
  /** Pre-selected attachment category (e.g. 'consent'). */
  category: string;
  title?: string;
  description?: string;
  /** File MIME accept attribute. Defaults to image+pdf. */
  accept?: string;
  /** Called after a successful upload with the new attachment id. */
  onUploaded?: (attachmentId: string | null) => void;
}

/**
 * Standalone upload dialog used by the unified consents panel for the
 * "Subir foto del consentimiento firmado" path. We deliberately keep
 * this independent from ClinicalAttachmentsPanel: that panel has its
 * own inline dropzone tightly coupled to its list state, and we do not
 * want to touch it. Both paths POST to the same /api/clinical-attachments
 * endpoint, so the audit trail stays consistent.
 */
export function AttachmentUploadDialog({
  open,
  onOpenChange,
  patientId,
  appointmentId,
  clinicalNoteId,
  category,
  title = "Subir adjunto",
  description = "Selecciona o arrastra el archivo. Máx 10 MB.",
  accept = "image/*,.pdf",
  onUploaded,
}: AttachmentUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setNote("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const acceptFile = (f: File | null | undefined) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast.error("El archivo supera el límite de 10 MB");
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("patient_id", patientId);
      if (appointmentId) formData.append("appointment_id", appointmentId);
      if (clinicalNoteId) formData.append("clinical_note_id", clinicalNoteId);
      formData.append("category", category);
      if (note.trim()) formData.append("description", note.trim());

      const res = await fetch("/api/clinical-attachments", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { id?: string };
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error || "Error al subir archivo");
        return;
      }
      toast.success("Consentimiento adjuntado");
      onUploaded?.(json.data?.id ?? null);
      reset();
      onOpenChange(false);
    } catch {
      toast.error("Sin conexión. Revisa tu internet e intenta otra vez.");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div
            onClick={() => inputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(false);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(false);
              acceptFile(e.dataTransfer.files?.[0]);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all",
              dragActive
                ? "border-primary bg-primary/10"
                : file
                ? "border-emerald-500/50 bg-emerald-500/5"
                : "border-muted-foreground/25 bg-muted/20 hover:border-primary/60 hover:bg-primary/5"
            )}
          >
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                file
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Upload className="h-5 w-5" />
            </div>
            {file ? (
              <p className="text-sm font-medium">{file.name}</p>
            ) : (
              <>
                <p className="text-sm font-medium">
                  Arrastra una foto o haz clic para seleccionar
                </p>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG o PDF · máx 10 MB
                </p>
              </>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={accept}
            onChange={(e) => acceptFile(e.target.files?.[0])}
          />

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Descripción (opcional)"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleClose(false)}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-accent transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!file || uploading}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Subir
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
