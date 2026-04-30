"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
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
import { searchCIE10WithCustom, type CIE10Entry } from "@/lib/cie10-catalog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ClinicalNotePrintButton } from "./clinical-note-print";
import { PatientContextCard } from "./patient-context-card";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

export interface ClinicalNotePanelState {
  note: ClinicalNote | null;
  isLocked: boolean;
  hasContent: boolean;
  isSaving: boolean;
  isSigning: boolean;
  autoSaveStatus: AutoSaveStatus;
}

export interface ClinicalNotePanelHandle {
  save: () => Promise<void>;
  sign: () => Promise<void>;
}

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
  /** When true, hides the in-panel footer actions (save / sign / print) so the
   *  hosting modal can render them in its own sticky header instead. */
  hideFooterActions?: boolean;
  /** Reports panel state to the host so it can render header CTAs that mirror
   *  the panel's internal save/sign/print availability. */
  onStateChange?: (state: ClinicalNotePanelState) => void;
}

export const ClinicalNotePanel = forwardRef<
  ClinicalNotePanelHandle,
  ClinicalNotePanelProps
>(function ClinicalNotePanel({
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
  hideFooterActions = false,
  onStateChange,
}, ref) {
  const confirm = useConfirm();
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

  // Informed consent — Tier 1 MVP (migration 102)
  const [consentRegistered, setConsentRegistered] = useState(false);
  const [consentNotes, setConsentNotes] = useState("");
  const [serviceRequiresConsent, setServiceRequiresConsent] = useState(false);
  const [consentAttachmentCount, setConsentAttachmentCount] = useState(0);
  const [cie10Query, setCie10Query] = useState("");
  const [cie10Results, setCie10Results] = useState<CIE10Entry[]>([]);
  const [showCie10, setShowCie10] = useState(false);
  const [customCie10, setCustomCie10] = useState<CIE10Entry[]>([]);

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
          consent_registered: consentRegistered,
          consent_notes: consentNotes || null,
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
  }, [note, subjective, objective, assessment, plan, diagnosisCode, diagnosisLabel, internalNotes, vitals, consentRegistered, consentNotes, patientId, doctorId, canEdit, appointmentId]);

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
        setConsentRegistered(n.consent_registered ?? false);
        setConsentNotes(n.consent_notes ?? "");
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

  // Load the service's requires_consent flag and count the consent-type
  // attachments already linked to this appointment. This lets the consent
  // block highlight itself when legally required + confirm a signed doc is
  // on file.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: appt } = await supabase
        .from("appointments")
        .select("service_id, patient_id, services(requires_consent)")
        .eq("id", appointmentId)
        .maybeSingle();
      if (cancelled) return;
      const requires =
        (appt as { services?: { requires_consent?: boolean } | null } | null)
          ?.services?.requires_consent ?? false;
      setServiceRequiresConsent(!!requires);

      if (appt?.patient_id) {
        const { count } = await supabase
          .from("clinical_attachments")
          .select("id", { count: "exact", head: true })
          .eq("patient_id", appt.patient_id)
          .eq("appointment_id", appointmentId)
          .eq("category", "consent");
        if (!cancelled) setConsentAttachmentCount(count ?? 0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  // Load org's custom CIE-10 codes so they appear in the search
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/custom-diagnosis-codes");
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const entries = (json.data ?? []).map(
          (c: { code: string; label: string }) => ({ code: c.code, label: c.label })
        );
        setCustomCie10(entries);
      } catch {
        // Silent fail — search still works with global catalog
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        consent_registered: consentRegistered,
        consent_notes: consentNotes || null,
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
          toast.error(json.error || "No se pudo guardar la nota. Tus cambios siguen en pantalla — reintenta.");
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
    const ok = await confirm({
      title: "Firmar nota clínica",
      description:
        "Al firmar se bloquea la edición permanentemente. Revisa que todos los campos estén completos antes de continuar.",
      confirmText: "Sí, firmar",
      cancelText: "Volver",
    });
    if (!ok) return;

    setSigning(true);
    try {
      const res = await fetch(`/api/clinical-notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_signed: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "No se pudo firmar la nota. Revisa que todos los campos estén completos.");
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
  const hasContent = Boolean(subjective || objective || assessment || plan);

  // Expose imperative save/sign so the hosting modal can render its own
  // header-level CTAs that drive this panel.
  useImperativeHandle(ref, () => ({ save: handleSave, sign: handleSign }), [
    handleSave,
    handleSign,
  ]);

  // Report state up so the host can mirror availability in its sticky header.
  useEffect(() => {
    onStateChange?.({
      note,
      isLocked,
      hasContent,
      isSaving: saving,
      isSigning: signing,
      autoSaveStatus,
    });
  }, [note, isLocked, hasContent, saving, signing, autoSaveStatus, onStateChange]);

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
      {/* Patient antecedents context */}
      <PatientContextCard patientId={patientId} canEdit={canEdit} />

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
        {isLocked && !hideFooterActions && (
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

      {/* SOAP Sections — stack vertical (los doctores escriben en flujo
          secuencial; columnas obligan a navegar lateralmente). */}
      <div className="space-y-3">
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
                      setCie10Results(searchCIE10WithCustom(q, customCie10));
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
                        <span className="text-foreground truncate flex-1">{entry.label}</span>
                        {entry.custom && (
                          <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                            personalizado
                          </span>
                        )}
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
          <div
            className={cn(
              "grid gap-2 px-3 pb-3",
              wideLayout
                ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-8"
                : "grid-cols-2"
            )}
          >
            {VITALS_FIELDS.map(({ key, label, unit, step }) => (
              <div key={key} className="space-y-0.5">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {label} <span className="text-muted-foreground/60">({unit})</span>
                </label>
                {editable ? (
                  <input
                    type="number"
                    value={vitals[key] ?? ""}
                    onChange={(e) => updateVital(key, e.target.value)}
                    step={step}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  />
                ) : (
                  <p className="text-sm font-medium">
                    {vitals[key] != null ? `${vitals[key]} ${unit}` : "—"}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Informed consent (Tier 1 MVP) */}
      {(editable || consentRegistered || serviceRequiresConsent) && (
        <div
          className={`space-y-2 rounded-lg border p-3 ${
            serviceRequiresConsent && !consentRegistered
              ? "border-amber-500/50 bg-amber-500/5"
              : "border-border/60 bg-muted/20"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                📝 Consentimiento informado
                {serviceRequiresConsent && (
                  <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-400">
                    Requerido
                  </span>
                )}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {serviceRequiresConsent
                  ? "Este servicio requiere consentimiento firmado por el paciente (Ley 29414)."
                  : "Opcional — marca solo si se obtuvo consentimiento específico para un procedimiento."}
              </p>
            </div>
            {consentAttachmentCount > 0 && (
              <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                ✓ {consentAttachmentCount} archivo{consentAttachmentCount === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <label className="flex items-start gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={consentRegistered}
              disabled={!editable}
              onChange={(e) => { setConsentRegistered(e.target.checked); markDirty(); }}
              className="mt-0.5 rounded"
            />
            <span>
              <span className="font-medium">Consentimiento registrado</span>
              <span className="ml-1 text-muted-foreground">
                (confirmo que el paciente otorgó su consentimiento informado)
              </span>
            </span>
          </label>

          {(editable || consentNotes) && (
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground">
                Notas (opcional)
              </label>
              {editable ? (
                <textarea
                  value={consentNotes}
                  onChange={(e) => { setConsentNotes(e.target.value); markDirty(); }}
                  placeholder="Ej: firmado por la madre · paciente difiere el procedimiento · testigo presente..."
                  rows={2}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              ) : (
                <p className="text-xs text-muted-foreground italic">{consentNotes}</p>
              )}
            </div>
          )}

          {serviceRequiresConsent && consentAttachmentCount === 0 && (
            <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              ⚠ Falta subir el documento firmado. Tómale foto con el móvil al papel firmado y súbelo en Adjuntos → categoría{" "}
              <span className="font-semibold">Consentimiento</span>.
            </p>
          )}
        </div>
      )}

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
      {canEdit && !hideFooterActions && (
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
      {!hideFooterActions && note && hasContent && patientName && doctorName && serviceName && (
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
});
