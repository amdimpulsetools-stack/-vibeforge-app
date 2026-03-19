"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ClinicalNote, Vitals, SOAPSection } from "@/types/clinical-notes";
import { SOAP_LABELS, VITALS_FIELDS } from "@/types/clinical-notes";
import type { ClinicalTemplateWithDoctor } from "@/types/clinical-templates";
import {
  FileText,
  Heart,
  Loader2,
  Save,
  Lock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  Search,
  LayoutTemplate,
  CloudOff,
  Cloud,
} from "lucide-react";
import { searchCIE10, type CIE10Entry } from "@/lib/cie10-catalog";
import { ClinicalNotePrintButton } from "./clinical-note-print";

interface ClinicalNotePanelProps {
  appointmentId: string;
  patientId: string | null;
  doctorId: string;
  /** Current user is the treating doctor or admin */
  canEdit: boolean;
  /** Appointment status — notes are typically filled after completion */
  appointmentStatus: string;
  /** For print */
  patientName?: string;
  patientDni?: string | null;
  doctorName?: string;
  serviceName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  clinicName?: string;
  /** When rendered inside a wide modal, uses expanded layout */
  wideLayout?: boolean;
}

export function ClinicalNotePanel({
  appointmentId,
  patientId,
  doctorId,
  canEdit,
  appointmentStatus,
  patientName,
  patientDni,
  doctorName,
  serviceName,
  appointmentDate,
  appointmentTime,
  clinicName,
  wideLayout = false,
}: ClinicalNotePanelProps) {
  const [note, setNote] = useState<ClinicalNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [showVitals, setShowVitals] = useState(false);

  // SOAP form state
  const [subjective, setSubjective] = useState("");
  const [objective, setObjective] = useState("");
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [diagnosisCode, setDiagnosisCode] = useState("");
  const [diagnosisLabel, setDiagnosisLabel] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [vitals, setVitals] = useState<Vitals>({});
  const [cie10Query, setCie10Query] = useState("");
  const [cie10Results, setCie10Results] = useState<CIE10Entry[]>([]);
  const [showCie10, setShowCie10] = useState(false);

  // Template state
  const [templates, setTemplates] = useState<ClinicalTemplateWithDoctor[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Auto-save with debounce (30s)
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);

  const triggerAutoSave = useCallback(() => {
    if (!isDirtyRef.current || !canEdit) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      if (!isDirtyRef.current) return;
      setAutoSaveStatus("saving");
      try {
        const body = {
          subjective,
          objective,
          assessment,
          plan,
          diagnosis_code: diagnosisCode || null,
          diagnosis_label: diagnosisLabel || null,
          internal_notes: internalNotes || null,
          vitals,
          patient_id: patientId,
          doctor_id: doctorId,
        };

        if (note) {
          const res = await fetch(`/api/clinical-notes/${note.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (res.ok) {
            const json = await res.json();
            setNote(json.data);
            isDirtyRef.current = false;
            setAutoSaveStatus("saved");
          } else {
            setAutoSaveStatus("error");
          }
        } else if (subjective || objective || assessment || plan) {
          const res = await fetch("/api/clinical-notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, appointment_id: appointmentId }),
          });
          if (res.ok) {
            const json = await res.json();
            setNote(json.data);
            isDirtyRef.current = false;
            setAutoSaveStatus("saved");
          } else {
            setAutoSaveStatus("error");
          }
        }
      } catch {
        setAutoSaveStatus("error");
      }
    }, 30000); // 30 seconds
  }, [note, subjective, objective, assessment, plan, diagnosisCode, diagnosisLabel, internalNotes, vitals, patientId, doctorId, canEdit, appointmentId]);

  // Track dirty state on any field change
  const markDirty = useCallback(() => {
    isDirtyRef.current = true;
    setAutoSaveStatus("idle");
    triggerAutoSave();
  }, [triggerAutoSave]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const soapState: Record<SOAPSection, { value: string; set: (v: string) => void }> = {
    subjective: { value: subjective, set: setSubjective },
    objective: { value: objective, set: setObjective },
    assessment: { value: assessment, set: setAssessment },
    plan: { value: plan, set: setPlan },
  };

  const fetchNote = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clinical-notes?appointment_id=${appointmentId}`);
      const json = await res.json();
      if (json.data) {
        const n = json.data as ClinicalNote;
        setNote(n);
        setSubjective(n.subjective);
        setObjective(n.objective);
        setAssessment(n.assessment);
        setPlan(n.plan);
        setDiagnosisCode(n.diagnosis_code ?? "");
        setDiagnosisLabel(n.diagnosis_label ?? "");
        setInternalNotes(n.internal_notes ?? "");
        setVitals(n.vitals ?? {});
        // Auto-expand vitals if any value exists
        const hasVitals = Object.values(n.vitals ?? {}).some((v) => v != null);
        if (hasVitals) setShowVitals(true);
      }
    } catch {
      toast.error("Error al cargar nota clínica");
    }
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => {
    fetchNote();
  }, [fetchNote]);

  const fetchTemplates = useCallback(async () => {
    if (templates.length > 0) return; // already loaded
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/clinical-templates");
      const json = await res.json();
      setTemplates(json.data ?? []);
    } catch {
      toast.error("Error al cargar plantillas");
    }
    setLoadingTemplates(false);
  }, [templates.length]);

  const applyTemplate = (tpl: ClinicalTemplateWithDoctor) => {
    if (tpl.subjective) setSubjective(tpl.subjective);
    if (tpl.objective) setObjective(tpl.objective);
    if (tpl.assessment) setAssessment(tpl.assessment);
    if (tpl.plan) setPlan(tpl.plan);
    if (tpl.diagnosis_code) setDiagnosisCode(tpl.diagnosis_code);
    if (tpl.diagnosis_label) setDiagnosisLabel(tpl.diagnosis_label);
    if (tpl.internal_notes) setInternalNotes(tpl.internal_notes);
    setShowTemplates(false);
    toast.success(`Plantilla "${tpl.name}" aplicada`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        subjective,
        objective,
        assessment,
        plan,
        diagnosis_code: diagnosisCode || null,
        diagnosis_label: diagnosisLabel || null,
        internal_notes: internalNotes || null,
        vitals,
        patient_id: patientId,
        doctor_id: doctorId,
      };

      if (note) {
        // Update existing
        const res = await fetch(`/api/clinical-notes/${note.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error || "Error al guardar");
          return;
        }
        setNote(json.data);
        toast.success("Nota clínica guardada");
      } else {
        // Create new
        const res = await fetch("/api/clinical-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...body,
            appointment_id: appointmentId,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error || "Error al crear nota");
          return;
        }
        setNote(json.data);
        toast.success("Nota clínica creada");
      }
    } catch {
      toast.error("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleSign = async () => {
    if (!note) return;
    if (!confirm("¿Firmar esta nota clínica? Una vez firmada no podrá ser editada.")) return;

    setSigning(true);
    try {
      const res = await fetch(`/api/clinical-notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_signed: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Error al firmar");
        return;
      }
      setNote(json.data);
      toast.success("Nota clínica firmada");
    } catch {
      toast.error("Error de red al firmar");
    } finally {
      setSigning(false);
    }
  };

  const updateVital = (key: keyof Vitals, value: string) => {
    setVitals((prev) => ({
      ...prev,
      [key]: value === "" ? null : Number(value),
    }));
    markDirty();
  };

  const isLocked = note?.is_signed === true;
  const editable = canEdit && !isLocked;
  const hasContent = subjective || objective || assessment || plan;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show prompt to create note for completed appointments
  if (!note && !canEdit) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        Sin nota clínica para esta cita
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold">Nota Clínica (SOAP)</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Auto-save indicator */}
          {editable && autoSaveStatus !== "idle" && (
            <span className={cn(
              "flex items-center gap-1 text-[10px]",
              autoSaveStatus === "saving" && "text-muted-foreground",
              autoSaveStatus === "saved" && "text-emerald-500",
              autoSaveStatus === "error" && "text-red-500",
            )}>
              {autoSaveStatus === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</>}
              {autoSaveStatus === "saved" && <><Cloud className="h-3 w-3" /> Guardado</>}
              {autoSaveStatus === "error" && <><CloudOff className="h-3 w-3" /> Error al guardar</>}
            </span>
          )}
        {isLocked && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            <Lock className="h-3 w-3" />
            Firmada
            {note?.signed_at && (
              <span className="ml-1 text-muted-foreground">
                {new Date(note.signed_at).toLocaleDateString("es-PE", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            )}
          </span>
        )}
        </div>
      </div>

      {/* Template selector — only when editable and no signed note */}
      {editable && !note?.is_signed && (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowTemplates(!showTemplates);
              if (!showTemplates) fetchTemplates();
            }}
            className="flex w-full items-center justify-between rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <LayoutTemplate className="h-3.5 w-3.5" />
              Aplicar plantilla
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showTemplates && "rotate-180")} />
          </button>
          {showTemplates && (
            <>
              <div className="fixed inset-0 z-[5]" onClick={() => setShowTemplates(false)} />
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
                {loadingTemplates ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : templates.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No hay plantillas disponibles.
                    <br />
                    <span className="text-[10px]">Crea plantillas desde Administración &gt; Plantillas Clínicas</span>
                  </div>
                ) : (
                  templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent transition-colors border-b border-border/50 last:border-0"
                    >
                      <LayoutTemplate className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">{tpl.name}</div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {tpl.specialty && <span>{tpl.specialty}</span>}
                          {tpl.is_global ? (
                            <span className="text-primary">Global</span>
                          ) : tpl.doctors?.full_name ? (
                            <span>{tpl.doctors.full_name}</span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tip for non-completed appointments */}
      {appointmentStatus !== "completed" && !note && canEdit && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Puede empezar la nota ahora. Se recomienda completarla al finalizar la cita.
          </p>
        </div>
      )}

      {/* SOAP Sections */}
      <div className={cn("space-y-3", wideLayout && "grid grid-cols-1 md:grid-cols-2 gap-4 space-y-0")}>
        {(Object.keys(SOAP_LABELS) as SOAPSection[]).map((section) => {
          const { letter, label, placeholder } = SOAP_LABELS[section];
          const { value, set } = soapState[section];

          return (
            <div key={section} className="space-y-1">
              <label className="flex items-center gap-2 text-xs font-semibold">
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white",
                    section === "subjective" && "bg-blue-500",
                    section === "objective" && "bg-emerald-500",
                    section === "assessment" && "bg-amber-500",
                    section === "plan" && "bg-purple-500"
                  )}
                >
                  {letter}
                </span>
                {label}
              </label>
              {editable ? (
                <textarea
                  value={value}
                  onChange={(e) => { set(e.target.value); markDirty(); }}
                  placeholder={placeholder}
                  rows={wideLayout ? 5 : 3}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-vertical"
                />
              ) : (
                <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm min-h-[2rem]">
                  {value || (
                    <span className="text-muted-foreground/50 italic text-xs">Sin datos</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Diagnosis with CIE-10 autocomplete */}
      <div className="space-y-2">
        <label className="text-xs font-semibold flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          Diagnóstico
        </label>
        {editable ? (
          <div className="space-y-2">
            {/* CIE-10 search */}
            <div className="relative">
              <div className="flex items-center gap-1 rounded-lg border border-input bg-background px-3 py-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={cie10Query}
                  onChange={(e) => {
                    const q = e.target.value;
                    setCie10Query(q);
                    if (q.length >= 2) {
                      setCie10Results(searchCIE10(q));
                      setShowCie10(true);
                    } else {
                      setShowCie10(false);
                    }
                  }}
                  onFocus={() => {
                    if (cie10Query.length >= 2) setShowCie10(true);
                  }}
                  placeholder="Buscar CIE-10 (ej: diabetes, J06, lumbalgia...)"
                  className="w-full bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              {showCie10 && cie10Results.length > 0 && (
                <>
                  <div className="fixed inset-0 z-[5]" onClick={() => setShowCie10(false)} />
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
                    {cie10Results.map((entry) => (
                      <button
                        key={entry.code}
                        type="button"
                        onClick={() => {
                          setDiagnosisCode(entry.code);
                          setDiagnosisLabel(entry.label);
                          setCie10Query("");
                          setShowCie10(false);
                          markDirty();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent transition-colors"
                      >
                        <span className="font-mono font-semibold text-primary shrink-0">{entry.code}</span>
                        <span className="text-foreground truncate">{entry.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Selected diagnosis display */}
            <div className="flex gap-2">
              <input
                type="text"
                value={diagnosisCode}
                onChange={(e) => { setDiagnosisCode(e.target.value); markDirty(); }}
                placeholder="CIE-10"
                className={cn("rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors", wideLayout ? "w-32" : "w-24")}
              />
              <input
                type="text"
                value={diagnosisLabel}
                onChange={(e) => { setDiagnosisLabel(e.target.value); markDirty(); }}
                placeholder="Descripción del diagnóstico"
                className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>
          </div>
        ) : (
          (diagnosisCode || diagnosisLabel) && (
            <p className="text-xs text-muted-foreground">
              {diagnosisCode && <span className="font-mono font-medium text-foreground">{diagnosisCode}</span>}
              {diagnosisCode && diagnosisLabel && " — "}
              {diagnosisLabel}
            </p>
          )
        )}
      </div>

      {/* Vitals (collapsible) */}
      <div className="rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setShowVitals(!showVitals)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-muted/30 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 text-red-500" />
            Signos Vitales
          </span>
          {showVitals ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {showVitals && (
          <div className={cn("grid gap-2 px-3 pb-3", wideLayout ? "grid-cols-4" : "grid-cols-2")}>
            {VITALS_FIELDS.map(({ key, label, unit, step }) => (
              <div key={key} className="space-y-0.5">
                <label className="text-[10px] text-muted-foreground">
                  {label} ({unit})
                </label>
                {editable ? (
                  <input
                    type="number"
                    value={vitals[key] ?? ""}
                    onChange={(e) => updateVital(key, e.target.value)}
                    step={step}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  />
                ) : (
                  <p className="text-xs font-medium">
                    {vitals[key] != null ? `${vitals[key]} ${unit}` : "—"}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Internal notes */}
      {(editable || internalNotes) && (
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">
            Notas internas (no visibles al paciente)
          </label>
          {editable ? (
            <textarea
              value={internalNotes}
              onChange={(e) => { setInternalNotes(e.target.value); markDirty(); }}
              placeholder="Observaciones internas..."
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
            />
          ) : (
            <p className="text-xs text-muted-foreground italic">{internalNotes}</p>
          )}
        </div>
      )}

      {/* Action buttons */}
      {canEdit && (
        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving || isLocked}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {note ? "Guardar" : "Crear nota"}
          </button>
          {note && !isLocked && hasContent && (
            <button
              onClick={handleSign}
              disabled={signing}
              className="flex items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-600 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
            >
              {signing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              Firmar
            </button>
          )}
        </div>
      )}

      {/* Print button — only when note exists and has content */}
      {note && hasContent && patientName && doctorName && serviceName && (
        <div className="pt-1">
          <ClinicalNotePrintButton
            note={note}
            patientName={patientName}
            patientDni={patientDni}
            doctorName={doctorName}
            serviceName={serviceName}
            appointmentDate={appointmentDate ?? ""}
            appointmentTime={appointmentTime ?? ""}
            clinicName={clinicName}
          />
        </div>
      )}
    </div>
  );
}
