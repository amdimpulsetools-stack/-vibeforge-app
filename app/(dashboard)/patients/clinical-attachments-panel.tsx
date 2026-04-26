"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ClinicalAttachment } from "@/types/clinical-history";
import { ATTACHMENT_CATEGORIES } from "@/types/clinical-history";
import {
  Paperclip,
  Plus,
  Loader2,
  X,
  Download,
  Trash2,
  FileText,
  Image,
  File,
  Upload,
} from "lucide-react";
import {
  CLINICAL_PANEL_CTA,
  CLINICAL_PANEL_CTA_ICON,
  CLINICAL_PANEL_CTA_VARIANTS,
} from "@/lib/clinical-ui-tokens";

interface ClinicalAttachmentsPanelProps {
  patientId: string;
  clinicalNoteId?: string;
  appointmentId?: string;
  canEdit: boolean;
}

const FILE_ICONS: Record<string, typeof FileText> = {
  "application/pdf": FileText,
  "image/png": Image,
  "image/jpeg": Image,
  "image/webp": Image,
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ClinicalAttachmentsPanel({
  patientId,
  clinicalNoteId,
  appointmentId,
  canEdit,
}: ClinicalAttachmentsPanelProps) {
  const [attachments, setAttachments] = useState<ClinicalAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<string>("general");
  const [description, setDescription] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const acceptFile = (file: File | null | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("El archivo supera el límite de 10 MB");
      return;
    }
    setSelectedFile(file);
    if (fileRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileRef.current.files = dt.files;
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const fetchAttachments = useCallback(async () => {
    const param = clinicalNoteId
      ? `clinical_note_id=${clinicalNoteId}`
      : `patient_id=${patientId}`;
    try {
      const res = await fetch(`/api/clinical-attachments?${param}`);
      const json = await res.json();
      setAttachments(json.data ?? []);
    } catch {
      toast.error("Error al cargar adjuntos");
    }
    setLoading(false);
  }, [patientId, clinicalNoteId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleUpload = async () => {
    const file = selectedFile ?? fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("patient_id", patientId);
      if (clinicalNoteId) formData.append("clinical_note_id", clinicalNoteId);
      if (appointmentId) formData.append("appointment_id", appointmentId);
      formData.append("category", category);
      if (description.trim()) formData.append("description", description.trim());

      const res = await fetch("/api/clinical-attachments", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        toast.success("Archivo subido");
        setShowForm(false);
        setCategory("general");
        setDescription("");
        setSelectedFile(null);
        if (fileRef.current) fileRef.current.value = "";
        fetchAttachments();
      } else {
        const json = await res.json();
        toast.error(json.error || "Error al subir archivo");
      }
    } catch {
      toast.error("Sin conexión. Revisa tu internet e intenta otra vez.");
    }
    setUploading(false);
  };

  const handleDownload = async (att: ClinicalAttachment) => {
    try {
      const res = await fetch(`/api/clinical-attachments/${att.id}`);
      const json = await res.json();
      if (json.url) {
        window.open(json.url, "_blank");
      } else {
        toast.error("No se pudo obtener enlace de descarga");
      }
    } catch {
      toast.error("Error al descargar");
    }
  };

  const handleDelete = async (att: ClinicalAttachment) => {
    try {
      const res = await fetch(`/api/clinical-attachments/${att.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Archivo eliminado");
        fetchAttachments();
      }
    } catch {
      toast.error("Error al eliminar");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Paperclip className="h-4 w-4 text-orange-500" />
          <span className="text-xs font-semibold">Adjuntos</span>
          {attachments.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium">
              {attachments.length}
            </span>
          )}
        </div>
        {canEdit && attachments.length > 0 && (
          <button
            onClick={() => setShowForm(!showForm)}
            className={cn(CLINICAL_PANEL_CTA, CLINICAL_PANEL_CTA_VARIANTS.orange)}
            aria-label="Subir nuevo adjunto"
          >
            <Plus className={CLINICAL_PANEL_CTA_ICON} />
            Subir archivo
          </button>
        )}
      </div>

      {/* Upload form — auto-shown when there are no attachments and the user
           can edit; otherwise toggled via the "Subir archivo" button. */}
      {canEdit && (showForm || attachments.length === 0) && (
        <div className="space-y-2">
          <div
            onClick={() => fileRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
            aria-label="Arrastra un archivo aquí o haz clic para seleccionar"
            className={cn(
              "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all",
              dragActive
                ? "border-orange-500 bg-orange-500/10"
                : selectedFile
                ? "border-emerald-500/50 bg-emerald-500/5"
                : "border-muted-foreground/25 bg-muted/20 hover:border-orange-500/60 hover:bg-orange-500/5"
            )}
          >
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
                dragActive
                  ? "bg-orange-500/20 text-orange-600 dark:text-orange-400"
                  : selectedFile
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground group-hover:bg-orange-500/15 group-hover:text-orange-600"
              )}
            >
              <Upload className="h-6 w-6" />
            </div>
            {selectedFile ? (
              <>
                <p className="text-sm font-semibold text-foreground">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)} · listo para subir
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">
                  {dragActive ? "Suelta el archivo aquí" : "Arrastra un archivo o haz clic para seleccionar"}
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, imágenes (JPG/PNG/WebP), DOC, TXT · máx 10 MB
                </p>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt"
            onChange={(e) => acceptFile(e.target.files?.[0])}
          />
          {selectedFile && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {Object.entries(ATTACHMENT_CATEGORIES).map(([key, cat]) => (
                    <option key={key} value={key}>
                      {cat.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descripción (opcional)"
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className={cn(CLINICAL_PANEL_CTA, CLINICAL_PANEL_CTA_VARIANTS.orange, "flex-1")}
                >
                  {uploading ? (
                    <Loader2 className={CLINICAL_PANEL_CTA_ICON + " animate-spin"} />
                  ) : (
                    <Upload className={CLINICAL_PANEL_CTA_ICON} />
                  )}
                  Subir archivo
                </button>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                    if (attachments.length > 0) setShowForm(false);
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-accent transition-colors"
                  aria-label="Cancelar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {attachments.map((att) => {
        const Icon = FILE_ICONS[att.file_type] || File;
        const catLabel =
          ATTACHMENT_CATEGORIES[att.category as keyof typeof ATTACHMENT_CATEGORIES]?.label ??
          att.category;

        return (
          <div
            key={att.id}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
          >
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{att.file_name}</p>
              <p className="text-[10px] text-muted-foreground">
                {catLabel} &middot; {formatFileSize(att.file_size)} &middot;{" "}
                {new Date(att.created_at).toLocaleDateString("es-PE")}
              </p>
              {att.description && (
                <p className="text-[10px] text-muted-foreground/70 truncate">
                  {att.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleDownload(att)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Descargar"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              {canEdit && (
                <button
                  onClick={() => handleDelete(att)}
                  className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
