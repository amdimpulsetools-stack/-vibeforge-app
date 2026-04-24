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
  const fileRef = useRef<HTMLInputElement>(null);

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
    const file = fileRef.current?.files?.[0];
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
        {canEdit && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 rounded-md bg-orange-500/10 px-2 py-1 text-[10px] font-medium text-orange-600 hover:bg-orange-500/20 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Subir
          </button>
        )}
      </div>

      {/* Upload form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div
            onClick={() => fileRef.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-muted-foreground/30 px-3 py-4 hover:border-primary/50 transition-colors"
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {fileRef.current?.files?.[0]?.name || "Haga clic para seleccionar archivo"}
            </span>
            <span className="text-[10px] text-muted-foreground/60">Max 10MB</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt"
            onChange={() => {
              // Force re-render to show selected file name
              setCategory((c) => c);
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
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
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={handleUpload}
              disabled={uploading || !fileRef.current?.files?.length}
              className="flex-1 flex items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              Subir
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Attachments list */}
      {attachments.length === 0 && !showForm && (
        <p className="text-center text-xs text-muted-foreground py-4">
          Sin adjuntos
        </p>
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
