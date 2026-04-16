"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Pill,
  Heart,
  Users,
  Stethoscope,
  Plus,
  X,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
  PatientAntecedents,
  PatientAllergy,
  PatientCondition,
  PatientMedication,
} from "@/types/patient-antecedents";

interface PatientContextCardProps {
  patientId: string | null;
  canEdit: boolean;
}

const SEVERITY_COLORS = {
  severa: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  moderada: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  leve: "bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
};

const SEVERITY_LABELS = { severa: "Severa", moderada: "Moderada", leve: "Leve" };
const CONDITION_TYPE_LABELS = { chronic: "Crónica", personal: "Antec. personal", family: "Antec. familiar" };

export function PatientContextCard({ patientId, canEdit }: PatientContextCardProps) {
  const [data, setData] = useState<PatientAntecedents | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [addingType, setAddingType] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!patientId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/patients/${patientId}/antecedents`);
      if (res.ok) {
        const json: PatientAntecedents = await res.json();
        setData(json);
        if (json.allergies.length > 0) setExpanded(true);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [patientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!patientId) return null;
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Cargando antecedentes...
      </div>
    );
  }

  const hasAllergies = (data?.allergies.length ?? 0) > 0;
  const hasConditions = (data?.conditions.length ?? 0) > 0;
  const hasMedications = (data?.medications.length ?? 0) > 0;
  const hasDiagnoses = (data?.recentDiagnoses.length ?? 0) > 0;
  const hasAny = hasAllergies || hasConditions || hasMedications || hasDiagnoses;
  const isEmpty = !hasAny;

  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className={cn("h-4 w-4", hasAllergies ? "text-red-500" : "text-muted-foreground")} />
          <span className="text-xs font-semibold">Antecedentes del paciente</span>
          {hasAllergies && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
              {data!.allergies.length} alergia{data!.allergies.length > 1 ? "s" : ""}
            </span>
          )}
          {isEmpty && (
            <span className="text-[10px] text-muted-foreground/60">Sin registros</span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {/* Allergy badges — always visible when present */}
      {hasAllergies && !expanded && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {data!.allergies.map((a) => (
            <AllergyBadge key={a.id} allergy={a} />
          ))}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-2">
          {/* Allergies */}
          <Section
            icon={AlertTriangle}
            iconColor="text-red-500"
            title="Alergias"
            count={data?.allergies.length ?? 0}
            onAdd={canEdit ? () => setAddingType("allergy") : undefined}
          >
            {hasAllergies ? (
              <div className="flex flex-wrap gap-1.5">
                {data!.allergies.map((a) => (
                  <AllergyBadge key={a.id} allergy={a} showDetail />
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground/60">No se conocen alergias</p>
            )}
          </Section>

          {/* Chronic conditions */}
          <Section
            icon={Heart}
            iconColor="text-pink-500"
            title="Condiciones"
            count={data?.conditions.filter((c) => c.condition_type === "chronic").length ?? 0}
            onAdd={canEdit ? () => setAddingType("condition") : undefined}
          >
            {hasConditions ? (
              <div className="space-y-1">
                {data!.conditions.map((c) => (
                  <ConditionRow key={c.id} condition={c} />
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground/60">Sin condiciones registradas</p>
            )}
          </Section>

          {/* Medications */}
          <Section
            icon={Pill}
            iconColor="text-blue-500"
            title="Medicamentos actuales"
            count={data?.medications.length ?? 0}
            onAdd={canEdit ? () => setAddingType("medication") : undefined}
          >
            {hasMedications ? (
              <div className="space-y-1">
                {data!.medications.map((m) => (
                  <MedicationRow key={m.id} medication={m} />
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground/60">Sin medicamentos registrados</p>
            )}
          </Section>

          {/* Recent diagnoses */}
          {hasDiagnoses && (
            <Section
              icon={Stethoscope}
              iconColor="text-emerald-500"
              title="Últimos diagnósticos"
              count={data?.recentDiagnoses.length ?? 0}
            >
              <div className="space-y-1">
                {data!.recentDiagnoses.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono font-semibold text-primary">{d.code}</span>
                    <span className="text-muted-foreground truncate flex-1">{d.label}</span>
                    <span className="text-muted-foreground/60 shrink-0">
                      {new Date(d.date).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* Inline add form */}
      {addingType && (
        <InlineAddForm
          type={addingType}
          patientId={patientId}
          onSaved={() => { setAddingType(null); fetchData(); }}
          onCancel={() => setAddingType(null)}
        />
      )}
    </div>
  );
}

function AllergyBadge({ allergy, showDetail }: { allergy: PatientAllergy; showDetail?: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
      SEVERITY_COLORS[allergy.severity]
    )}>
      <AlertTriangle className="h-2.5 w-2.5" />
      {allergy.substance}
      {showDetail && allergy.reaction && (
        <span className="font-normal opacity-80">— {allergy.reaction}</span>
      )}
      <span className="opacity-60">({SEVERITY_LABELS[allergy.severity]})</span>
    </span>
  );
}

function ConditionRow({ condition }: { condition: PatientCondition }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className={cn(
        "shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase",
        condition.condition_type === "family"
          ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
          : condition.condition_type === "chronic"
          ? "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      )}>
        {CONDITION_TYPE_LABELS[condition.condition_type]}
      </span>
      <span className="font-medium">{condition.condition_name}</span>
      {condition.icd_code && (
        <span className="font-mono text-primary/70">{condition.icd_code}</span>
      )}
      {condition.family_member && (
        <span className="text-muted-foreground/60">({condition.family_member})</span>
      )}
      {condition.status === "managed" && (
        <span className="text-emerald-600 text-[9px]">Controlada</span>
      )}
      {condition.status === "resolved" && (
        <span className="text-muted-foreground/60 text-[9px] line-through">Resuelta</span>
      )}
    </div>
  );
}

function MedicationRow({ medication }: { medication: PatientMedication }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <Pill className="h-3 w-3 text-blue-400 shrink-0" />
      <span className="font-medium">{medication.medication_name}</span>
      {medication.dosage && (
        <span className="text-muted-foreground">{medication.dosage}</span>
      )}
      {medication.frequency && (
        <span className="text-muted-foreground/60">· {medication.frequency}</span>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  iconColor,
  title,
  count,
  onAdd,
  children,
}: {
  icon: typeof AlertTriangle;
  iconColor: string;
  title: string;
  count: number;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3 w-3", iconColor)} />
        <span className="text-[11px] font-semibold">{title}</span>
        {count > 0 && (
          <span className="text-[10px] text-muted-foreground/60">({count})</span>
        )}
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="ml-auto text-[10px] text-primary hover:underline flex items-center gap-0.5"
          >
            <Plus className="h-3 w-3" /> Agregar
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function InlineAddForm({
  type,
  patientId,
  onSaved,
  onCancel,
}: {
  type: string;
  patientId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  const update = (key: string, value: string) => setFields((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/antecedents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...fields }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Error al guardar");
        setSaving(false);
        return;
      }
      toast.success("Guardado");
      onSaved();
    } catch {
      toast.error("Error de conexión");
      setSaving(false);
    }
  };

  const inputCls = "h-8 w-full rounded-lg border border-input bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring/50";

  return (
    <div className="border-t border-border px-3 py-2.5 bg-accent/20 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold">
          {type === "allergy" ? "Nueva alergia" : type === "condition" ? "Nueva condición" : "Nuevo medicamento"}
        </span>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {type === "allergy" && (
        <div className="grid grid-cols-3 gap-2">
          <input placeholder="Sustancia *" className={inputCls} value={fields.substance ?? ""} onChange={(e) => update("substance", e.target.value)} />
          <select className={inputCls} value={fields.severity ?? "moderada"} onChange={(e) => update("severity", e.target.value)}>
            <option value="leve">Leve</option>
            <option value="moderada">Moderada</option>
            <option value="severa">Severa</option>
          </select>
          <input placeholder="Reacción" className={inputCls} value={fields.reaction ?? ""} onChange={(e) => update("reaction", e.target.value)} />
        </div>
      )}

      {type === "condition" && (
        <div className="grid grid-cols-3 gap-2">
          <input placeholder="Condición *" className={inputCls} value={fields.condition_name ?? ""} onChange={(e) => update("condition_name", e.target.value)} />
          <select className={inputCls} value={fields.condition_type ?? "chronic"} onChange={(e) => update("condition_type", e.target.value)}>
            <option value="chronic">Crónica</option>
            <option value="personal">Antecedente personal</option>
            <option value="family">Antecedente familiar</option>
          </select>
          <input placeholder="Familiar (ej: madre)" className={inputCls} value={fields.family_member ?? ""} onChange={(e) => update("family_member", e.target.value)} />
        </div>
      )}

      {type === "medication" && (
        <div className="grid grid-cols-3 gap-2">
          <input placeholder="Medicamento *" className={inputCls} value={fields.medication_name ?? ""} onChange={(e) => update("medication_name", e.target.value)} />
          <input placeholder="Dosis (ej: 500mg)" className={inputCls} value={fields.dosage ?? ""} onChange={(e) => update("dosage", e.target.value)} />
          <input placeholder="Frecuencia (ej: c/8h)" className={inputCls} value={fields.frequency ?? ""} onChange={(e) => update("frequency", e.target.value)} />
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !(fields.substance || fields.condition_name || fields.medication_name)}
          className="h-7 px-3 rounded-lg bg-primary text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Guardar
        </button>
      </div>
    </div>
  );
}
