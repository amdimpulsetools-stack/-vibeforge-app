"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  TreatmentPlanWithSessions,
} from "@/types/clinical-history";
import {
  TREATMENT_STATUS_CONFIG,
  SESSION_STATUS_CONFIG,
} from "@/types/clinical-history";
import type { TreatmentPlanTemplateWithDoctor } from "@/types/treatment-plan-templates";
import {
  ClipboardList,
  Plus,
  Loader2,
  ChevronDown,
  Check,
  X,
  Pause,
  RotateCcw,
  LayoutTemplate,
} from "lucide-react";

interface TreatmentPlansPanelProps {
  patientId: string;
  doctorId?: string;
  canEdit: boolean;
}

export function TreatmentPlansPanel({ patientId, doctorId, canEdit }: TreatmentPlansPanelProps) {
  const [plans, setPlans] = useState<TreatmentPlanWithSessions[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [totalSessions, setTotalSessions] = useState("");
  const [notes, setNotes] = useState("");
  const [diagnosisCode, setDiagnosisCode] = useState<string | null>(null);
  const [diagnosisLabel, setDiagnosisLabel] = useState<string | null>(null);

  // Templates
  const [templates, setTemplates] = useState<TreatmentPlanTemplateWithDoctor[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch(`/api/treatment-plans?patient_id=${patientId}`);
      const json = await res.json();
      setPlans(json.data ?? []);
    } catch {
      toast.error("Error al cargar planes de tratamiento");
    }
    setLoading(false);
  }, [patientId]);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/treatment-plan-templates");
      const json = await res.json();
      setTemplates(json.data ?? []);
    } catch {
      // Silent: templates are optional
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);
  useEffect(() => { if (canEdit) fetchTemplates(); }, [fetchTemplates, canEdit]);

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    if (tpl.title_template) setTitle(tpl.title_template);
    else if (tpl.name) setTitle(tpl.name);
    if (tpl.description) setDescription(tpl.description);
    if (tpl.total_sessions != null) setTotalSessions(String(tpl.total_sessions));
    setDiagnosisCode(tpl.diagnosis_code);
    setDiagnosisLabel(tpl.diagnosis_label);
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setTotalSessions("");
    setNotes("");
    setDiagnosisCode(null);
    setDiagnosisLabel(null);
    setSelectedTemplateId("");
  };

  const handleCreate = async () => {
    if (!title.trim() || !doctorId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/treatment-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          doctor_id: doctorId,
          title: title.trim(),
          description: description || null,
          total_sessions: totalSessions ? Number(totalSessions) : null,
          notes: notes || null,
          diagnosis_code: diagnosisCode || null,
          diagnosis_label: diagnosisLabel || null,
        }),
      });
      if (res.ok) {
        toast.success("Plan de tratamiento creado");
        setShowForm(false);
        resetForm();
        fetchPlans();
      } else {
        const json = await res.json();
        toast.error(json.error || "Error al crear plan");
      }
    } catch { toast.error("Error de conexión"); }
    setSaving(false);
  };

  const updatePlanStatus = async (planId: string, status: string) => {
    try {
      const res = await fetch(`/api/treatment-plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success("Estado actualizado");
        fetchPlans();
      }
    } catch { toast.error("Error al actualizar"); }
  };

  const updateSessionStatus = async (planId: string, sessionId: string, status: string) => {
    try {
      const res = await fetch(`/api/treatment-plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, status }),
      });
      if (res.ok) {
        fetchPlans();
      }
    } catch { toast.error("Error al actualizar sesión"); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ClipboardList className="h-4 w-4 text-blue-500" />
          <span className="text-xs font-semibold">Planes de Tratamiento</span>
          {plans.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium">{plans.length}</span>
          )}
        </div>
        {canEdit && doctorId && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-1 text-[10px] font-medium text-blue-600 hover:bg-blue-500/20 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Nuevo plan
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          {templates.length > 0 && (
            <div className="space-y-1">
              <label className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                <LayoutTemplate className="h-3 w-3" />
                Aplicar plantilla (opcional)
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">— Sin plantilla —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.total_sessions != null ? ` (${t.total_sessions} sesiones)` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nombre del plan *"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción (opcional)"
            rows={2}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={totalSessions}
              onChange={(e) => setTotalSessions(e.target.value)}
              placeholder="# Sesiones"
              min="1" max="100"
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <div className="flex gap-1">
              <button
                onClick={handleCreate}
                disabled={saving || !title.trim()}
                className="flex-1 flex items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Crear
              </button>
              <button
                onClick={() => { setShowForm(false); resetForm(); }}
                className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plans list */}
      {plans.length === 0 && !showForm && (
        <p className="text-center text-xs text-muted-foreground py-4">Sin planes de tratamiento</p>
      )}

      {plans.map((plan) => {
        const isExpanded = expandedPlan === plan.id;
        const sessions = plan.treatment_sessions || [];
        const completedSessions = sessions.filter((s) => s.status === "completed").length;
        const statusConfig = TREATMENT_STATUS_CONFIG[plan.status];
        const progress = sessions.length > 0 ? (completedSessions / sessions.length) * 100 : 0;

        return (
          <div key={plan.id} className="rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
              className="flex w-full items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ClipboardList className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span className="text-xs font-semibold truncate">{plan.title}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {sessions.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {completedSessions}/{sessions.length}
                  </span>
                )}
                <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-medium", statusConfig.color)}>
                  {statusConfig.label}
                </span>
                <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-border px-3 py-2 space-y-2">
                {plan.description && (
                  <p className="text-xs text-muted-foreground">{plan.description}</p>
                )}
                {plan.doctors?.full_name && (
                  <p className="text-[10px] text-muted-foreground">
                    Doctor: <span className="font-medium text-foreground">{plan.doctors.full_name}</span>
                  </p>
                )}

                {/* Progress bar */}
                {sessions.length > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{Math.round(progress)}% completado</p>
                  </div>
                )}

                {/* Sessions */}
                {sessions.length > 0 && (
                  <div className="space-y-1">
                    {sessions
                      .sort((a, b) => a.session_number - b.session_number)
                      .map((session) => {
                        const sConfig = SESSION_STATUS_CONFIG[session.status];
                        return (
                          <div key={session.id} className="flex items-center justify-between rounded-md bg-muted/20 px-2 py-1.5">
                            <span className="text-[10px] font-medium">
                              Sesión {session.session_number}
                            </span>
                            <div className="flex items-center gap-1">
                              <span className={cn("rounded px-1 py-0.5 text-[9px] font-medium", sConfig.color)}>
                                {sConfig.label}
                              </span>
                              {canEdit && session.status === "pending" && (
                                <button
                                  onClick={() => updateSessionStatus(plan.id, session.id, "completed")}
                                  className="rounded bg-emerald-500/10 p-0.5 text-emerald-600 hover:bg-emerald-500/20"
                                  title="Marcar completada"
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Status actions */}
                {canEdit && plan.status === "active" && (
                  <div className="flex gap-1 pt-1">
                    <button
                      onClick={() => updatePlanStatus(plan.id, "completed")}
                      className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-600 hover:bg-emerald-500/20"
                    >
                      <Check className="h-3 w-3" /> Completar
                    </button>
                    <button
                      onClick={() => updatePlanStatus(plan.id, "paused")}
                      className="flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-600 hover:bg-amber-500/20"
                    >
                      <Pause className="h-3 w-3" /> Pausar
                    </button>
                  </div>
                )}
                {canEdit && plan.status === "paused" && (
                  <button
                    onClick={() => updatePlanStatus(plan.id, "active")}
                    className="flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-1 text-[10px] font-medium text-blue-600 hover:bg-blue-500/20"
                  >
                    <RotateCcw className="h-3 w-3" /> Reactivar
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
