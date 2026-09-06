"use client";

/**
 * Atajos clínicos: "Receta" y "Orden de examen".
 *
 * Un solo par de botones reutilizado en los DOS puntos de entrada que pidió
 * el founder — el sidebar de la cita en la agenda y el drawer del paciente —
 * para que recetar no obligue a entrar a la historia clínica.
 *
 * Los modales se montan solo cuando se abren: el de exámenes consulta el
 * catálogo de la org al montarse y no tiene sentido pagarlo en cada cita
 * que el staff abre.
 */

import { useState } from "react";
import { FlaskConical, Pill } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrescriptionComposerModal } from "./prescription-composer-modal";
import { ExamOrderComposerModal } from "./exam-order-composer-modal";

export interface ClinicalShortcutsProps {
  patientId: string;
  patientName: string;
  /** Médico firmante: el doctor de la cita, o el del usuario si no hay cita. */
  doctorId: string;
  doctorName?: string;
  /** `null` cuando el atajo se usa fuera de una cita (drawer del paciente). */
  appointmentId?: string | null;
  /** Se dispara tras guardar cualquiera de los dos documentos. */
  onSaved?: () => void;
  className?: string;
}

const buttonClass =
  "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary";

export function ClinicalShortcuts({
  patientId,
  patientName,
  doctorId,
  doctorName,
  appointmentId = null,
  onSaved,
  className,
}: ClinicalShortcutsProps) {
  const [showPrescription, setShowPrescription] = useState(false);
  const [showExamOrder, setShowExamOrder] = useState(false);

  return (
    <>
      <div className={cn("flex gap-2", className)}>
        <button
          type="button"
          onClick={() => setShowPrescription(true)}
          className={buttonClass}
        >
          <Pill className="h-4 w-4 shrink-0" />
          Receta
        </button>
        <button
          type="button"
          onClick={() => setShowExamOrder(true)}
          className={buttonClass}
        >
          <FlaskConical className="h-4 w-4 shrink-0" />
          Orden de examen
        </button>
      </div>

      {showPrescription && (
        <PrescriptionComposerModal
          open={showPrescription}
          onOpenChange={setShowPrescription}
          patientId={patientId}
          patientName={patientName}
          doctorId={doctorId}
          doctorName={doctorName}
          appointmentId={appointmentId}
          onSaved={() => onSaved?.()}
        />
      )}

      {showExamOrder && (
        <ExamOrderComposerModal
          open={showExamOrder}
          onOpenChange={setShowExamOrder}
          patientId={patientId}
          patientName={patientName}
          doctorId={doctorId}
          doctorName={doctorName}
          appointmentId={appointmentId}
          onSaved={() => onSaved?.()}
        />
      )}
    </>
  );
}
