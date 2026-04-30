"use client";

import { useState, useEffect } from "react";
import { Pill, FlaskConical, ClipboardList, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { PrescriptionsPanel } from "@/app/(dashboard)/patients/prescriptions-panel";
import { ExamOrdersPanel } from "@/app/(dashboard)/patients/exam-orders-panel";
import { TreatmentPlansPanel } from "@/app/(dashboard)/patients/treatment-plans-panel";
import { ClinicalFollowupsPanel } from "@/app/(dashboard)/patients/clinical-followups-panel";

type TabKey = "rx" | "exam" | "plan" | "followup";

interface Counts {
  rx: number;
  exam: number;
  plan: number;
  followup: number;
}

interface TabDef {
  key: TabKey;
  label: string;
  shortLabel: string;
  icon: typeof Pill;
  accent: string; // tailwind text-* class for active underline accent
}

const TABS: TabDef[] = [
  { key: "rx", label: "Recetas", shortLabel: "Recetas", icon: Pill, accent: "text-violet-500" },
  { key: "exam", label: "Exámenes", shortLabel: "Exámenes", icon: FlaskConical, accent: "text-cyan-500" },
  { key: "plan", label: "Tratamientos", shortLabel: "Plan", icon: ClipboardList, accent: "text-blue-500" },
  { key: "followup", label: "Seguimientos", shortLabel: "Seguir", icon: Flag, accent: "text-red-500" },
];

interface ClinicalSidePanelsProps {
  patientId: string;
  doctorId: string;
  appointmentId?: string;
  /** ID de la nota clínica vinculada a esta cita. Crítico para que las
   *  recetas y exámenes nuevos queden ligados a la nota (no solo a la cita) —
   *  sin esto, el Timeline de HC no puede agruparlos por consulta. */
  clinicalNoteId?: string | null;
  canEdit: boolean;
  isSigned: boolean;
  patientName?: string;
  patientDni?: string | null;
  doctorName?: string;
  appointmentDate?: string;
  clinicName?: string;
  /** Sticky offset in px so the tab bar lands just below the modal header. */
  stickyTopClass?: string;
}

export function ClinicalSidePanels({
  patientId,
  doctorId,
  appointmentId,
  clinicalNoteId,
  canEdit,
  isSigned,
  patientName,
  patientDni,
  doctorName,
  appointmentDate,
  clinicName,
  stickyTopClass = "top-0",
}: ClinicalSidePanelsProps) {
  const [active, setActive] = useState<TabKey>("rx");
  const [counts, setCounts] = useState<Counts>({ rx: 0, exam: 0, plan: 0, followup: 0 });

  // Lightweight count fetch so tab badges feel "live" without mounting all 4
  // panels at once. The panels themselves still own the source of truth.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const param = appointmentId ? { appointment_id: appointmentId } : { patient_id: patientId };
    const filterCol = appointmentId ? "appointment_id" : "patient_id";
    const filterVal = appointmentId ?? patientId;

    (async () => {
      const [rxRes, examRes, planRes, followRes] = await Promise.all([
        supabase.from("prescriptions").select("id", { count: "exact", head: true }).eq(filterCol, filterVal),
        supabase.from("exam_orders").select("id", { count: "exact", head: true }).eq(filterCol, filterVal),
        supabase.from("treatment_plans").select("id", { count: "exact", head: true }).eq("patient_id", patientId),
        supabase
          .from("clinical_followups")
          .select("id", { count: "exact", head: true })
          .eq("patient_id", patientId)
          .eq("is_resolved", false),
      ]);
      if (cancelled) return;
      setCounts({
        rx: rxRes.count ?? 0,
        exam: examRes.count ?? 0,
        plan: planRes.count ?? 0,
        followup: followRes.count ?? 0,
      });
    })();

    return () => {
      cancelled = true;
    };
    // We intentionally re-fetch when appointment/patient changes; param/filterCol/filterVal derive from them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, appointmentId]);

  return (
    <div className="flex flex-col">
      {/* Tab bar */}
      <div
        className={cn(
          "sticky z-[5] flex items-center gap-0.5 border-b border-border bg-card/95 backdrop-blur",
          stickyTopClass
        )}
        role="tablist"
        aria-label="Secciones clínicas"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          const count = counts[t.key];
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              aria-controls={`clinical-tab-${t.key}`}
              id={`clinical-tab-trigger-${t.key}`}
              onClick={() => setActive(t.key)}
              className={cn(
                "relative inline-flex flex-1 items-center justify-center gap-1.5 h-11 px-2 text-xs font-medium transition-colors",
                "border-b-2 -mb-px",
                isActive
                  ? "border-emerald-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", isActive && t.accent)} />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.shortLabel}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
                    isActive ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      <div className="pt-4">
        <div
          role="tabpanel"
          id="clinical-tab-rx"
          aria-labelledby="clinical-tab-trigger-rx"
          hidden={active !== "rx"}
        >
          {active === "rx" && (
            <PrescriptionsPanel
              patientId={patientId}
              doctorId={doctorId}
              appointmentId={appointmentId}
              clinicalNoteId={clinicalNoteId ?? undefined}
              canEdit={canEdit}
              isSigned={isSigned}
              patientName={patientName}
              patientDni={patientDni}
              doctorName={doctorName}
              appointmentDate={appointmentDate}
              clinicName={clinicName}
            />
          )}
        </div>
        <div
          role="tabpanel"
          id="clinical-tab-exam"
          aria-labelledby="clinical-tab-trigger-exam"
          hidden={active !== "exam"}
        >
          {active === "exam" && (
            <ExamOrdersPanel
              patientId={patientId}
              doctorId={doctorId}
              appointmentId={appointmentId}
              clinicalNoteId={clinicalNoteId ?? undefined}
              canEdit={canEdit}
              isSigned={isSigned}
              patientName={patientName}
              patientDni={patientDni}
              doctorName={doctorName}
              appointmentDate={appointmentDate}
              clinicName={clinicName}
            />
          )}
        </div>
        <div
          role="tabpanel"
          id="clinical-tab-plan"
          aria-labelledby="clinical-tab-trigger-plan"
          hidden={active !== "plan"}
        >
          {active === "plan" && (
            <TreatmentPlansPanel
              patientId={patientId}
              doctorId={doctorId}
              canEdit={canEdit}
            />
          )}
        </div>
        <div
          role="tabpanel"
          id="clinical-tab-followup"
          aria-labelledby="clinical-tab-trigger-followup"
          hidden={active !== "followup"}
        >
          {active === "followup" && (
            <ClinicalFollowupsPanel
              patientId={patientId}
              doctorId={doctorId}
              appointmentId={appointmentId}
              canEdit={canEdit}
            />
          )}
        </div>
      </div>
    </div>
  );
}
