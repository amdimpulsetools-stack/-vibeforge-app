"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronsLeftRight, Eye, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComparisonPhoto {
  id: string;
  url: string | null;
  taken_at: string;
  is_face_visible: boolean;
}

export interface Comparison {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  before: ComparisonPhoto;
  after: ComparisonPhoto;
}

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** "Mar → Ago 2026" (same year) or "Nov 2025 → Jun 2026". */
export function formatDateRange(beforeIso: string, afterIso: string): string {
  const b = new Date(beforeIso);
  const a = new Date(afterIso);
  const bm = MONTHS_ES[b.getMonth()];
  const am = MONTHS_ES[a.getMonth()];
  if (b.getFullYear() === a.getFullYear()) {
    // Same month and year: "Jun 2026", not the redundant "Jun → Jun 2026"
    if (b.getMonth() === a.getMonth()) return `${am} ${a.getFullYear()}`;
    return `${bm} → ${am} ${a.getFullYear()}`;
  }
  return `${bm} ${b.getFullYear()} → ${am} ${a.getFullYear()}`;
}

interface Props {
  comparison: Comparison;
  canEdit: boolean;
  onDelete?: (id: string) => void;
}

export function ComparisonCard({ comparison, canEdit, onDelete }: Props) {
  const { title, description, before, after } = comparison;
  // Divider position as a percentage of the card width. Left of the
  // divider shows the BEFORE photo, right shows the AFTER.
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);
  const sensitive = before.is_face_visible || after.is_face_visible;
  const [revealed, setRevealed] = useState(!sensitive);
  const boxRef = useRef<HTMLDivElement>(null);

  const posFromClientX = useCallback((clientX: number) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(96, Math.max(4, pct)));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!revealed) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      posFromClientX(e.clientX);
    },
    [posFromClientX, revealed]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragging) posFromClientX(e.clientX);
    },
    [dragging, posFromClientX]
  );

  const stopDrag = useCallback(() => setDragging(false), []);

  return (
    <div className="group/card overflow-hidden rounded-xl border border-border bg-card">
      {/* Comparator */}
      <div
        ref={boxRef}
        role="slider"
        aria-label={`Comparador antes/después: ${title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPos((p) => Math.max(4, p - 4));
          if (e.key === "ArrowRight") setPos((p) => Math.min(96, p + 4));
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        className="relative aspect-[4/3] cursor-ew-resize select-none touch-none overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        {after.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={after.url}
            alt="Después"
            draggable={false}
            className={cn("absolute inset-0 h-full w-full object-cover", !revealed && "blur-lg")}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {before.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={before.url}
            alt="Antes"
            draggable={false}
            style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
            className={cn("absolute inset-0 h-full w-full object-cover", !revealed && "blur-lg")}
          />
        )}

        {/* Divider + handle */}
        <div
          className="absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_6px_rgba(0,0,0,0.4)]"
          style={{ left: `${pos}%` }}
        />
        <div
          className="absolute top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-700 shadow-md"
          style={{ left: `${pos}%` }}
        >
          <ChevronsLeftRight className="h-4 w-4" />
        </div>

        {/* Phase badges */}
        <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Antes
        </span>
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Después
        </span>

        {/* Sensitive-photo veil (face visible): blur until explicitly revealed */}
        {!revealed && (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/30 text-white"
          >
            <Eye className="h-5 w-5" />
            <span className="text-xs font-medium">Foto sensible — toca para ver</span>
          </button>
        )}

        {/* Delete (edit mode only) */}
        {canEdit && onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(comparison.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover/card:opacity-100 focus-visible:opacity-100"
            aria-label="Eliminar comparativa"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Card body */}
      <div className="space-y-1 p-4">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
          {formatDateRange(before.taken_at, after.taken_at)}
        </p>
        {description && (
          <p className="pt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}
