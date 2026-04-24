"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
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
  Trash2,
} from "lucide-react";

interface ServiceOption {
  id: string;
  name: string;
  base_price: number | null;
  duration_minutes: number | null;
}

interface LineItem {
  key: string; // local React key
  service_id: string;
  quantity: number;
  unit_price: number;
}

interface TreatmentPlansPanelProps {
  patientId: string;
  doctorId?: string;
  canEdit: boolean;
}

function formatMoney(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

let keyCounter = 0;
const newKey = () => `li_${++keyCounter}`;

export function TreatmentPlansPanel({ patientId, doctorId, canEdit }: TreatmentPlansPanelProps) {
  const [plans, setPlans] = useState<TreatmentPlanWithSessions[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [services, setServices] = useState<ServiceOption[]>([]);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [diagnosisCode, setDiagnosisCode] = useState<string | null>(null);
  const [diagnosisLabel, setDiagnosisLabel] = useState<string | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);

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
      // Silent
    }
  }, []);

  const fetchServices = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("services")
      .select("id, name, base_price, duration_minutes")
      .eq("is_active", true)
      .order("name");
    setServices((data ?? []) as ServiceOption[]);
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);
  useEffect(() => {
    if (canEdit) {
      fetchTemplates();
      fetchServices();
    }
  }, [fetchTemplates, fetchServices, canEdit]);

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    if (tpl.title_template) setTitle(tpl.title_template);
    else if (tpl.name) setTitle(tpl.name);
    if (tpl.description) setDescription(tpl.description);
    setDiagnosisCode(tpl.diagnosis_code);
    setDiagnosisLabel(tpl.diagnosis_label);
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setNotes("");
    setDiagnosisCode(null);
    setDiagnosisLabel(null);
    setItems([]);
    setSelectedTemplateId("");
  };

  const addItem = () => {
    const firstService = services[0];
    setItems((prev) => [
      ...prev,
      {
        key: newKey(),
        service_id: firstService?.id || "",
        quantity: 1,
        unit_price: Number(firstService?.base_price || 0),
      },
    ]);
  };

  const updateItem = (key: string, patch: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const next = { ...it, ...patch };
        // If service changed, snapshot new base_price
        if (patch.service_id && patch.service_id !== it.service_id) {
          const s = services.find((sv) => sv.id === patch.service_id);
          if (s && s.base_price != null) {
            next.unit_price = Number(s.base_price);
          }
        }
        return next;
      })
    );
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  };

  const totalBudget = useMemo(
    () =>
      items.reduce(
        (sum, it) => sum + (Number(it.unit_price) || 0) * (it.quantity || 0),
        0
      ),
    [items]
  );
  const totalSessions = useMemo(
    () => items.reduce((sum, it) => sum + (it.quantity || 0), 0),
    [items]
  );

  const canSubmit =
    title.trim().length > 0 &&
    items.length > 0 &&
    items.every((it) => it.service_id && it.quantity > 0);

  const handleCreate = async () => {
    if (!canSubmit || !doctorId) return;
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
          notes: notes || null,
          diagnosis_code: diagnosisCode || null,
          diagnosis_label: diagnosisLabel || null,
          items: items.map((it) => ({
            service_id: it.service_id,
            quantity: Number(it.quantity),
            unit_price: Number(it.unit_price),
          })),
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
    } catch {
      toast.error("Sin conexión. Revisa tu internet e intenta otra vez.");
    }
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
            onClick={() => {
              if (!showForm && items.length === 0 && services.length > 0) {
                // Seed one empty item for convenience
                addItem();
              }
              setShowForm(!showForm);
            }}
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

          {/* Line items */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground">
                Servicios del plan *
              </span>
              {services.length === 0 ? (
                <span className="text-[10px] text-amber-600">
                  No hay servicios activos
                </span>
              ) : null}
            </div>

            {items.map((it) => {
              const svc = services.find((s) => s.id === it.service_id);
              const lineTotal = (it.unit_price || 0) * (it.quantity || 0);
              return (
                <div
                  key={it.key}
                  className="rounded-md border border-border bg-background/50 p-2 space-y-1.5"
                >
                  <div className="flex items-center gap-1">
                    <select
                      value={it.service_id}
                      onChange={(e) =>
                        updateItem(it.key, { service_id: e.target.value })
                      }
                      className="min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                    >
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeItem(it.key)}
                      className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                      title="Eliminar"
                      type="button"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[10px]">
                    <label className="flex flex-col">
                      <span className="text-muted-foreground">Cantidad</span>
                      <input
                        type="number"
                        value={it.quantity}
                        min={1}
                        max={100}
                        onChange={(e) =>
                          updateItem(it.key, {
                            quantity: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                        className="rounded border border-input bg-background px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </label>
                    <label className="flex flex-col">
                      <span className="text-muted-foreground">Precio</span>
                      <input
                        type="number"
                        value={it.unit_price}
                        min={0}
                        step={0.01}
                        onChange={(e) =>
                          updateItem(it.key, {
                            unit_price: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="rounded border border-input bg-background px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                    </label>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="rounded border border-transparent px-1.5 py-1 text-[11px] font-semibold text-emerald-600">
                        {formatMoney(lineTotal)}
                      </span>
                    </div>
                  </div>
                  {svc?.duration_minutes ? (
                    <p className="text-[9px] text-muted-foreground">
                      {svc.duration_minutes} min/sesión
                    </p>
                  ) : null}
                </div>
              );
            })}

            <button
              type="button"
              onClick={addItem}
              disabled={services.length === 0}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-accent/30 disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
              Añadir servicio
            </button>
          </div>

          {items.length > 0 && (
            <div className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  Total presupuesto
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {formatMoney(totalBudget)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-emerald-700/70 dark:text-emerald-400/70">
                <span>{totalSessions} sesiones en total</span>
              </div>
            </div>
          )}

          <div className="flex gap-1 pt-1">
            <button
              onClick={handleCreate}
              disabled={saving || !canSubmit}
              className="flex-1 flex items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Crear plan
            </button>
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              <X className="h-3 w-3" />
            </button>
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
        const planItems = plan.treatment_plan_items || [];
        const completedSessions = sessions.filter((s) => s.status === "completed").length;
        const statusConfig = TREATMENT_STATUS_CONFIG[plan.status];
        const progress = sessions.length > 0 ? (completedSessions / sessions.length) * 100 : 0;
        const planTotal = planItems.reduce(
          (sum, it) => sum + Number(it.unit_price) * it.quantity,
          0
        );

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
                {planTotal > 0 && (
                  <span className="text-[10px] font-semibold text-emerald-600">
                    {formatMoney(planTotal)}
                  </span>
                )}
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

                {/* Items breakdown */}
                {planItems.length > 0 && (
                  <div className="rounded-md bg-muted/20 p-2 space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground">
                      Servicios incluidos
                    </p>
                    {planItems.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between text-[11px]"
                      >
                        <span className="truncate">
                          {it.services?.name ?? "Servicio"} × {it.quantity}
                        </span>
                        <span className="font-medium text-emerald-600">
                          {formatMoney(Number(it.unit_price) * it.quantity)}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t border-border/50 pt-1 text-[11px] font-semibold">
                      <span>Total</span>
                      <span className="text-emerald-600">{formatMoney(planTotal)}</span>
                    </div>
                  </div>
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
                      .slice()
                      .sort((a, b) => a.session_number - b.session_number)
                      .map((session) => {
                        const sConfig = SESSION_STATUS_CONFIG[session.status];
                        const svc = planItems.find(
                          (it) => it.id === session.treatment_plan_item_id
                        )?.services?.name;
                        return (
                          <div key={session.id} className="flex items-center justify-between rounded-md bg-muted/20 px-2 py-1.5">
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] font-medium">
                                Sesión {session.session_number}
                              </span>
                              {svc && (
                                <span className="ml-1 text-[10px] text-muted-foreground">
                                  · {svc}
                                </span>
                              )}
                              {session.session_price != null && (
                                <span className="ml-1 text-[10px] font-medium text-emerald-600">
                                  {formatMoney(Number(session.session_price))}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
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
