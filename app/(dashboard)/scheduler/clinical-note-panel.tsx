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
import type {
  ClinicalNote,
  ClinicalNoteDiagnosisInput,
  Vitals,
  SOAPSection,
} from "@/types/clinical-notes";
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
  X,
  Star,
} from "lucide-react";
import { searchCIE10WithCustom, type CIE10Entry } from "@/lib/cie10-catalog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ClinicalNotePrintButton } from "./clinical-note-print";
import { PatientContextCard } from "./patient-context-card";

export type AutoSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

// Client-side mirror of the server ranges (lib/validations/clinical-note.ts).
// Without this, a typo like temp "3" (instead of 37) makes the server reject
// the WHOLE note on every autosave with no visible reason.
const VITALS_RANGES: Record<string, [number, number]> = {
  weight_kg: [0, 500],
  height_cm: [0, 300],
  temp_c: [30, 45],
  bp_systolic: [40, 300],
  bp_diastolic: [20, 200],
  heart_rate: [20, 300],
  resp_rate: [4, 60],
  spo2: [50, 100],
};

const vitalOutOfRange = (key: string, value: number | null | undefined): boolean => {
  if (value == null) return false;
  const range = VITALS_RANGES[key];
  if (!range) return false;
  return value < range[0] || value > range[1];
};

const SOAP_MAX = 5000;

export interface ClinicalNotePanelState {
  note: ClinicalNote | null;
  isLocked: boolean;
  hasContent: boolean;
  isSaving: boolean;
  isSigning: boolean;
  autoSaveStatus: AutoSaveStatus;
  /** True when there are edits on screen not yet persisted. */
  isDirty: boolean;
  /** Wall-clock time of the last successful persist (auto or manual). */
  lastSavedAt: Date | null;
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
  // Multi-diagnosis: una nota puede tener varios CIE-10 (comorbilidades).
  // El primer item es el principal por defecto; el usuario puede cambiarlo.
  const [diagnoses, setDiagnoses] = useState<ClinicalNoteDiagnosisInput[]>([]);
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

  // Manual CIE-10 entry (sin persistir al catálogo). Para casos donde el
  // doctor conoce un sub-código que aún no está catalogado pero no quiere
  // crear un código personalizado permanente.
  const [showManualCie10, setShowManualCie10] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [manualLabel, setManualLabel] = useState("");

  // Template state
  const [templates, setTemplates] = useState<ClinicalTemplateWithDoctor[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // ── Autosave ──────────────────────────────────────────────────────
  // The payload is ALWAYS built from formRef (updated every render): a
  // setTimeout closure would capture the state as it was when the timer
  // was armed and persist one edit behind what's on screen — the doctor
  // would see "Guardado" while the DB holds an older version.
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const persistingRef = useRef(false);

  const formRef = useRef({
    subjective, objective, assessment, plan, diagnoses,
    internalNotes, vitals, consentRegistered, consentNotes,
  });
  formRef.current = {
    subjective, objective, assessment, plan, diagnoses,
    internalNotes, vitals, consentRegistered, consentNotes,
  };
  const noteRef = useRef<ClinicalNote | null>(null);
  noteRef.current = note;

  const buildBody = useCallback(() => {
    const f = formRef.current;
    return {
      subjective: f.subjective,
      objective: f.objective,
      assessment: f.assessment,
      plan: f.plan,
      diagnoses: f.diagnoses.map((d, i) => ({
        code: d.code,
        label: d.label,
        is_primary: i === 0,
        position: i,
      })),
      internal_notes: f.internalNotes || null,
      vitals: f.vitals,
      consent_registered: f.consentRegistered,
      consent_notes: f.consentNotes || null,
      patient_id: patientId,
      doctor_id: doctorId,
    };
  }, [patientId, doctorId]);

  const clearAutoSaveTimers = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (maxWaitTimerRef.current) {
      clearTimeout(maxWaitTimerRef.current);
      maxWaitTimerRef.current = null;
    }
  }, []);

  /**
   * Persists the CURRENT on-screen form (PATCH, or POST when the note
   * doesn't exist yet). Throws with a readable message on failure.
   * If the POST hits a 409 (someone else created the note for this
   * appointment), adopts the existing note and retries as PATCH so the
   * local text is never lost.
   */
  const persistNote = useCallback(async (): Promise<ClinicalNote> => {
    const body = buildBody();
    const patch = (id: string) =>
      fetch(`/api/clinical-notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    let res: Response;
    if (noteRef.current) {
      res = await patch(noteRef.current.id);
    } else {
      res = await fetch("/api/clinical-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, appointment_id: appointmentId }),
      });
      if (res.status === 409) {
        const lookup = await fetch(`/api/clinical-notes?appointment_id=${appointmentId}`);
        const found = await lookup.json().catch(() => null);
        if (found?.data?.id) {
          // Adopt the id only — keep the local fields, they're what the
          // doctor is looking at.
          noteRef.current = found.data;
          setNote(found.data);
          res = await patch(found.data.id);
        }
      }
    }

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const details = Array.isArray(json?.details) ? ` — ${json.details.join(" · ")}` : "";
      throw new Error((json?.error ?? "Error al guardar") + details);
    }
    setNote(json.data);
    noteRef.current = json.data;
    isDirtyRef.current = false;
    setLastSavedAt(new Date());
    return json.data as ClinicalNote;
  }, [buildBody, appointmentId]);

  const runAutoSave = useCallback(async () => {
    clearAutoSaveTimers();
    if (!isDirtyRef.current || persistingRef.current) return;
    const f = formRef.current;
    // Never create an empty note from autosave.
    if (!noteRef.current && !(f.subjective || f.objective || f.assessment || f.plan)) return;
    persistingRef.current = true;
    setAutoSaveStatus("saving");
    try {
      await persistNote();
      setAutoSaveStatus("saved");
    } catch (e) {
      setAutoSaveStatus("error");
      // A 10px badge is not enough to notice the note silently stopped
      // saving — surface a real (deduped) toast with the server reason.
      toast.error(e instanceof Error ? e.message : "No se pudo autoguardar", {
        id: "clinical-autosave-error",
        description: "Tus cambios siguen en pantalla. Corrige y guarda con Ctrl+S.",
      });
    } finally {
      persistingRef.current = false;
    }
  }, [clearAutoSaveTimers, persistNote]);
  const runAutoSaveRef = useRef(runAutoSave);
  runAutoSaveRef.current = runAutoSave;

  // Debounce 4s from the last keystroke + hard maxWait of 15s: while the
  // doctor types without pause the debounce keeps resetting, but the
  // maxWait timer guarantees a persist at least every 15 seconds.
  const markDirty = useCallback(() => {
    isDirtyRef.current = true;
    setAutoSaveStatus("dirty");
    if (!canEdit) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => runAutoSaveRef.current(), 4000);
    if (!maxWaitTimerRef.current) {
      maxWaitTimerRef.current = setTimeout(() => runAutoSaveRef.current(), 15000);
    }
  }, [canEdit]);

  // Safety net: if the panel unmounts with pending edits (modal closed
  // with the X, view navigated away), fire the persist anyway. keepalive
  // lets the request outlive the component.
  useEffect(() => {
    return () => {
      clearAutoSaveTimers();
      if (!isDirtyRef.current) return;
      const body = JSON.stringify(
        noteRef.current
          ? buildBody()
          : { ...buildBody(), appointment_id: appointmentId }
      );
      const f = formRef.current;
      if (noteRef.current) {
        fetch(`/api/clinical-notes/${noteRef.current.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      } else if (f.subjective || f.objective || f.assessment || f.plan) {
        fetch("/api/clinical-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // Lista normalizada (migración 124). Orden: primary primero, luego
        // por position. Fallback al campo legacy si la nota es muy vieja.
        const list = (n.diagnoses ?? [])
          .slice()
          .sort((a, b) => {
            if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
            return a.position - b.position;
          })
          .map((d) => ({ code: d.code, label: d.label }));
        if (list.length === 0 && n.diagnosis_code) {
          list.push({ code: n.diagnosis_code, label: n.diagnosis_label ?? n.diagnosis_code });
        }
        setDiagnoses(list);
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

  const applyTemplate = async (tpl: ClinicalTemplateWithDoctor) => {
    // Applying over typed text is destructive and has no undo — ask first.
    const wouldOverwrite =
      (tpl.subjective && subjective.trim()) ||
      (tpl.objective && objective.trim()) ||
      (tpl.assessment && assessment.trim()) ||
      (tpl.plan && plan.trim());
    if (wouldOverwrite) {
      const ok = await confirm({
        title: `Aplicar plantilla "${tpl.name}"`,
        description:
          "La plantilla reemplazará el texto ya escrito en las secciones que incluye. Esta acción no se puede deshacer.",
        confirmText: "Reemplazar",
        cancelText: "Volver",
      });
      if (!ok) return;
    }
    if (tpl.subjective) setSubjective(tpl.subjective);
    if (tpl.objective) setObjective(tpl.objective);
    if (tpl.assessment) setAssessment(tpl.assessment);
    if (tpl.plan) setPlan(tpl.plan);
    if (tpl.diagnosis_code) {
      // Plantillas legacy traen un solo diagnóstico — agregar como principal
      // si no estaba ya en la lista.
      const code = tpl.diagnosis_code;
      const label = tpl.diagnosis_label ?? code;
      setDiagnoses((prev) => {
        if (prev.some((d) => d.code.toLowerCase() === code.toLowerCase())) return prev;
        return [{ code, label }, ...prev];
      });
    }
    if (tpl.internal_notes) setInternalNotes(tpl.internal_notes);
    setShowTemplates(false);
    // The template IS an edit — without this the applied text never
    // schedules an autosave and is lost on close.
    markDirty();
    toast.success(`Plantilla "${tpl.name}" aplicada`);
  };

  // ── Diagnoses helpers ────────────────────────────────────────────
  const addDiagnosis = (code: string, label: string) => {
    const c = code.trim();
    if (!c) return;
    setDiagnoses((prev) => {
      if (prev.some((d) => d.code.toLowerCase() === c.toLowerCase())) return prev;
      return [...prev, { code: c, label: label.trim() || c }];
    });
    markDirty();
  };

  const removeDiagnosis = (code: string) => {
    setDiagnoses((prev) => prev.filter((d) => d.code !== code));
    markDirty();
  };

  const promoteDiagnosis = (code: string) => {
    setDiagnoses((prev) => {
      const idx = prev.findIndex((d) => d.code === code);
      if (idx <= 0) return prev;
      const next = prev.slice();
      const [item] = next.splice(idx, 1);
      next.unshift(item);
      return next;
    });
    markDirty();
  };

  const handleSave = async () => {
    // Manual save supersedes any scheduled autosave — a stale timer
    // firing later would revert this save with older data.
    clearAutoSaveTimers();
    setSaving(true);
    try {
      const isCreate = !noteRef.current;
      await persistNote();
      setAutoSaveStatus("saved");
      toast.success(isCreate ? "Nota clínica creada" : "Nota clínica guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de red al guardar", {
        description: "Tus cambios siguen en pantalla — reintenta.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSign = async () => {
    if (!note && !hasContent) return;

    // Preflight: list what's missing so "revisa los campos" isn't an
    // empty promise. Signing anyway stays allowed — the doctor decides.
    const f = formRef.current;
    const missing: string[] = [];
    if (f.diagnoses.length === 0) missing.push("sin diagnóstico CIE-10");
    if (!f.plan.trim()) missing.push("plan vacío");
    if (serviceRequiresConsent && !f.consentRegistered) missing.push("consentimiento requerido sin registrar");

    const ok = await confirm({
      title: "Firmar nota clínica",
      description:
        (missing.length > 0 ? `Pendientes: ${missing.join(" · ")}. ` : "") +
        "Se guardará y firmará la versión que está en pantalla. Al firmar se bloquea la edición permanentemente.",
      confirmText: missing.length > 0 ? "Firmar de todos modos" : "Sí, firmar",
      cancelText: "Volver",
    });
    if (!ok) return;

    setSigning(true);
    clearAutoSaveTimers();
    try {
      // ALWAYS persist before signing — otherwise the signature seals the
      // previous version, not the text the doctor is looking at.
      const saved = await persistNote();
      const res = await fetch(`/api/clinical-notes/${saved.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_signed: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "No se pudo firmar la nota.");
        return;
      }
      setNote(json.data);
      setAutoSaveStatus("saved");
      toast.success("Nota clínica firmada", {
        description: "La edición quedó bloqueada permanentemente.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de red al firmar");
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
      isDirty: autoSaveStatus === "dirty" || autoSaveStatus === "error",
      lastSavedAt,
    });
  }, [note, isLocked, hasContent, saving, signing, autoSaveStatus, lastSavedAt, onStateChange]);

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
              autoSaveStatus === "saved" && "text-success-500",
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
                <>
                  <textarea
                    value={value}
                    onChange={(e) => { set(e.target.value); markDirty(); }}
                    placeholder={placeholder}
                    rows={wideLayout ? 5 : 3}
                    maxLength={SOAP_MAX}
                    autoFocus={section === "subjective" && !note}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[15px] leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-vertical"
                  />
                  {value.length > SOAP_MAX - 500 && (
                    <p
                      className={cn(
                        "text-right text-[11px]",
                        value.length >= SOAP_MAX ? "font-semibold text-red-500" : "text-muted-foreground"
                      )}
                    >
                      {value.length.toLocaleString()}/{SOAP_MAX.toLocaleString()}
                    </p>
                  )}
                </>
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

      {/* Diagnósticos CIE-10 — múltiples (comorbilidades) */}
      <div className="space-y-2">
        <label className="text-xs font-semibold flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          Diagnósticos
          {diagnoses.length > 1 && (
            <span className="text-[10px] font-normal text-muted-foreground">
              · {diagnoses.length}
            </span>
          )}
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
                    {cie10Results.map((entry) => {
                      const alreadyAdded = diagnoses.some(
                        (d) => d.code.toLowerCase() === entry.code.toLowerCase()
                      );
                      return (
                        <button
                          key={entry.code}
                          type="button"
                          disabled={alreadyAdded}
                          onClick={() => {
                            addDiagnosis(entry.code, entry.label);
                            setCie10Query("");
                            setShowCie10(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                            alreadyAdded
                              ? "cursor-not-allowed opacity-50"
                              : "hover:bg-accent"
                          )}
                        >
                          <span className="font-mono font-semibold text-primary shrink-0">{entry.code}</span>
                          <span className="text-foreground truncate flex-1">{entry.label}</span>
                          {entry.custom && (
                            <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                              personalizado
                            </span>
                          )}
                          {alreadyAdded && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              agregado
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Manual entry — para códigos no catalogados (no persiste al
                catálogo de la org; vive solo dentro de esta nota). */}
            {showManualCie10 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-2 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Código (ej: E11.9)"
                    className="w-32 rounded-md border border-input bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                  />
                  <input
                    type="text"
                    value={manualLabel}
                    onChange={(e) => setManualLabel(e.target.value)}
                    placeholder="Descripción del diagnóstico"
                    className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && manualCode.trim() && manualLabel.trim()) {
                        e.preventDefault();
                        addDiagnosis(manualCode, manualLabel);
                        setManualCode("");
                        setManualLabel("");
                        setShowManualCie10(false);
                      }
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground/70">
                    Solo para esta nota. Si lo usas seguido, agrégalo en{" "}
                    <span className="font-medium">Ajustes → CIE-10 personalizados</span>.
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowManualCie10(false);
                        setManualCode("");
                        setManualLabel("");
                      }}
                      className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!manualCode.trim() || !manualLabel.trim()}
                      onClick={() => {
                        addDiagnosis(manualCode, manualLabel);
                        setManualCode("");
                        setManualLabel("");
                        setShowManualCie10(false);
                      }}
                      className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowManualCie10(true)}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
              >
                + Código manual
              </button>
            )}

            {/* Chips: cada diagnóstico con × y star (promover a principal) */}
            {diagnoses.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {diagnoses.map((d, i) => {
                  const isPrimary = i === 0;
                  return (
                    <span
                      key={d.code}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition-colors",
                        isPrimary
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-muted/40 text-foreground"
                      )}
                    >
                      {isPrimary && (
                        <Star className="h-3 w-3 fill-current shrink-0" aria-label="Principal" />
                      )}
                      <span className="font-mono font-semibold">{d.code}</span>
                      <span className="opacity-80 truncate max-w-[280px]" title={d.label}>
                        {d.label}
                      </span>
                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => promoteDiagnosis(d.code)}
                          title="Marcar como principal"
                          className="rounded-full p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-primary"
                        >
                          <Star className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeDiagnosis(d.code)}
                        title="Quitar diagnóstico"
                        className="rounded-full p-0.5 hover:bg-foreground/10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground/70 italic">
                Aún no agregaste diagnósticos. Busca arriba — puedes agregar varios para registrar comorbilidades.
              </p>
            )}
          </div>
        ) : diagnoses.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {diagnoses.map((d, i) => (
              <span
                key={d.code}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px]",
                  i === 0
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-muted/40 text-foreground"
                )}
              >
                {i === 0 && <Star className="h-3 w-3 fill-current shrink-0" />}
                <span className="font-mono font-semibold">{d.code}</span>
                <span className="opacity-80">{d.label}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">Sin diagnósticos</p>
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
                  <>
                    <input
                      type="number"
                      value={vitals[key] ?? ""}
                      onChange={(e) => updateVital(key, e.target.value)}
                      step={step}
                      min={VITALS_RANGES[key]?.[0]}
                      max={VITALS_RANGES[key]?.[1]}
                      className={cn(
                        "w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors",
                        vitalOutOfRange(key, vitals[key])
                          ? "border-red-500 focus:ring-red-500/50 focus:border-red-500"
                          : "border-input focus:ring-primary/50 focus:border-primary"
                      )}
                    />
                    {vitalOutOfRange(key, vitals[key]) && (
                      <p className="text-[11px] font-medium text-red-500">
                        Rango: {VITALS_RANGES[key][0]}–{VITALS_RANGES[key][1]}
                      </p>
                    )}
                  </>
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
            disabled={saving || isLocked || !hasContent}
            title={!hasContent ? "Escribe algo antes de guardar" : undefined}
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
