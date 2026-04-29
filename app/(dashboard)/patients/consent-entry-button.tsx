"use client";

import { useState } from "react";
import { Camera, FileSignature, PenTool } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { InformedConsentModal } from "@/components/clinical/informed-consent-modal";
import { AttachmentUploadDialog } from "@/components/clinical/attachment-upload-dialog";
import { useOrgRole } from "@/hooks/use-org-role";

export interface ConsentEntryButtonProps {
  patientId: string;
  patientName: string;
  doctorId?: string | null;
  doctorName?: string | null;
  appointmentId?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  /** Called after either path completes successfully. */
  onCreated?: () => void;
}

/**
 * Single entry point for registering a patient consent — either by
 * uploading a photo of a paper consent (recommended for clinics that
 * sign on paper, e.g. Dermosalud) or by signing digitally in-app.
 *
 * Receptionists can upload a photo but cannot sign digitally — that's
 * the doctor's act during the consult.
 */
export function ConsentEntryButton(props: ConsentEntryButtonProps) {
  const [open, setOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [digitalOpen, setDigitalOpen] = useState(false);

  const { isAdmin, isDoctor, isReceptionist } = useOrgRole();
  const canUploadPhoto = isAdmin || isDoctor || isReceptionist;
  const canSignDigital = isAdmin || isDoctor;

  if (!canUploadPhoto && !canSignDigital) return null;

  const handleSelectPhoto = () => {
    setOpen(false);
    setPhotoOpen(true);
  };

  const handleSelectDigital = () => {
    setOpen(false);
    setDigitalOpen(true);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <FileSignature className="h-3.5 w-3.5" />
            Agregar consentimiento
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-1.5">
          <div className="flex flex-col gap-0.5">
            {canUploadPhoto && (
              <button
                type="button"
                onClick={handleSelectPhoto}
                className="flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent"
              >
                <Camera className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs font-medium">Subir foto del consentimiento firmado</p>
                  <p className="text-[11px] text-muted-foreground">
                    Recomendado si el paciente firma en papel.
                  </p>
                </div>
              </button>
            )}
            {canSignDigital && (
              <button
                type="button"
                onClick={handleSelectDigital}
                className="flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent"
              >
                <PenTool className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs font-medium">Firmar digitalmente</p>
                  <p className="text-[11px] text-muted-foreground">
                    El paciente firma en pantalla durante la consulta.
                  </p>
                </div>
              </button>
            )}
          </div>
          <p className="mt-1.5 border-t border-border/60 px-2.5 pt-2 text-[10.5px] text-muted-foreground">
            Ambos quedan registrados en el historial del paciente.
          </p>
        </PopoverContent>
      </Popover>

      <AttachmentUploadDialog
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        patientId={props.patientId}
        appointmentId={props.appointmentId ?? null}
        category="consent"
        title="Subir foto del consentimiento"
        description="Adjunta la foto o el escaneo del consentimiento firmado en papel."
        onUploaded={() => props.onCreated?.()}
      />

      <InformedConsentModal
        open={digitalOpen}
        onOpenChange={setDigitalOpen}
        patientId={props.patientId}
        patientName={props.patientName}
        doctorId={props.doctorId ?? null}
        doctorName={props.doctorName ?? null}
        appointmentId={props.appointmentId ?? null}
        serviceId={props.serviceId ?? null}
        serviceName={props.serviceName ?? null}
        onSaved={() => props.onCreated?.()}
      />
    </>
  );
}
