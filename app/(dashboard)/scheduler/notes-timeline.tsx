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
  Pill,
  Stethoscope,
  TestTube,
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
import type { PrescriptionWithDoctor } from "@/types/clinical-history";

interface NotesTimelineProps {
  patientId: string | null;
  /** ID de la nota actual (de la consulta abierta) — se omite del timeline. */
  currentNoteId?: string | null;
}

type TimelineNote = ClinicalNote & {
  doctors?: { full_name: string; color: string } | null;
  diagnoses?: ClinicalNoteDiagnosis[];
};

interface ExamOrderItemRow {
  id: string;
  order_id: string;
  exam_name: string;
  instructions: string | null;
  status: "pending" | "completed";
}

interface ExamOrderRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  clinical_note_id: string | null;
  appointment_id: string | null;
  diagnosis: string | null;
  diagnosis_code: string | null;
  notes: string | null;
  status: "pending" | "partial" | "completed";
  created_at: string;
  exam_order_items?: ExamOrderItemRow[];
}

type SortOrder = "desc" | "asc";

export function NotesTimeline({ patientId, currentNoteId }: NotesTimelineProps) {
  const [notes, setNotes] = useState<TimelineNote[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionWithDoctor[]>([]);
  const [examOrders, setExamOrders] = useState<ExamOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const fetchedFor = useRef<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!patientId) {
      setLoading(false);
      return;
    }
    if (fetchedFor.current === patientId) return; // ya cargado para este paciente
    setLoading(true);
    setError(null);
    try {
      // 3 fetches en paralelo. Las prescripciones y exámenes pueden devolver
      // sin permiso para algunos roles (recepcionistas) — fallamos blando ahí
      // (la sección simplemente no muestra esa info).
      const [notesRes, rxRes, examRes] = await Promise.all([
        fetch(`/api/clinical-notes?patient_id=${patientId}`),
        fetch(`/api/prescriptions?patient_id=${patientId}`),
        fetch(`/api/exam-orders?patient_id=${patientId}`),
      ]);
      if (!notesRes.ok) throw new Error("No se pudo cargar el historial");
      const notesJson = await notesRes.json();
      setNotes((notesJson.data ?? []) as TimelineNote[]);

      if (rxRes.ok) {
        const rxJson = await rxRes.json();
        setPrescriptions((rxJson.data ?? []) as PrescriptionWithDoctor[]);
      }
      if (examRes.ok) {
        const examJson = await examRes.json();
        setExamOrders((examJson.data ?? []) as ExamOrderRow[]);
      }
      fetchedFor.current = patientId;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Indexar por clinical_note_id para lookup O(1) en cada card.
  const prescriptionsByNote = useMemo(() => {
    const map = new Map<string, PrescriptionWithDoctor[]>();
    for (const rx of prescriptions) {
      if (!rx.clinical_note_id) continue;
      const list = map.get(rx.clinical_note_id) ?? [];
      list.push(rx);
      map.set(rx.clinical_note_id, list);
    }
    return map;
  }, [prescriptions]);

  const examOrdersByNote = useMemo(() => {
    const map = new Map<string, ExamOrderRow[]>();
    for (const order of examOrders) {
      if (!order.clinical_note_id) continue;
      const list = map.get(order.clinical_note_id) ?? [];
      list.push(order);
      map.set(order.clinical_note_id, list);
    }
    return map;
  }, [examOrders]);

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
              prescriptions={prescriptionsByNote.get(note.id) ?? []}
              examOrders={examOrdersByNote.get(note.id) ?? []}
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
  prescriptions,
  examOrders,
}: {
  note: TimelineNote;
  expanded: boolean;
  onToggle: () => void;
  prescriptions: PrescriptionWithDoctor[];
  examOrders: ExamOrderRow[];
}) {
  const totalExamItems = examOrders.reduce(
    (acc, o) => acc + (o.exam_order_items?.length ?? 0),
    0
  );
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
          {/* Counters de receta/examen — pista visual de qué hay sin expandir */}
          {prescriptions.length > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
              title={`${prescriptions.length} medicamento${prescriptions.length === 1 ? "" : "s"}`}
            >
              <Pill className="h-3 w-3" />
              {prescriptions.length}
            </span>
          )}
          {totalExamItems > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
              title={`${totalExamItems} examen${totalExamItems === 1 ? "" : "es"}`}
            >
              <TestTube className="h-3 w-3" />
              {totalExamItems}
            </span>
          )}
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
      {expanded && (
        <NoteBody
          note={note}
          diagnoses={diagnoses}
          prescriptions={prescriptions}
          examOrders={examOrders}
        />
      )}
    </div>
  );
}

// ─── Body (lazy-rendered) ──────────────────────────────────────────

function NoteBody({
  note,
  diagnoses,
  prescriptions,
  examOrders,
}: {
  note: TimelineNote;
  diagnoses: ClinicalNoteDiagnosis[];
  prescriptions: PrescriptionWithDoctor[];
  examOrders: ExamOrderRow[];
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

      {/* Medicamentos recetados */}
      {prescriptions.length > 0 && (
        <div className="rounded-lg bg-card border border-border/50 px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Pill className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Medicamentos recetados
            </span>
            <span className="text-[10px] text-muted-foreground">
              · {prescriptions.length}
            </span>
          </div>
          <ul className="space-y-1.5">
            {prescriptions.map((rx) => (
              <li
                key={rx.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm leading-snug"
              >
                <span className="font-medium text-foreground">{rx.medication}</span>
                {[rx.dosage, rx.frequency, rx.duration]
                  .filter((v): v is string => Boolean(v && v.trim()))
                  .map((part, i, arr) => (
                    <span key={i} className="text-xs text-muted-foreground">
                      {part}
                      {i < arr.length - 1 && (
                        <span className="text-muted-foreground/50"> · </span>
                      )}
                    </span>
                  ))}
                {rx.route && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                    ({rx.route})
                  </span>
                )}
                {rx.instructions && (
                  <span className="block w-full text-[11px] text-muted-foreground/80 italic pl-3">
                    {rx.instructions}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Exámenes solicitados */}
      {examOrders.length > 0 && (
        <div className="rounded-lg bg-card border border-border/50 px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <TestTube className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Exámenes solicitados
            </span>
          </div>
          <div className="space-y-2">
            {examOrders.map((order) => {
              const items = order.exam_order_items ?? [];
              return (
                <div key={order.id} className="space-y-1">
                  {order.diagnosis && (
                    <p className="text-[11px] text-muted-foreground">
                      Por: <span className="text-foreground">{order.diagnosis}</span>
                    </p>
                  )}
                  {items.length > 0 ? (
                    <ul className="space-y-0.5">
                      {items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-baseline gap-2 text-sm leading-snug"
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0 mt-1.5",
                              item.status === "completed"
                                ? "bg-emerald-500"
                                : "bg-muted-foreground/40"
                            )}
                            title={
                              item.status === "completed"
                                ? "Completado"
                                : "Pendiente"
                            }
                          />
                          <span className="text-foreground">{item.exam_name}</span>
                          {item.instructions && (
                            <span className="text-xs text-muted-foreground/80 italic">
                              · {item.instructions}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Orden sin ítems
                    </p>
                  )}
                  {order.notes && (
                    <p className="text-[11px] text-muted-foreground/80 italic pl-3">
                      Notas: {order.notes}
                    </p>
                  )}
                </div>
              );
            })}
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
