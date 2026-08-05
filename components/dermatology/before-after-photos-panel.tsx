"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  Upload,
  Loader2,
  X,
  Trash2,
  ShieldAlert,
  ImageOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { compressPhotoForUpload } from "@/lib/dermatology/compress";

type Phase = "before" | "after" | "progress" | "final";

interface PatientPhoto {
  id: string;
  phase: Phase;
  body_zone: string | null;
  is_face_visible: boolean;
  notes: string | null;
  taken_at: string;
  thumbnail_url: string | null;
}

interface PhaseMeta {
  key: Phase;
  label: string;
  dot: string;
}

const PHASES: PhaseMeta[] = [
  { key: "before", label: "Antes", dot: "bg-amber-500" },
  { key: "after", label: "Después", dot: "bg-emerald-500" },
  { key: "progress", label: "Progreso", dot: "bg-blue-500" },
  { key: "final", label: "Final", dot: "bg-violet-500" },
];

const phaseLabel = (p: Phase) => PHASES.find((x) => x.key === p)?.label ?? p;

interface Props {
  patientId: string;
  /** When false the panel is a read-only gallery (patient drawer). */
  canEdit: boolean;
  appointmentId?: string;
  doctorId?: string;
}

export function BeforeAfterPhotosPanel({ patientId, canEdit, appointmentId, doctorId }: Props) {
  const [photos, setPhotos] = useState<PatientPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Phase | "all">("all");

  // Upload form state
  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<Phase>("before");
  const [bodyZone, setBodyZone] = useState("");
  const [faceVisible, setFaceVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lightbox
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxLoading, setLightboxLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dermatology/photos?patient_id=${encodeURIComponent(patientId)}`);
      const body = await res.json();
      setPhotos(res.ok ? (body.data ?? []) : []);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  const onPickFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Selecciona una imagen");
        return;
      }
      setUploading(true);
      try {
        // Compress in a Web Worker → never blocks the UI, shrinks a
        // 10 MB phone photo to ~1 MB before it ever hits the network.
        const { display, thumb, displaySize } = await compressPhotoForUpload(file);

        const fd = new FormData();
        fd.append("display", display);
        fd.append("thumb", thumb);
        fd.append("patient_id", patientId);
        fd.append("phase", uploadPhase);
        if (bodyZone.trim()) fd.append("body_zone", bodyZone.trim());
        fd.append("is_face_visible", String(faceVisible));
        if (appointmentId) fd.append("appointment_id", appointmentId);
        if (doctorId) fd.append("doctor_id", doctorId);

        const res = await fetch("/api/dermatology/photos", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error ?? "No se pudo subir la foto");
          return;
        }
        toast.success(
          `Foto "${phaseLabel(uploadPhase)}" subida (${(displaySize / 1024).toFixed(0)} KB)`
        );
        setPhotos((prev) => [json.data, ...prev]);
        setBodyZone("");
      } catch (e) {
        toast.error("Error al procesar la imagen");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [patientId, uploadPhase, bodyZone, faceVisible, appointmentId, doctorId]
  );

  const openLightbox = useCallback(async (id: string) => {
    setLightboxId(id);
    setLightboxUrl(null);
    setLightboxLoading(true);
    try {
      const res = await fetch(`/api/dermatology/photos/${id}`);
      const body = await res.json();
      if (res.ok) setLightboxUrl(body.url);
    } finally {
      setLightboxLoading(false);
    }
  }, []);

  const deletePhoto = useCallback(async (id: string) => {
    const res = await fetch(`/api/dermatology/photos/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      setLightboxId(null);
      toast.success("Foto eliminada");
    } else {
      toast.error("No se pudo eliminar");
    }
  }, []);

  const visible = filter === "all" ? photos : photos.filter((p) => p.phase === filter);

  return (
    <div className="space-y-4">
      {/* Upload zone (write-from-the-appointment) */}
      {canEdit && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Camera className="h-4 w-4 text-pink-500" />
            Subir foto
          </div>

          {/* Phase selector */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {PHASES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setUploadPhase(p.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  uploadPhase === p.key
                    ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", p.dot)} />
                {p.label}
              </button>
            ))}
          </div>

          {/* Optional metadata */}
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={bodyZone}
              onChange={(e) => setBodyZone(e.target.value)}
              placeholder="Zona (opcional): frente, mejilla der., mentón…"
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-emerald-500"
            />
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={faceVisible}
                onChange={(e) => setFaceVisible(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-emerald-500"
              />
              El rostro es visible (foto sensible)
            </label>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickFile(f);
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
              "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            )}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Comprimiendo y subiendo…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Tomar / elegir foto
              </>
            )}
          </button>

          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            Asegúrate de contar con el consentimiento de fotografía firmado del
            paciente antes de subir imágenes (Ley 29733).
          </p>
        </div>
      )}

      {/* Filter chips */}
      {photos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === "all"
                ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            Todas ({photos.length})
          </button>
          {PHASES.map((p) => {
            const n = photos.filter((x) => x.phase === p.key).length;
            if (n === 0) return null;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setFilter(p.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filter === p.key
                    ? "border-emerald-500 bg-emerald-500/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", p.dot)} />
                {p.label} ({n})
              </button>
            );
          })}
        </div>
      )}

      {/* Gallery */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <ImageOff className="h-8 w-8 opacity-40" />
          {canEdit ? "Aún no hay fotos. Sube la primera arriba." : "Este paciente no tiene fotos."}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {visible.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openLightbox(p.id)}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
            >
              {p.thumbnail_url ? (
                // Plain <img> with native lazy-loading: the gallery never
                // blocks on off-screen thumbnails, and these are signed
                // URLs (not statically known) so next/image isn't a fit.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.thumbnail_url}
                  alt={`${phaseLabel(p.phase)}${p.body_zone ? ` · ${p.body_zone}` : ""}`}
                  loading="lazy"
                  decoding="async"
                  className={cn(
                    "h-full w-full object-cover transition-transform group-hover:scale-105",
                    p.is_face_visible && "blur-md group-hover:blur-none"
                  )}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImageOff className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              {/* Phase badge */}
              <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">
                <span className={cn("h-1.5 w-1.5 rounded-full", PHASES.find((x) => x.key === p.phase)?.dot)} />
                {phaseLabel(p.phase)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxId(null)}
        >
          <div
            className="relative max-h-[90dvh] max-w-3xl overflow-hidden rounded-xl bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxId(null)}
              className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex min-h-[200px] items-center justify-center">
              {lightboxLoading || !lightboxUrl ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={lightboxUrl}
                  alt="Foto"
                  className="max-h-[80dvh] w-auto object-contain"
                />
              )}
            </div>
            {canEdit && lightboxId && (
              <div className="flex justify-end border-t border-border p-2">
                <button
                  type="button"
                  onClick={() => deletePhoto(lightboxId)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
