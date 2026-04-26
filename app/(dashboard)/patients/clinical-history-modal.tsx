"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Stethoscope,
  Lock,
  Heart,
  Loader2,
  User,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { PatientWithTags } from "@/types/admin";
import type { ClinicalNote, SOAPSection, Vitals } from "@/types/clinical-notes";
import { SOAP_LABELS, VITALS_FIELDS } from "@/types/clinical-notes";
import { calculateAge } from "@/lib/export";
import { VitalsTrendsChart } from "./vitals-trends-chart";
import { DiagnosisHistoryPanel } from "./diagnosis-history-panel";
import { TreatmentPlansPanel } from "./treatment-plans-panel";
import { PrescriptionsPanel } from "./prescriptions-panel";
import { ClinicalFollowupsPanel } from "./clinical-followups-panel";
import { ClinicalAttachmentsPanel } from "./clinical-attachments-panel";
import { ExamOrdersPanel } from "./exam-orders-panel";

interface ClinicalHistoryModalProps {
  patient: PatientWithTags;
  open: boolean;
  onClose: () => void;
  /** When provided, enables editing (create plans, prescriptions, etc.) */
  doctorId?: string | null;
  canEdit?: boolean;
}

export function ClinicalHistoryModal({
  patient,
  open,
  onClose,
  doctorId,
  canEdit = false,
}: ClinicalHistoryModalProps) {
  const [clinicalNotes, setClinicalNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clinical-notes?patient_id=${patient.id}`);
      const json = await res.json();
      setClinicalNotes(json.data ?? []);
    } catch {
      // silent
    }
    setLoading(false);
  }, [patient.id]);

  useEffect(() => {
    if (open) fetchNotes();
  }, [open, fetchNotes]);

  const patientAge = patient.birth_date ? calculateAge(patient.birth_date) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-full max-w-[95vw] md:max-w-5xl xl:max-w-[1480px] 2xl:max-w-[1680px] max-h-[95vh] md:max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden [&>button]:hidden">
        <DialogDescription className="sr-only">Historia clínica del paciente</DialogDescription>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
              <Stethoscope className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">Historia Clínica</DialogTitle>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {patient.first_name} {patient.last_name}
                </span>
                {patient.dni && (
                  <span className="text-xs">DNI: {patient.dni}</span>
                )}
                {patientAge != null && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {patientAge} años
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Clinical Notes Section */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Notas Clínicas
            </h3>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : clinicalNotes.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin notas clínicas registradas
              </p>
            ) : (
              <div className="space-y-3">
                {clinicalNotes.map((note) => {
                  const isExpanded = expandedNote === note.id;
                  const doctorInfo = (
                    note as ClinicalNote & {
                      doctors?: { full_name: string; color: string };
                    }
                  ).doctors;
                  const hasVitals = VITALS_FIELDS.some(
                    (f) => note.vitals?.[f.key as keyof Vitals] != null
                  );

                  return (
                    <div
                      key={note.id}
                      className={cn(
                        "rounded-lg border border-border overflow-hidden transition-all",
                        note.is_signed && "border-l-4 border-l-emerald-500"
                      )}
                    >
                      {/* Header */}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedNote(isExpanded ? null : note.id)
                        }
                        className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Stethoscope className="h-4 w-4 text-emerald-500 shrink-0" />
                          <span className="text-sm font-semibold">
                            {new Date(note.created_at).toLocaleDateString(
                              "es-PE",
                              {
                                day: "2-digit",
                                month: "long",
                                year: "numeric",
                              }
                            )}
                          </span>
                          {doctorInfo && (
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{
                                  backgroundColor: doctorInfo.color,
                                }}
                              />
                              {doctorInfo.full_name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {note.is_signed && (
                            <Lock className="h-3.5 w-3.5 text-emerald-500" />
                          )}
                          {note.diagnosis_code && (
                            <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono font-medium">
                              {note.diagnosis_code}
                            </span>
                          )}
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 text-muted-foreground transition-transform",
                              isExpanded && "rotate-180"
                            )}
                          />
                        </div>
                      </button>

                      {/* Expanded content */}
                      {isExpanded && (
                        <div className="border-t border-border px-5 py-4 space-y-4">
                          {/* SOAP — 2 columns on large */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(
                              Object.keys(SOAP_LABELS) as SOAPSection[]
                            ).map((section) => {
                              const content = note[section];
                              if (!content) return null;
                              const { letter, label } = SOAP_LABELS[section];
                              return (
                                <div
                                  key={section}
                                  className="space-y-2 rounded-lg border border-border/50 p-3 bg-muted/20"
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white",
                                        section === "subjective" &&
                                          "bg-blue-500",
                                        section === "objective" &&
                                          "bg-emerald-500",
                                        section === "assessment" &&
                                          "bg-amber-500",
                                        section === "plan" &&
                                          "bg-purple-500"
                                      )}
                                    >
                                      {letter}
                                    </span>
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                      {label}
                                    </span>
                                  </div>
                                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap pl-8">
                                    {content}
                                  </p>
                                </div>
                              );
                            })}
                          </div>

                          {/* Diagnosis */}
                          {(note.diagnosis_code ||
                            note.diagnosis_label) && (
                            <div className="rounded-lg bg-muted/30 px-4 py-3">
                              <span className="text-xs font-semibold text-muted-foreground uppercase">
                                Diagnóstico:{" "}
                              </span>
                              {note.diagnosis_code && (
                                <span className="font-mono font-semibold text-sm text-primary">
                                  {note.diagnosis_code}
                                </span>
                              )}
                              {note.diagnosis_code &&
                                note.diagnosis_label &&
                                " — "}
                              <span className="text-sm">
                                {note.diagnosis_label}
                              </span>
                            </div>
                          )}

                          {/* Vitals */}
                          {hasVitals && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-2">
                                <Heart className="h-4 w-4 text-red-500" />
                                <span className="text-xs font-semibold text-muted-foreground uppercase">
                                  Signos Vitales
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
                                {VITALS_FIELDS.filter(
                                  (f) =>
                                    note.vitals?.[
                                      f.key as keyof Vitals
                                    ] != null
                                ).map((f) => (
                                  <div
                                    key={f.key}
                                    className="rounded-lg bg-muted/40 px-3 py-2 text-center"
                                  >
                                    <p className="text-[10px] text-muted-foreground">
                                      {f.label}
                                    </p>
                                    <p className="text-sm font-semibold">
                                      {
                                        note.vitals[
                                          f.key as keyof Vitals
                                        ]
                                      }{" "}
                                      <span className="text-[10px] font-normal text-muted-foreground">
                                        {f.unit}
                                      </span>
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Signed info */}
                          {note.is_signed && note.signed_at && (
                            <p className="text-xs text-muted-foreground/70">
                              Firmada el{" "}
                              {new Date(
                                note.signed_at
                              ).toLocaleDateString("es-PE", {
                                day: "2-digit",
                                month: "long",
                                year: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Clinical Panels — 2 columns */}
          <section className="border-t border-border pt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Historial Clínico Completo
            </h3>
            <div className="space-y-6">
              <VitalsTrendsChart patientId={patient.id} />
              <DiagnosisHistoryPanel patientId={patient.id} />
              <TreatmentPlansPanel
                patientId={patient.id}
                doctorId={doctorId ?? undefined}
                canEdit={canEdit}
              />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PrescriptionsPanel
                  patientId={patient.id}
                  doctorId={doctorId ?? undefined}
                  canEdit={canEdit}
                />
                <ClinicalFollowupsPanel
                  patientId={patient.id}
                  doctorId={doctorId ?? undefined}
                  canEdit={canEdit}
                />
              </div>
              <ExamOrdersPanel
                patientId={patient.id}
                doctorId={doctorId ?? undefined}
                canEdit={canEdit}
              />
              <ClinicalAttachmentsPanel
                patientId={patient.id}
                canEdit={canEdit}
              />
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
