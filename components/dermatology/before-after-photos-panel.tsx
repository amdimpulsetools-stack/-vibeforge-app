"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Camera,
  Upload,
  Loader2,
  X,
  Trash2,
  ShieldAlert,
  ImageOff,
  Plus,
  Info,
  FileSignature,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { compressPhotoForUpload } from "@/lib/dermatology/compress";
import { ComparisonCard, type Comparison } from "@/components/dermatology/comparison-card";
import { AddComparisonModal } from "@/components/dermatology/add-comparison-modal";

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

const thumbDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" });

export function BeforeAfterPhotosPanel({ patientId, canEdit, appointmentId, doctorId }: Props) {
  const [photos, setPhotos] = useState<PatientPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Phase | "all">("all");

  // Curated before/after comparisons (slider cards)
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [showAddComparison, setShowAddComparison] = useState(false);

  // Photo-consent gate: null = still checking, false = blocked upload
  const [hasPhotoConsent, setHasPhotoConsent] = useState<boolean | null>(null);

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

  const loadComparisons = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/dermatology/comparisons?patient_id=${encodeURIComponent(patientId)}`
      );
      const body = await res.json();
      setComparisons(res.ok ? (body.data ?? []) : []);
    } catch {
      setComparisons([]);
    }
  }, [patientId]);

  // Photo-consent gate — only relevant when the panel can write.
  const checkConsent = useCallback(async () => {
    if (!canEdit) return;
    try {
      const res = await fetch(
        `/api/informed-consents?patient_id=${encodeURIComponent(patientId)}`
      );
      const body = await res.json();
      const rows: { consent_type?: string }[] = res.ok ? (body.data ?? []) : [];
      setHasPhotoConsent(rows.some((c) => c.consent_type === "fotografias"));
    } catch {
      // Fail open on a network hiccup — the API enforces the block anyway.
      setHasPhotoConsent(true);
    }
  }, [patientId, canEdit]);

  useEffect(() => {
    load();
    loadComparisons();
    checkConsent();
  }, [load, loadComparisons, checkConsent]);

  const deleteComparison = useCallback(async (id: string) => {
    const res = await fetch(`/api/dermatology/comparisons/${id}`, { method: "DELETE" });
    if (res.ok) {
      setComparisons((prev) => prev.filter((c) => c.id !== id));
      toast.success("Comparativa eliminada");
    } else {
      toast.error("No se pudo eliminar");
    }
  }, []);

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

  // While the lightbox is open, Escape closes ONLY the photo — the
  // capture-phase listener intercepts the key before the Historia
  // Clínica dialog (Radix, document-level listener) can close itself.
  useEffect(() => {
    if (!lightboxId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        setLightboxId(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lightboxId]);

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
      {/* ── Comparativas fotográficas (slider cards) ─────────────────── */}
      {(comparisons.length > 0 || (canEdit && photos.length >= 2)) && (
        <div>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              Comparativas fotográficas
            </h3>
            <p className="text-xs text-muted-foreground">
              Arrastra el divisor para comparar antes y después
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {comparisons.map((c) => (
              <ComparisonCard
                key={c.id}
                comparison={c}
                canEdit={canEdit}
                onDelete={deleteComparison}
              />
            ))}
            {canEdit && photos.length >= 2 && (
              <button
                type="button"
                onClick={() => setShowAddComparison(true)}
                className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-emerald-500/60 hover:text-emerald-600 dark:hover:text-emerald-400"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Plus className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium">Agregar comparativa</span>
                <span className="text-xs opacity-70">
                  Elige dos fotos para un nuevo procedimiento
                </span>
              </button>
            )}
          </div>
        </div>
      )}

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
          {hasPhotoConsent === false ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
              <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                <p className="font-semibold">
                  Falta el consentimiento de fotografías del paciente.
                </p>
                <p className="mt-0.5 opacity-90">
                  Registra un consentimiento de tipo «Fotografías clínicas»
                  desde la historia clínica y vuelve aquí — es requisito para
                  subir imágenes (Ley 29733).
                </p>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={uploading || hasPhotoConsent === null}
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
                Consentimiento de fotografías verificado para este paciente.
                Cada subida y acceso queda registrado en la auditoría clínica.
              </p>
            </>
          )}
        </div>
      )}

      {/* Filter chips */}
      {photos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm font-semibold text-foreground">
            Todas las fotos
          </span>
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
              {/* Taken-at date — the substance of a before/after gallery */}
              <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[9px] font-medium text-white">
                {thumbDate(p.taken_at)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Photographic protocol note */}
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Protocolo fotográfico:</span>{" "}
          las imágenes deben tomarse siempre bajo las mismas condiciones de
          iluminación, distancia y ángulo. Se recomienda fondo neutro y sin
          maquillaje. Todas las fotografías son confidenciales y están
          protegidas por la Ley de Protección de Datos Personales (Ley 29733).
        </p>
      </div>

      {/* Add-comparison modal */}
      {showAddComparison && (
        <AddComparisonModal
          patientId={patientId}
          photos={photos}
          onClose={() => setShowAddComparison(false)}
          onCreated={loadComparisons}
        />
      )}

      {/* Lightbox — full-screen photo viewer. Portaled to <body> with an
          opaque backdrop so it covers the Historia Clínica modal entirely
          (the photo stands alone); closing it reveals the modal untouched.
          No card frame around the image — the old bg-card box painted a
          white border in light theme. */}
      {lightboxId &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95"
            onClick={() => setLightboxId(null)}
          >
            {lightboxLoading || !lightboxUrl ? (
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lightboxUrl}
                alt="Foto"
                onClick={(e) => e.stopPropagation()}
                className="max-h-[92dvh] max-w-[94vw] rounded-lg object-contain shadow-2xl"
              />
            )}

            <button
              type="button"
              onClick={() => setLightboxId(null)}
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              aria-label="Cerrar foto"
            >
              <X className="h-5 w-5" />
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deletePhoto(lightboxId);
                }}
                className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-red-400 backdrop-blur-sm transition-colors hover:bg-red-500/20"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
