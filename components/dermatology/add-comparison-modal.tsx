"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GalleryPhoto {
  id: string;
  phase: string;
  body_zone: string | null;
  taken_at: string;
  thumbnail_url: string | null;
  is_face_visible: boolean;
}

interface Props {
  patientId: string;
  photos: GalleryPhoto[];
  onClose: () => void;
  /** Called with nothing — the parent re-fetches the comparison list. */
  onCreated: () => void;
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

function PhotoPicker({
  label,
  photos,
  selectedId,
  excludeId,
  onSelect,
}: {
  label: string;
  photos: GalleryPhoto[];
  selectedId: string | null;
  excludeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {photos.map((p) => {
          const disabled = p.id === excludeId;
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(p.id)}
              className={cn(
                "relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-all",
                selectedId === p.id
                  ? "border-emerald-500 ring-2 ring-emerald-500/30"
                  : "border-border hover:border-emerald-500/50",
                disabled && "opacity-30"
              )}
            >
              {p.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.thumbnail_url}
                  alt={shortDate(p.taken_at)}
                  className={cn(
                    "h-full w-full object-cover",
                    p.is_face_visible && "blur-sm"
                  )}
                />
              ) : (
                <div className="h-full w-full bg-muted" />
              )}
              <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[9px] font-medium text-white">
                {shortDate(p.taken_at)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AddComparisonModal({ patientId, photos, onClose, onCreated }: Props) {
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Oldest-first is the natural order to pick a "before"; keep one list
  // for both pickers so any photo can play either role.
  const ordered = useMemo(
    () => [...photos].sort((a, b) => a.taken_at.localeCompare(b.taken_at)),
    [photos]
  );

  const canSave = beforeId && afterId && title.trim().length > 0 && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/dermatology/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          before_photo_id: beforeId,
          after_photo_id: afterId,
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "No se pudo crear la comparativa");
        return;
      }
      toast.success("Comparativa creada");
      onCreated();
      onClose();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="text-sm font-semibold">Nueva comparativa</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70dvh] space-y-4 overflow-y-auto p-5">
          <PhotoPicker
            label="1 · Foto de antes"
            photos={ordered}
            selectedId={beforeId}
            excludeId={afterId}
            onSelect={setBeforeId}
          />
          <PhotoPicker
            label="2 · Foto de después"
            photos={ordered}
            selectedId={afterId}
            excludeId={beforeId}
            onSelect={setAfterId}
          />

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              3 · Procedimiento
            </p>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Ej.: Relleno surcos nasogenianos"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-emerald-500"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Descripción (opcional): técnica, producto, resultado…"
              className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear comparativa
          </button>
        </div>
      </div>
    </div>
  );
}
