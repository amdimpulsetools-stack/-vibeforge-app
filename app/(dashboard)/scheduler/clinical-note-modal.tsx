"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ClinicalNotePanel,
  type ClinicalNotePanelHandle,
  type ClinicalNotePanelState,
} from "./clinical-note-panel";
import { ClinicalSidePanels } from "./clinical-side-panels";
import { ClinicalNotePrintButton } from "./clinical-note-print";
import {
  User,
  CalendarDays,
  Clock,
  Stethoscope,
  Lock,
  Save,
  Loader2,
  Cloud,
  CloudOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CLINICAL_PRIMARY_CTA,
  CLINICAL_SIGN_CTA,
  CLINICAL_SIGN_CTA_READY,
  CLINICAL_SIGNED_BADGE,
} from "@/lib/clinical-ui-tokens";

interface ClinicalNoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  patientId: string | null;
  doctorId: string;
  canEdit: boolean;
  appointmentStatus: string;
  patientName?: string;
  patientDni?: string | null;
  doctorName?: string;
  serviceName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  clinicName?: string;
}

export function ClinicalNoteModal({
  open,
  onOpenChange,
  appointmentId,
  patientId,
  doctorId,
  canEdit,
  appointmentStatus,
  patientName,
  patientDni,
  doctorName,
  serviceName,
  appointmentDate,
  appointmentTime,
  clinicName,
}: ClinicalNoteModalProps) {
  const panelRef = useRef<ClinicalNotePanelHandle>(null);
  const [panelState, setPanelState] = useState<ClinicalNotePanelState>({
    note: null,
    isLocked: false,
    hasContent: false,
    isSaving: false,
    isSigning: false,
    autoSaveStatus: "idle",
  });

  const isSigned = panelState.isLocked;
  const canSign =
    canEdit &&
    !panelState.isLocked &&
    panelState.hasContent &&
    !!panelState.note;

  // Ctrl+S / Cmd+S triggers save while the modal is open and editable.
  useEffect(() => {
    if (!open || !canEdit || isSigned) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!panelState.isSaving) panelRef.current?.save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, canEdit, isSigned, panelState.isSaving]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] xl:max-w-[1480px] 2xl:max-w-[1680px] max-h-[92vh] overflow-y-auto p-0">
        {/* Sticky header — title, patient context, signed badge, global CTAs */}
        <DialogHeader className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur px-4 pt-4 pb-3 md:px-6 md:pt-5 md:pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Stethoscope className="h-5 w-5 text-emerald-500" />
                Historia Clínica
                {isSigned && (
                  <span className={CLINICAL_SIGNED_BADGE}>
                    <Lock className="h-3.5 w-3.5" />
                    Nota firmada
                    {panelState.note?.signed_at && (
                      <span className="text-amber-700/80 dark:text-amber-300/80">
                        {new Date(panelState.note.signed_at).toLocaleDateString("es-PE", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    )}
                  </span>
                )}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {patientName && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {patientName}
                    </span>
                  )}
                  {appointmentDate && (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {appointmentDate}
                    </span>
                  )}
                  {appointmentTime && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {appointmentTime}
                    </span>
                  )}
                  {serviceName && (
                    <span className="font-medium text-foreground">{serviceName}</span>
                  )}
                  {/* Auto-save indicator — moved to header for one canonical location */}
                  {canEdit && !isSigned && panelState.autoSaveStatus !== "idle" && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]",
                        panelState.autoSaveStatus === "saving" && "text-muted-foreground",
                        panelState.autoSaveStatus === "saved" && "text-emerald-500",
                        panelState.autoSaveStatus === "error" && "text-red-500"
                      )}
                      role="status"
                      aria-live="polite"
                    >
                      {panelState.autoSaveStatus === "saving" && (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
                        </>
                      )}
                      {panelState.autoSaveStatus === "saved" && (
                        <>
                          <Cloud className="h-3 w-3" /> Guardado
                        </>
                      )}
                      {panelState.autoSaveStatus === "error" && (
                        <>
                          <CloudOff className="h-3 w-3" /> Error al guardar
                        </>
                      )}
                    </span>
                  )}
                </div>
              </DialogDescription>
            </div>

            {/* Global CTAs — always visible while the modal is open */}
            {canEdit && (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {panelState.note &&
                  panelState.hasContent &&
                  patientName &&
                  doctorName &&
                  serviceName && (
                    <ClinicalNotePrintButton
                      note={panelState.note}
                      patientName={patientName}
                      patientDni={patientDni}
                      doctorName={doctorName}
                      serviceName={serviceName}
                      appointmentDate={appointmentDate ?? ""}
                      appointmentTime={appointmentTime ?? ""}
                      clinicName={clinicName}
                    />
                  )}
                <button
                  type="button"
                  onClick={() => panelRef.current?.save()}
                  disabled={panelState.isSaving || isSigned}
                  className={CLINICAL_PRIMARY_CTA}
                  title="Guardar (Ctrl+S)"
                  aria-label={panelState.note ? "Guardar nota clínica (Ctrl+S)" : "Crear nota clínica (Ctrl+S)"}
                >
                  {panelState.isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {panelState.note ? "Guardar" : "Crear nota"}
                  <kbd className="ml-1 hidden rounded bg-foreground/10 px-1 py-0.5 text-[10px] font-mono font-normal text-foreground/70 lg:inline">
                    Ctrl+S
                  </kbd>
                </button>
                {canSign && (
                  <button
                    type="button"
                    onClick={() => panelRef.current?.sign()}
                    disabled={panelState.isSigning}
                    className={cn(CLINICAL_SIGN_CTA, CLINICAL_SIGN_CTA_READY)}
                    aria-label="Firmar nota clínica (acción irreversible)"
                  >
                    {panelState.isSigning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                    Firmar nota
                  </button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="px-4 py-4 md:px-6 md:py-5">
          <div
            className={cn(
              "grid grid-cols-1 gap-4 md:gap-6",
              "xl:grid-cols-[minmax(0,1fr)_440px] 2xl:grid-cols-[minmax(0,1fr)_500px]",
              isSigned && "xl:items-start"
            )}
          >
            {/* Left: SOAP Clinical Note */}
            <div className={cn(isSigned && "opacity-90")}>
              <ClinicalNotePanel
                ref={panelRef}
                appointmentId={appointmentId}
                patientId={patientId}
                doctorId={doctorId}
                canEdit={canEdit}
                appointmentStatus={appointmentStatus}
                patientName={patientName}
                patientDni={patientDni}
                doctorName={doctorName}
                serviceName={serviceName}
                appointmentDate={appointmentDate}
                appointmentTime={appointmentTime}
                clinicName={clinicName}
                wideLayout
                hideFooterActions
                onStateChange={setPanelState}
              />
            </div>

            {/* Right: tabbed side panels */}
            {patientId && (
              <div className="xl:border-l xl:border-border xl:pl-6">
                <ClinicalSidePanels
                  patientId={patientId}
                  doctorId={doctorId}
                  appointmentId={appointmentId}
                  canEdit={canEdit}
                  isSigned={isSigned}
                  patientName={patientName}
                  patientDni={patientDni}
                  doctorName={doctorName}
                  appointmentDate={appointmentDate}
                  clinicName={clinicName}
                />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
