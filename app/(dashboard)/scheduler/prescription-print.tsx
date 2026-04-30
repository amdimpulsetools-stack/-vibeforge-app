"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PrescriptionWithDoctor } from "@/types/clinical-history";

interface PrescriptionPrintProps {
  /** ID de la cita — requerido. El PDF se renderiza server-side con
   *  @react-pdf/renderer en /api/pdf/prescription/[appointmentId]. */
  appointmentId: string;
  /** Lista solo para decidir si mostrar el botón (si no hay activas, se oculta). */
  prescriptions: PrescriptionWithDoctor[];
}

export function PrescriptionPrintButton({
  appointmentId,
  prescriptions,
}: PrescriptionPrintProps) {
  const activePrescriptions = prescriptions.filter((rx) => rx.is_active);
  if (activePrescriptions.length === 0 || !appointmentId) return null;

  const handlePrint = () => {
    // El endpoint devuelve `Content-Type: application/pdf` con
    // `Content-Disposition: inline`, así que el navegador lo abre en una
    // pestaña nueva con preview + opción de descargar/imprimir.
    window.open(`/api/pdf/prescription/${appointmentId}`, "_blank", "noopener");
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium",
        "text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      )}
      title="Abrir receta en PDF (usa la plantilla de Settings → Plantillas HC)"
    >
      <Printer className="h-3 w-3" />
      Imprimir Receta
    </button>
  );
}
