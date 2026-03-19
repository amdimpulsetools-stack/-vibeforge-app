"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Activity } from "lucide-react";
import type { ClinicalNote } from "@/types/clinical-notes";

interface DiagnosisHistoryPanelProps {
  patientId: string;
}

interface DiagnosisEntry {
  code: string;
  label: string;
  date: string;
  doctorName: string | null;
  noteId: string;
}

export function DiagnosisHistoryPanel({ patientId }: DiagnosisHistoryPanelProps) {
  const [diagnoses, setDiagnoses] = useState<DiagnosisEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDiagnoses = useCallback(async () => {
    try {
      const res = await fetch(`/api/clinical-notes?patient_id=${patientId}`);
      const json = await res.json();
      const notes: (ClinicalNote & { doctors?: { full_name: string } })[] = json.data ?? [];

      const entries: DiagnosisEntry[] = notes
        .filter((n) => n.diagnosis_code || n.diagnosis_label)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((n) => ({
          code: n.diagnosis_code || "",
          label: n.diagnosis_label || "",
          date: n.created_at,
          doctorName: n.doctors?.full_name || null,
          noteId: n.id,
        }));

      setDiagnoses(entries);
    } catch {
      toast.error("Error al cargar diagnósticos");
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    fetchDiagnoses();
  }, [fetchDiagnoses]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group by unique diagnosis code
  const codeGroups = new Map<string, { count: number; label: string; lastDate: string }>();
  for (const d of diagnoses) {
    const key = d.code || d.label;
    const existing = codeGroups.get(key);
    if (existing) {
      existing.count++;
    } else {
      codeGroups.set(key, { count: 1, label: d.label, lastDate: d.date });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Activity className="h-4 w-4 text-pink-500" />
        <span className="text-xs font-semibold">Historial de Diagnósticos</span>
        {diagnoses.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium">
            {codeGroups.size}
          </span>
        )}
      </div>

      {diagnoses.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-4">
          Sin diagnósticos registrados
        </p>
      ) : (
        <>
          {/* Summary: unique codes with frequency */}
          {codeGroups.size > 0 && (
            <div className="flex flex-wrap gap-1">
              {Array.from(codeGroups.entries()).map(([code, info]) => (
                <span
                  key={code}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium"
                >
                  {code}
                  {info.count > 1 && (
                    <span className="rounded-full bg-primary/20 px-1 text-[9px] font-bold text-primary">
                      {info.count}x
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-1">
            {diagnoses.map((d, i) => (
              <div
                key={`${d.noteId}-${i}`}
                className="flex items-center gap-2 rounded-md bg-muted/20 px-2 py-1.5"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-pink-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {d.code && (
                      <span className="font-mono text-[10px] font-semibold text-primary">
                        {d.code}
                      </span>
                    )}
                    {d.label && (
                      <span className="text-[10px] truncate">{d.label}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                    <span>
                      {new Date(d.date).toLocaleDateString("es-PE", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    {d.doctorName && (
                      <>
                        <span>&middot;</span>
                        <span>{d.doctorName}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
