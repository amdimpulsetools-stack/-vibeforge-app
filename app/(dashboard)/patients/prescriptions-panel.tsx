"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PrescriptionWithDoctor } from "@/types/clinical-history";
import { PRESCRIPTION_ROUTES, PRESCRIPTION_FREQUENCIES } from "@/types/clinical-history";
import {
  Pill,
  Plus,
  Loader2,
  Check,
  X,
  ChevronDown,
  Ban,
  RotateCcw,
} from "lucide-react";
import { PrescriptionPrintButton } from "@/app/(dashboard)/scheduler/prescription-print";
import {
  CLINICAL_PANEL_CTA,
  CLINICAL_PANEL_CTA_ICON,
  CLINICAL_PANEL_CTA_VARIANTS,
} from "@/lib/clinical-ui-tokens";

interface PrescriptionsPanelProps {
  patientId: string;
  doctorId?: string;
  appointmentId?: string;
  clinicalNoteId?: string;
  canEdit: boolean;
  /** If true, the clinical note is signed — prevents creating NEW prescriptions but allows suspending existing ones */
  isSigned?: boolean;
  /** For print — optional */
  patientName?: string;
  patientDni?: string | null;
  doctorName?: string;
  appointmentDate?: string;
  clinicName?: string;
}

export function PrescriptionsPanel({ patientId, doctorId, appointmentId, clinicalNoteId, canEdit, isSigned = false, patientName, patientDni, doctorName, appointmentDate, clinicName }: PrescriptionsPanelProps) {
  const [prescriptions, setPrescriptions] = useState<PrescriptionWithDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedRx, setExpandedRx] = useState<string | null>(null);

  // Form
  const [medication, setMedication] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [route, setRoute] = useState("");
  const [instructions, setInstructions] = useState("");
  const [quantity, setQuantity] = useState("");

  const fetchPrescriptions = useCallback(async () => {
    const param = appointmentId ? `appointment_id=${appointmentId}` : `patient_id=${patientId}`;
    try {
      const res = await fetch(`/api/prescriptions?${param}`);
      const json = await res.json();
      setPrescriptions(json.data ?? []);
    } catch { toast.error("Error al cargar prescripciones"); }
    setLoading(false);
  }, [patientId, appointmentId]);

  useEffect(() => { fetchPrescriptions(); }, [fetchPrescriptions]);

  const handleCreate = async () => {
    if (!medication.trim() || !doctorId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          doctor_id: doctorId,
          appointment_id: appointmentId || null,
          clinical_note_id: clinicalNoteId || null,
          medication: medication.trim(),
          dosage: dosage || null,
          frequency: frequency || null,
          duration: duration || null,
          route: route || null,
          instructions: instructions || null,
          quantity: quantity || null,
        }),
      });
      if (res.ok) {
        toast.success("Prescripción agregada");
        setShowForm(false);
        setMedication(""); setDosage(""); setFrequency(""); setDuration("");
        setRoute(""); setInstructions(""); setQuantity("");
        fetchPrescriptions();
      } else {
        const json = await res.json();
        toast.error(json.error || "Error al crear prescripción");
      }
    } catch { toast.error("Sin conexión. Revisa tu internet e intenta otra vez."); }
    setSaving(false);
  };

  const toggleActive = async (rx: PrescriptionWithDoctor) => {
    try {
      const res = await fetch(`/api/prescriptions/${rx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !rx.is_active }),
      });
      if (res.ok) {
        toast.success(rx.is_active ? "Prescripción suspendida" : "Prescripción reactivada");
        fetchPrescriptions();
      }
    } catch { toast.error("Error al actualizar"); }
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
          <Pill className="h-4 w-4 text-violet-500" />
          <span className="text-xs font-semibold">Prescripciones</span>
          {prescriptions.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium">{prescriptions.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {prescriptions.length > 0 && patientName && doctorName && appointmentDate && (
            <PrescriptionPrintButton
              prescriptions={prescriptions}
              patientName={patientName}
              patientDni={patientDni}
              doctorName={doctorName}
              appointmentDate={appointmentDate}
              clinicName={clinicName}
            />
          )}
          {canEdit && doctorId && !isSigned && (
            <button
              onClick={() => setShowForm(!showForm)}
              className={cn(CLINICAL_PANEL_CTA, CLINICAL_PANEL_CTA_VARIANTS.violet)}
              aria-label="Crear nueva receta"
            >
              <Plus className={CLINICAL_PANEL_CTA_ICON} />
              Nueva receta
            </button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showForm && !isSigned && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <input
            type="text"
            value={medication}
            onChange={(e) => setMedication(e.target.value)}
            placeholder="Medicamento *"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              placeholder="Dosis (ej: 500mg)"
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <select
              value={route}
              onChange={(e) => setRoute(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Vía</option>
              {PRESCRIPTION_ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Frecuencia</option>
              {PRESCRIPTION_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Duración (ej: 7 días)"
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Cantidad"
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Instrucciones adicionales"
            rows={2}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="flex gap-1">
            <button
              onClick={handleCreate}
              disabled={saving || !medication.trim()}
              className="flex-1 flex items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Agregar
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Prescriptions list */}
      {prescriptions.length === 0 && !showForm && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-xs text-muted-foreground">Aún no hay recetas para esta consulta</p>
          {canEdit && doctorId && !isSigned && (
            <button
              onClick={() => setShowForm(true)}
              className={cn(CLINICAL_PANEL_CTA, CLINICAL_PANEL_CTA_VARIANTS.violet)}
            >
              <Plus className={CLINICAL_PANEL_CTA_ICON} />
              Crear primera receta
            </button>
          )}
        </div>
      )}

      {prescriptions.map((rx) => (
        <div
          key={rx.id}
          className={cn(
            "rounded-lg border border-border overflow-hidden",
            !rx.is_active && "opacity-60"
          )}
        >
          <button
            onClick={() => setExpandedRx(expandedRx === rx.id ? null : rx.id)}
            className="flex w-full items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Pill className={cn("h-3.5 w-3.5 shrink-0", rx.is_active ? "text-violet-500" : "text-muted-foreground")} />
              <div className="text-left min-w-0">
                <span className="text-xs font-semibold block truncate">{rx.medication}</span>
                {rx.dosage && <span className="text-[10px] text-muted-foreground">{rx.dosage}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {rx.frequency && <span className="text-[9px] text-muted-foreground">{rx.frequency}</span>}
              {!rx.is_active && (
                <span className="rounded bg-red-500/10 px-1 py-0.5 text-[9px] font-medium text-red-600">Suspendido</span>
              )}
              <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", expandedRx === rx.id && "rotate-180")} />
            </div>
          </button>

          {expandedRx === rx.id && (
            <div className="border-t border-border px-3 py-2 space-y-1 text-[10px]">
              {rx.route && <p><span className="text-muted-foreground">Vía:</span> {rx.route}</p>}
              {rx.duration && <p><span className="text-muted-foreground">Duración:</span> {rx.duration}</p>}
              {rx.quantity && <p><span className="text-muted-foreground">Cantidad:</span> {rx.quantity}</p>}
              {rx.instructions && <p><span className="text-muted-foreground">Instrucciones:</span> {rx.instructions}</p>}
              {rx.doctors?.full_name && <p><span className="text-muted-foreground">Doctor:</span> {rx.doctors.full_name}</p>}
              <p><span className="text-muted-foreground">Fecha:</span> {new Date(rx.created_at).toLocaleDateString("es-PE")}</p>
              {canEdit && (
                <button
                  onClick={() => toggleActive(rx)}
                  className={cn(
                    "mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                    rx.is_active
                      ? "bg-red-500/10 text-red-600 hover:bg-red-500/20"
                      : "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                  )}
                >
                  {rx.is_active ? <><Ban className="h-3 w-3" /> Suspender</> : <><RotateCcw className="h-3 w-3" /> Reactivar</>}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
