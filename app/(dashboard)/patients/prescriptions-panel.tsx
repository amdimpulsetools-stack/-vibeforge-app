"use client";

/**
 * Recetas de la consulta dentro de la historia clínica (y del drawer y del
 * modal de historia del paciente).
 *
 * Emitir usa EL MISMO compositor que los atajos de la agenda
 * (`PrescriptionComposerModal`): busca en el catálogo de medicamentos de la
 * org (mig 248), agrupa varios medicamentos en un lote (`batch_id`, mig 247)
 * y liga la receta al catálogo (mig 257). Antes este panel tenía su propio
 * formulario de texto libre, sin catálogo ni forma farmacéutica: dos caminos
 * para lo mismo que producían recetas distintas según desde dónde se
 * emitieran. Aquí además viaja `clinicalNoteId`, para que el Timeline de la
 * historia agrupe la receta con su nota.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PrescriptionWithDoctor } from "@/types/clinical-history";
import {
  Pill,
  Plus,
  Loader2,
  ChevronDown,
  Ban,
  RotateCcw,
} from "lucide-react";
import { PrescriptionPrintButton } from "@/app/(dashboard)/scheduler/prescription-print";
import { PrescriptionComposerModal } from "@/components/clinical/prescription-composer-modal";
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
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedRx, setExpandedRx] = useState<string | null>(null);

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

  // Lotes ya emitidos en esta consulta: el compositor avisa que la nueva
  // será una receta ADICIONAL (válido, pero que no sea por accidente).
  const existingBatchCount = useMemo(
    () =>
      new Set(
        prescriptions
          .filter((p) => p.is_active)
          .map((p) => p.batch_id ?? p.id)
      ).size,
    [prescriptions]
  );

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
          {prescriptions.length > 0 && appointmentId && (
            <PrescriptionPrintButton
              appointmentId={appointmentId}
              prescriptions={prescriptions}
            />
          )}
          {canEdit && doctorId && !isSigned && (
            <button
              onClick={() => setComposerOpen(true)}
              className={cn(CLINICAL_PANEL_CTA, CLINICAL_PANEL_CTA_VARIANTS.violet)}
              aria-label="Crear nueva receta"
            >
              <Plus className={CLINICAL_PANEL_CTA_ICON} />
              Nueva receta
            </button>
          )}
        </div>
      </div>

      {/* Prescriptions list */}
      {prescriptions.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-xs text-muted-foreground">Aún no hay recetas para esta consulta</p>
          {canEdit && doctorId && !isSigned && (
            <button
              onClick={() => setComposerOpen(true)}
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
              {rx.pharmaceutical_form && <p><span className="text-muted-foreground">Forma:</span> {rx.pharmaceutical_form}</p>}
              {rx.dose_per_take && <p><span className="text-muted-foreground">Por toma:</span> {rx.dose_per_take}</p>}
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
                      : "bg-success-500/10 text-success-600 hover:bg-success-500/20"
                  )}
                >
                  {rx.is_active ? <><Ban className="h-3 w-3" /> Suspender</> : <><RotateCcw className="h-3 w-3" /> Reactivar</>}
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {composerOpen && doctorId && (
        <PrescriptionComposerModal
          open={composerOpen}
          onOpenChange={setComposerOpen}
          patientId={patientId}
          patientName={patientName ?? ""}
          doctorId={doctorId}
          doctorName={doctorName}
          appointmentId={appointmentId ?? null}
          clinicalNoteId={clinicalNoteId ?? null}
          existingBatchCount={existingBatchCount}
          onSaved={() => fetchPrescriptions()}
        />
      )}
    </div>
  );
}
