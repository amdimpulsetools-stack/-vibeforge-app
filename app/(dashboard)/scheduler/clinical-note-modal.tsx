"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { ClinicalNotePanel } from "./clinical-note-panel";
import { PrescriptionsPanel } from "@/app/(dashboard)/patients/prescriptions-panel";
import { ClinicalFollowupsPanel } from "@/app/(dashboard)/patients/clinical-followups-panel";
import { TreatmentPlansPanel } from "@/app/(dashboard)/patients/treatment-plans-panel";
import { ExamOrdersPanel } from "@/app/(dashboard)/patients/exam-orders-panel";
import { User, CalendarDays, Clock, Stethoscope, Lock } from "lucide-react";

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
  const [isSigned, setIsSigned] = useState(false);

  // Fetch the clinical note's signed status when modal opens
  useEffect(() => {
    if (!open || !appointmentId) return;
    const fetchSignedStatus = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("clinical_notes")
        .select("is_signed")
        .eq("appointment_id", appointmentId)
        .maybeSingle();
      setIsSigned(data?.is_signed === true);
    };
    fetchSignedStatus();
    // Poll every 2 seconds while modal is open to detect when user signs
    const interval = setInterval(fetchSignedStatus, 2000);
    return () => clearInterval(interval);
  }, [open, appointmentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] xl:max-w-7xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-card z-10">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-5 w-5 text-emerald-500" />
            Historia Clínica
            {isSigned && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                <Lock className="h-3 w-3" />
                Nota firmada
              </span>
            )}
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

        <div className="px-6 py-5">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
            {/* Left: SOAP Clinical Note */}
            <div>
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
            </div>

            {/* Right: Prescriptions, Exams, Treatment Plans, Follow-ups */}
            {patientId && (
              <div className="space-y-5 xl:border-l xl:border-border xl:pl-6">
                <PrescriptionsPanel
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
                <ExamOrdersPanel
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
                <TreatmentPlansPanel
                  patientId={patientId}
                  doctorId={doctorId}
                  canEdit={canEdit}
                />
                <ClinicalFollowupsPanel
                  patientId={patientId}
                  doctorId={doctorId}
                  appointmentId={appointmentId}
                  canEdit={canEdit}
                />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
