"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ClinicalFollowupWithRelations } from "@/types/clinical-history";
import { FOLLOWUP_PRIORITY_CONFIG } from "@/types/clinical-history";
import {
  Flag,
  Plus,
  Loader2,
  Check,
  X,
  CheckCircle2,
  Circle,
  Calendar,
} from "lucide-react";
import {
  CLINICAL_PANEL_CTA,
  CLINICAL_PANEL_CTA_ICON,
  CLINICAL_PANEL_CTA_VARIANTS,
} from "@/lib/clinical-ui-tokens";

interface ClinicalFollowupsPanelProps {
  patientId: string;
  doctorId?: string;
  appointmentId?: string;
  clinicalNoteId?: string;
  canEdit: boolean;
}

export function ClinicalFollowupsPanel({
  patientId,
  doctorId,
  appointmentId,
  clinicalNoteId,
  canEdit,
}: ClinicalFollowupsPanelProps) {
  const [followups, setFollowups] = useState<ClinicalFollowupWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  // Form state
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState<"red" | "yellow" | "green">("green");
  const [followUpDate, setFollowUpDate] = useState("");
  const [notes, setNotes] = useState("");

  const fetchFollowups = useCallback(async () => {
    try {
      const params = new URLSearchParams({ patient_id: patientId });
      if (showResolved) params.set("show_resolved", "true");
      const res = await fetch(`/api/clinical-followups?${params}`);
      const json = await res.json();
      setFollowups(json.data ?? []);
    } catch {
      toast.error("Error al cargar seguimientos");
    }
    setLoading(false);
  }, [patientId, showResolved]);

  useEffect(() => {
    fetchFollowups();
  }, [fetchFollowups]);

  const handleCreate = async () => {
    if (!reason.trim() || !doctorId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/clinical-followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          doctor_id: doctorId,
          appointment_id: appointmentId || null,
          clinical_note_id: clinicalNoteId || null,
          priority,
          reason: reason.trim(),
          follow_up_date: followUpDate || null,
          notes: notes || null,
        }),
      });
      if (res.ok) {
        toast.success("Seguimiento creado");
        setShowForm(false);
        setReason("");
        setPriority("green");
        setFollowUpDate("");
        setNotes("");
        fetchFollowups();
      } else {
        const json = await res.json();
        toast.error(json.error || "Error al crear seguimiento");
      }
    } catch {
      toast.error("Sin conexión. Revisa tu internet e intenta otra vez.");
    }
    setSaving(false);
  };

  const resolveFollowup = async (id: string) => {
    try {
      const res = await fetch(`/api/clinical-followups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_resolved: true }),
      });
      if (res.ok) {
        toast.success("Seguimiento resuelto");
        fetchFollowups();
      }
    } catch {
      toast.error("Error al actualizar");
    }
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
          <Flag className="h-4 w-4 text-red-500" />
          <span className="text-xs font-semibold">Seguimientos</span>
          {followups.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium">
              {followups.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowResolved(!showResolved)}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
              showResolved
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {showResolved ? "Ocultar resueltos" : "Ver resueltos"}
          </button>
          {canEdit && doctorId && (
            <button
              onClick={() => setShowForm(!showForm)}
              className={cn(CLINICAL_PANEL_CTA, CLINICAL_PANEL_CTA_VARIANTS.red)}
              aria-label="Crear nuevo seguimiento"
            >
              <Plus className={CLINICAL_PANEL_CTA_ICON} />
              Seguimiento
            </button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo del seguimiento *"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="grid grid-cols-3 gap-1">
            {(["red", "yellow", "green"] as const).map((p) => {
              const config = FOLLOWUP_PRIORITY_CONFIG[p];
              return (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors border",
                    priority === p
                      ? `${config.bgLight} ${config.textColor} border-current`
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  <span
                    className={cn("h-2 w-2 rounded-full", config.color)}
                  />
                  {config.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas (opcional)"
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={handleCreate}
              disabled={saving || !reason.trim()}
              className="flex-1 flex items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Crear
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Followups list */}
      {followups.length === 0 && !showForm && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-xs text-muted-foreground">Sin seguimientos pendientes</p>
          {canEdit && doctorId && (
            <button
              onClick={() => setShowForm(true)}
              className={cn(CLINICAL_PANEL_CTA, CLINICAL_PANEL_CTA_VARIANTS.red)}
            >
              <Plus className={CLINICAL_PANEL_CTA_ICON} />
              Crear primer seguimiento
            </button>
          )}
        </div>
      )}

      {followups.map((fu) => {
        const config = FOLLOWUP_PRIORITY_CONFIG[fu.priority];
        return (
          <div
            key={fu.id}
            className={cn(
              "rounded-lg border border-border px-3 py-2 space-y-1",
              fu.is_resolved && "opacity-60"
            )}
          >
            <div className="flex items-start gap-2">
              <span
                className={cn("mt-0.5 h-2.5 w-2.5 rounded-full shrink-0", config.color)}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{fu.reason}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{config.label}</span>
                  {fu.follow_up_date && (
                    <>
                      <span>&middot;</span>
                      <span>
                        {new Date(fu.follow_up_date).toLocaleDateString("es-PE")}
                      </span>
                    </>
                  )}
                  {fu.doctors?.full_name && (
                    <>
                      <span>&middot;</span>
                      <span>{fu.doctors.full_name}</span>
                    </>
                  )}
                </div>
                {fu.notes && (
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {fu.notes}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                {fu.is_resolved ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : canEdit ? (
                  <button
                    onClick={() => resolveFollowup(fu.id)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600 transition-colors"
                    title="Marcar resuelto"
                  >
                    <Circle className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
