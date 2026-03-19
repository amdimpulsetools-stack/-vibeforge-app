"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ClinicalNotePanel } from "./clinical-note-panel";
import { PrescriptionsPanel } from "@/app/(dashboard)/patients/prescriptions-panel";
import { ClinicalFollowupsPanel } from "@/app/(dashboard)/patients/clinical-followups-panel";
import { TreatmentPlansPanel } from "@/app/(dashboard)/patients/treatment-plans-panel";
import { User, CalendarDays, Clock, Stethoscope } from "lucide-react";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-card z-10">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-5 w-5 text-emerald-500" />
            Historia Clínica
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
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
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          {/* SOAP Clinical Note — now with full width */}
          <ClinicalNotePanel
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
          />

          {/* Treatment Plans, Prescriptions & Follow-ups */}
          {patientId && (
            <div className="border-t border-border pt-6 space-y-6">
              <TreatmentPlansPanel
                patientId={patientId}
                doctorId={doctorId}
                canEdit={canEdit}
              />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PrescriptionsPanel
                  patientId={patientId}
                  doctorId={doctorId}
                  appointmentId={appointmentId}
                  canEdit={canEdit}
                  patientName={patientName}
                  patientDni={patientDni}
                  doctorName={doctorName}
                  appointmentDate={appointmentDate}
                  clinicName={clinicName}
                />
                <ClinicalFollowupsPanel
                  patientId={patientId}
                  doctorId={doctorId}
                  appointmentId={appointmentId}
                  canEdit={canEdit}
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
