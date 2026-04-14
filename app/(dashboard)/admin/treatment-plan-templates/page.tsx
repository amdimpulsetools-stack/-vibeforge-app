"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useOrgRole } from "@/hooks/use-org-role";
import { RoleGate } from "@/components/role-gate";
import { toast } from "sonner";
import {
  treatmentPlanTemplateSchema,
  type TreatmentPlanTemplateFormData,
} from "@/lib/validations/treatment-plan-template";
import type { TreatmentPlanTemplateWithDoctor } from "@/types/treatment-plan-templates";
import { SPECIALTIES } from "@/types/clinical-templates";
import {
  ClipboardList,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Globe,
  User,
  Stethoscope,
  Hash,
  Timer,
} from "lucide-react";

export default function TreatmentPlanTemplatesPage() {
  const { isAdmin } = useOrgRole();
  const [templates, setTemplates] = useState<TreatmentPlanTemplateWithDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TreatmentPlanTemplateWithDoctor | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TreatmentPlanTemplateFormData>({
    resolver: zodResolver(treatmentPlanTemplateSchema),
    defaultValues: {
      name: "",
      specialty: null,
      is_global: true,
      title_template: "",
      description: "",
      diagnosis_code: null,
      diagnosis_label: null,
      total_sessions: null,
      session_duration_minutes: null,
      internal_notes: null,
    },
  });

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/treatment-plan-templates");
      const json = await res.json();
      setTemplates(json.data ?? []);
    } catch {
      toast.error("Error al cargar plantillas");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const openCreate = () => {
    setEditing(null);
    reset({
      name: "",
      specialty: null,
      is_global: true,
      title_template: "",
      description: "",
      diagnosis_code: null,
      diagnosis_label: null,
      total_sessions: null,
      session_duration_minutes: null,
      internal_notes: null,
    });
    setShowForm(true);
  };

  const openEdit = (tpl: TreatmentPlanTemplateWithDoctor) => {
    setEditing(tpl);
    reset({
      name: tpl.name,
      specialty: tpl.specialty,
      is_global: tpl.is_global,
      title_template: tpl.title_template,
      description: tpl.description,
      diagnosis_code: tpl.diagnosis_code,
      diagnosis_label: tpl.diagnosis_label,
      total_sessions: tpl.total_sessions,
      session_duration_minutes: tpl.session_duration_minutes,
      internal_notes: tpl.internal_notes,
    });
    setShowForm(true);
  };

  const onSubmit = async (data: TreatmentPlanTemplateFormData) => {
    setSaving(true);
    try {
      const url = editing
        ? `/api/treatment-plan-templates/${editing.id}`
        : "/api/treatment-plan-templates";
      const method = editing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error || "Error al guardar");
        return;
      }

      toast.success(editing ? "Plantilla actualizada" : "Plantilla creada");
      setShowForm(false);
      setEditing(null);
      fetchTemplates();
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta plantilla? Esta acción no se puede deshacer.")) return;
    try {
      const res = await fetch(`/api/treatment-plan-templates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Error al eliminar");
        return;
      }
      toast.success("Plantilla eliminada");
      fetchTemplates();
    } catch {
      toast.error("Error de red");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <RoleGate minRole="doctor">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Plantillas de Tratamiento</h1>
            <p className="text-muted-foreground">
              Plantillas reutilizables para pre-llenar planes de tratamiento
            </p>
          </div>
          <button
            onClick={openCreate}
            className="self-start flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Nueva plantilla
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editing ? "Editar plantilla" : "Nueva plantilla"}
              </h2>
              <button
                onClick={() => { setShowForm(false); setEditing(null); }}
                className="rounded-lg p-1 hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Name + Specialty */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Nombre *</label>
                  <input
                    {...register("name")}
                    placeholder="Ej: Ortodoncia fase 1 (12 sesiones)"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  {errors.name && (
                    <p className="text-xs text-red-500">{errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Especialidad</label>
                  <select
                    {...register("specialty")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">Sin especialidad</option>
                    {SPECIALTIES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Global toggle */}
              {isAdmin && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    {...register("is_global")}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <Globe className="h-4 w-4 text-primary" />
                  <span>Plantilla global (visible para todos los doctores)</span>
                </label>
              )}

              {/* Pre-filled plan title */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Título del plan (se copia al crear)</label>
                <input
                  {...register("title_template")}
                  placeholder="Ej: Plan de ortodoncia - Fase 1"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                {errors.title_template && (
                  <p className="text-xs text-red-500">{errors.title_template.message}</p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Descripción</label>
                <textarea
                  {...register("description")}
                  placeholder="Detalles del tratamiento, objetivos, seguimiento recomendado..."
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              {/* Sessions + duration */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-xs font-medium">
                    <Hash className="h-3 w-3" /> Nº de sesiones
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    {...register("total_sessions", {
                      setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
                    })}
                    placeholder="Ej: 12"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  {errors.total_sessions && (
                    <p className="text-xs text-red-500">{errors.total_sessions.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="flex items-center gap-1.5 text-xs font-medium">
                    <Timer className="h-3 w-3" /> Duración por sesión (min)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={600}
                    {...register("session_duration_minutes", {
                      setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
                    })}
                    placeholder="Ej: 30"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  {errors.session_duration_minutes && (
                    <p className="text-xs text-red-500">{errors.session_duration_minutes.message}</p>
                  )}
                </div>
              </div>

              {/* Diagnosis */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Diagnóstico asociado (opcional)</h3>
                <div className="flex gap-2">
                  <input
                    {...register("diagnosis_code")}
                    placeholder="CIE-10"
                    className="w-24 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <input
                    {...register("diagnosis_label")}
                    placeholder="Descripción del diagnóstico"
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              {/* Internal notes */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Notas internas (opcional)
                </label>
                <textarea
                  {...register("internal_notes")}
                  placeholder="Observaciones internas para el equipo..."
                  rows={2}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editing ? "Guardar cambios" : "Crear plantilla"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditing(null); }}
                  className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Templates list */}
        {templates.length === 0 && !showForm ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
            <ClipboardList className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground mb-2">No hay plantillas creadas</p>
            <p className="text-xs text-muted-foreground/70 mb-4 max-w-md text-center">
              Las plantillas permiten pre-llenar planes de tratamiento con nombre, número de
              sesiones y diagnóstico. Ideal para tratamientos recurrentes como ortodoncia,
              fisioterapia o control prenatal.
            </p>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Crear primera plantilla
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(expandedId === tpl.id ? null : tpl.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ClipboardList className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{tpl.name}</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        {tpl.specialty && (
                          <span className="flex items-center gap-1">
                            <Stethoscope className="h-3 w-3" />
                            {tpl.specialty}
                          </span>
                        )}
                        {tpl.total_sessions != null && (
                          <span className="flex items-center gap-1">
                            <Hash className="h-3 w-3" />
                            {tpl.total_sessions} sesiones
                          </span>
                        )}
                        {tpl.session_duration_minutes != null && (
                          <span className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            {tpl.session_duration_minutes} min
                          </span>
                        )}
                        {tpl.is_global ? (
                          <span className="flex items-center gap-1 text-primary">
                            <Globe className="h-3 w-3" />
                            Global
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {tpl.doctors?.full_name ?? "Personal"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(tpl); }}
                      className="rounded-lg p-2 hover:bg-muted transition-colors"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(tpl.id); }}
                      className="rounded-lg p-2 hover:bg-red-500/10 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>

                {expandedId === tpl.id && (
                  <div className="border-t border-border px-4 py-3 bg-muted/10 space-y-2 text-xs">
                    {tpl.title_template && (
                      <div>
                        <span className="font-semibold text-muted-foreground">Título del plan:</span>{" "}
                        <span className="text-foreground/90">{tpl.title_template}</span>
                      </div>
                    )}
                    {tpl.description && (
                      <div>
                        <span className="font-semibold text-muted-foreground">Descripción:</span>{" "}
                        <span className="text-foreground/80 whitespace-pre-wrap">{tpl.description}</span>
                      </div>
                    )}
                    {(tpl.diagnosis_code || tpl.diagnosis_label) && (
                      <div>
                        <span className="font-semibold text-muted-foreground">Diagnóstico:</span>{" "}
                        {tpl.diagnosis_code && <span className="font-mono">{tpl.diagnosis_code}</span>}
                        {tpl.diagnosis_code && tpl.diagnosis_label && " — "}
                        {tpl.diagnosis_label}
                      </div>
                    )}
                    {tpl.internal_notes && (
                      <div className="pt-1 border-t border-border/50 text-muted-foreground">
                        <span className="font-semibold">Notas internas:</span>{" "}
                        <span className="whitespace-pre-wrap">{tpl.internal_notes}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </RoleGate>
  );
}
