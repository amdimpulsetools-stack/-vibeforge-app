"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  CalendarDays,
  ChevronDown,
  Heart,
  Loader2,
  Lock,
  Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SOAP_LABELS,
  VITALS_FIELDS,
  type ClinicalNote,
  type ClinicalNoteDiagnosis,
  type SOAPSection,
  type Vitals,
} from "@/types/clinical-notes";

interface NotesTimelineProps {
  patientId: string | null;
  /** ID de la nota actual (de la consulta abierta) — se omite del timeline. */
  currentNoteId?: string | null;
}

type TimelineNote = ClinicalNote & {
  doctors?: { full_name: string; color: string } | null;
  diagnoses?: ClinicalNoteDiagnosis[];
};

type SortOrder = "desc" | "asc";

export function NotesTimeline({ patientId, currentNoteId }: NotesTimelineProps) {
  const [notes, setNotes] = useState<TimelineNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const fetchedFor = useRef<string | null>(null);

  const fetchNotes = useCallback(async () => {
    if (!patientId) {
      setLoading(false);
      return;
    }
    if (fetchedFor.current === patientId) return; // ya cargado para este paciente
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clinical-notes?patient_id=${patientId}`);
      if (!res.ok) throw new Error("No se pudo cargar el historial");
      const json = await res.json();
      setNotes((json.data ?? []) as TimelineNote[]);
      fetchedFor.current = patientId;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const visibleNotes = useMemo(() => {
    const filtered = currentNoteId
      ? notes.filter((n) => n.id !== currentNoteId)
      : notes;
    return filtered.slice().sort((a, b) => {
      const aT = new Date(a.created_at).getTime();
      const bT = new Date(b.created_at).getTime();
      return sortOrder === "desc" ? bT - aT : aT - bT;
    });
  }, [notes, currentNoteId, sortOrder]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedIds(new Set(visibleNotes.map((n) => n.id)));
  }, [visibleNotes]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  if (!patientId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Stethoscope className="h-8 w-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          Esta cita no tiene paciente vinculado, no hay historial que mostrar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Orden</span>
          <button
            type="button"
            onClick={() => setSortOrder((s) => (s === "desc" ? "asc" : "desc"))}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
            title={
              sortOrder === "desc"
                ? "Más reciente primero · click para invertir"
                : "Más antigua primero · click para invertir"
            }
          >
            {sortOrder === "desc" ? (
              <>
                <ArrowDownNarrowWide className="h-3.5 w-3.5" />
                Más reciente
              </>
            ) : (
              <>
                <ArrowUpNarrowWide className="h-3.5 w-3.5" />
                Más antigua
              </>
            )}
          </button>
        </div>
        {visibleNotes.length > 1 && (
          <div className="flex items-center gap-1 text-[11px]">
            <button
              type="button"
              onClick={expandAll}
              className="text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
            >
              Expandir todo
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button
              type="button"
              onClick={collapseAll}
              className="text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
            >
              Colapsar
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      ) : visibleNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Aún no hay consultas previas registradas para este paciente.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              expanded={expandedIds.has(note.id)}
              onToggle={() => toggleExpand(note.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────

function NoteCard({
  note,
  expanded,
  onToggle,
}: {
  note: TimelineNote;
  expanded: boolean;
  onToggle: () => void;
}) {
  const dateStr = new Date(note.created_at).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const timeStr = new Date(note.created_at).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Diagnósticos ordenados (primary primero) — fallback al campo legacy.
  const diagnoses = useMemo(() => {
    if (note.diagnoses && note.diagnoses.length > 0) {
      return note.diagnoses.slice().sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return a.position - b.position;
      });
    }
    if (note.diagnosis_code) {
      return [
        {
          id: "legacy",
          clinical_note_id: note.id,
          organization_id: note.organization_id,
          code: note.diagnosis_code,
          label: note.diagnosis_label ?? note.diagnosis_code,
          is_primary: true,
          position: 0,
          created_at: note.created_at,
        } as ClinicalNoteDiagnosis,
      ];
    }
    return [];
  }, [note]);

  return (
    <div
      className={cn(
        "rounded-lg border border-border overflow-hidden transition-all",
        note.is_signed && "border-l-4 border-l-emerald-500"
      )}
    >
      {/* Header (clickable) */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 flex-1">
          <Stethoscope className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-sm font-semibold whitespace-nowrap">
            {dateStr}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {timeStr}
          </span>
          {note.doctors && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: note.doctors.color }}
              />
              <span className="truncate">{note.doctors.full_name}</span>
            </span>
          )}
          {/* Diagnósticos primero (chips compactos) */}
          {diagnoses.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {diagnoses.slice(0, 2).map((d) => (
                <span
                  key={d.code}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]",
                    d.is_primary
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-muted/40 text-foreground"
                  )}
                >
                  <span className="font-mono font-semibold">{d.code}</span>
                </span>
              ))}
              {diagnoses.length > 2 && (
                <span className="text-[10px] text-muted-foreground">
                  +{diagnoses.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {note.is_signed && (
            <Lock className="h-3.5 w-3.5 text-emerald-500" />
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Body — solo se monta cuando se expande (lazy render). */}
      {expanded && <NoteBody note={note} diagnoses={diagnoses} />}
    </div>
  );
}

// ─── Body (lazy-rendered) ──────────────────────────────────────────

function NoteBody({
  note,
  diagnoses,
}: {
  note: TimelineNote;
  diagnoses: ClinicalNoteDiagnosis[];
}) {
  const hasVitals = VITALS_FIELDS.some(
    (f) => note.vitals?.[f.key as keyof Vitals] != null
  );

  return (
    <div className="border-t border-border px-5 py-4 space-y-4 bg-muted/10">
      {/* SOAP — vertical stack para lectura cómoda */}
      <div className="space-y-3">
        {(Object.keys(SOAP_LABELS) as SOAPSection[]).map((section) => {
          const content = note[section];
          if (!content) return null;
          const { letter, label } = SOAP_LABELS[section];
          return (
            <div
              key={section}
              className="rounded-lg border border-border/50 bg-card p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white",
                    section === "subjective" && "bg-blue-500",
                    section === "objective" && "bg-emerald-500",
                    section === "assessment" && "bg-amber-500",
                    section === "plan" && "bg-purple-500"
                  )}
                >
                  {letter}
                </span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {label}
                </span>
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap pl-8">
                {content}
              </p>
            </div>
          );
        })}
      </div>

      {/* Diagnósticos */}
      {diagnoses.length > 0 && (
        <div className="rounded-lg bg-card border border-border/50 px-4 py-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase block mb-2">
            Diagnóstico{diagnoses.length > 1 ? "s" : ""}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {diagnoses.map((d, i) => (
              <span
                key={d.code}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs",
                  i === 0
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground"
                )}
              >
                <span className="font-mono font-semibold">{d.code}</span>
                <span className="opacity-80">{d.label}</span>
                {i === 0 && diagnoses.length > 1 && (
                  <span className="text-[9px] uppercase tracking-wide opacity-70">
                    principal
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Vitales */}
      {hasVitals && (
        <div className="rounded-lg bg-card border border-border/50 px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Heart className="h-4 w-4 text-red-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Signos Vitales
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
            {VITALS_FIELDS.filter(
              (f) => note.vitals?.[f.key as keyof Vitals] != null
            ).map((f) => (
              <div
                key={f.key}
                className="rounded-lg bg-muted/40 px-3 py-2 text-center"
              >
                <p className="text-[10px] text-muted-foreground">{f.label}</p>
                <p className="text-sm font-semibold">
                  {note.vitals[f.key as keyof Vitals]}{" "}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {f.unit}
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {note.is_signed && note.signed_at && (
        <p className="text-xs text-muted-foreground/70">
          Firmada el{" "}
          {new Date(note.signed_at).toLocaleDateString("es-PE", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
      )}
    </div>
  );
}
