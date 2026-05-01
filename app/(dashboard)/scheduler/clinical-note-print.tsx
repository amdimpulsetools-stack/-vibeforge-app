"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClinicalNote } from "@/types/clinical-notes";

interface ClinicalNotePrintProps {
  note: ClinicalNote;
  // Props legacy (no se usan ya que el endpoint resuelve todo desde DB),
  // pero las dejamos en la firma para no romper los call sites.
  patientName?: string;
  patientDni?: string | null;
  doctorName?: string;
  serviceName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  clinicName?: string;
}

export function ClinicalNotePrintButton({ note }: ClinicalNotePrintProps) {
  const handlePrint = () => {
    window.open(`/api/pdf/clinical-note/${note.id}`, "_blank", "noopener");
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium",
        "text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      )}
      title="Abrir nota clínica en PDF (usa la plantilla de Settings → Plantillas HC)"
    >
      <Printer className="h-4 w-4" />
      Imprimir
    </button>
  );
}
