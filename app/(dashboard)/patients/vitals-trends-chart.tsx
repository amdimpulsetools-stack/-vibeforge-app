"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Heart, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { ClinicalNote } from "@/types/clinical-notes";
import { VITALS_FIELDS, type Vitals } from "@/types/clinical-notes";

interface VitalsTrendsChartProps {
  patientId: string;
  clinicalNotes?: ClinicalNote[];
}

const VITAL_COLORS: Record<string, string> = {
  systolic_bp: "#ef4444",
  diastolic_bp: "#f97316",
  heart_rate: "#ec4899",
  temperature: "#8b5cf6",
  respiratory_rate: "#06b6d4",
  oxygen_saturation: "#10b981",
  weight: "#6366f1",
  height: "#84cc16",
};

export function VitalsTrendsChart({ patientId, clinicalNotes }: VitalsTrendsChartProps) {
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(!clinicalNotes);
  const [selectedVital, setSelectedVital] = useState<string>("heart_rate");

  // Use passed-in notes if available (avoids duplicate fetch)
  useEffect(() => {
    if (clinicalNotes) {
      setNotes(clinicalNotes);
      setLoading(false);
    }
  }, [clinicalNotes]);

  const fetchNotes = useCallback(async () => {
    if (clinicalNotes) return; // Skip if notes provided via props
    try {
      const res = await fetch(`/api/clinical-notes?patient_id=${patientId}`);
      const json = await res.json();
      setNotes(json.data ?? []);
    } catch {
      toast.error("Error al cargar notas clínicas");
    }
    setLoading(false);
  }, [patientId, clinicalNotes]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Build chart data from notes with vitals
  const chartData = notes
    .filter((n) => n.vitals && n.vitals[selectedVital as keyof Vitals] != null)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((n) => ({
      date: new Date(n.created_at).toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "short",
      }),
      value: Number(n.vitals[selectedVital as keyof Vitals]),
    }));

  // Find which vitals have data
  const availableVitals = VITALS_FIELDS.filter((f) =>
    notes.some((n) => n.vitals?.[f.key as keyof Vitals] != null)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (availableVitals.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-cyan-500" />
          <span className="text-xs font-semibold">Tendencias de Signos Vitales</span>
        </div>
        <p className="text-center text-xs text-muted-foreground py-4">
          Sin datos de signos vitales
        </p>
      </div>
    );
  }

  const vitalField = VITALS_FIELDS.find((f) => f.key === selectedVital);
  const color = VITAL_COLORS[selectedVital] || "#6366f1";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <TrendingUp className="h-4 w-4 text-cyan-500" />
        <span className="text-xs font-semibold">Tendencias de Signos Vitales</span>
      </div>

      {/* Vital selector */}
      <div className="flex flex-wrap gap-1">
        {availableVitals.map((f) => (
          <button
            key={f.key}
            onClick={() => setSelectedVital(f.key)}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
              selectedVital === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      {chartData.length < 2 ? (
        <p className="text-center text-xs text-muted-foreground py-4">
          Se necesitan al menos 2 registros para graficar
        </p>
      ) : (
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9 }}
                className="fill-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 9 }}
                className="fill-muted-foreground"
                width={35}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  backgroundColor: "hsl(var(--card))",
                  color: "hsl(var(--foreground))",
                }}
                formatter={(value: number | undefined) => [
                  `${value ?? ""} ${vitalField?.unit || ""}`,
                  vitalField?.label || selectedVital,
                ]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={{ r: 3, fill: color }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
