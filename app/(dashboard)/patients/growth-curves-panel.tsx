"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  Legend,
} from "recharts";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Loader2, Plus, TrendingUp, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildPercentileCurves,
  calculateMeasurement,
  ageInMonths,
  computeBMI,
  METRIC_AGE_RANGE,
  type GrowthMetric,
  type Sex,
} from "@/lib/growth-curves";

interface AnthropometryEntry {
  id: string;
  measurement_date: string;
  weight_kg: number | null;
  height_cm: number | null;
  head_circumference_cm: number | null;
  notes: string | null;
  created_at: string;
}

interface GrowthCurvesPanelProps {
  patientId: string;
  birthDate: string | null;
  sex: Sex | null;
  onRequestSexUpdate?: () => void;
}

const METRIC_OPTIONS: {
  key: GrowthMetric;
  label: string;
  unit: string;
  sourceField: keyof AnthropometryEntry;
}[] = [
  { key: "weight_for_age", label: "Peso / Edad", unit: "kg", sourceField: "weight_kg" },
  { key: "height_for_age", label: "Talla / Edad", unit: "cm", sourceField: "height_cm" },
  { key: "bmi_for_age", label: "IMC / Edad", unit: "kg/m²", sourceField: "weight_kg" },
  { key: "head_circumference_for_age", label: "P. Cefálico", unit: "cm", sourceField: "head_circumference_cm" },
];

const P50_COLOR = "#10b981"; // emerald primary
const PERCENTILE_COLOR = "#64748b";
const PATIENT_COLOR = "#6366f1";

export function GrowthCurvesPanel({
  patientId,
  birthDate,
  sex,
  onRequestSexUpdate,
}: GrowthCurvesPanelProps) {
  const confirm = useConfirm();
  const [entries, setEntries] = useState<AnthropometryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<GrowthMetric>("weight_for_age");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formWeight, setFormWeight] = useState("");
  const [formHeight, setFormHeight] = useState("");
  const [formHC, setFormHC] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/anthropometry`);
      if (res.ok) {
        setEntries(await res.json());
      }
    } catch {
      toast.error("Error al cargar mediciones");
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const patientMaxAgeMonths = useMemo(() => {
    if (!birthDate || entries.length === 0) return 24;
    const latest = entries[entries.length - 1];
    return Math.max(ageInMonths(birthDate, latest.measurement_date), 24);
  }, [birthDate, entries]);

  const chartData = useMemo(() => {
    if (!sex || !birthDate) return { curves: [], patientPoints: [] };
    const range = METRIC_AGE_RANGE[metric];
    const upper = Math.min(patientMaxAgeMonths + 12, range.maxMonths);
    const curves = buildPercentileCurves(metric, sex, upper);

    const metricCfg = METRIC_OPTIONS.find((m) => m.key === metric)!;
    const patientPoints = entries
      .map((e) => {
        const age = ageInMonths(birthDate, e.measurement_date);
        if (age < range.minMonths || age > range.maxMonths) return null;
        let value: number | null = null;
        if (metric === "bmi_for_age") {
          if (e.weight_kg && e.height_cm) value = computeBMI(e.weight_kg, e.height_cm);
        } else {
          const raw = e[metricCfg.sourceField];
          if (typeof raw === "number") value = raw;
        }
        if (value == null) return null;
        const stats = calculateMeasurement(metric, sex, age, value);
        return {
          ageMonths: Math.round(age * 10) / 10,
          patient: value,
          percentile: stats?.percentile ?? null,
          zScore: stats?.zScore ?? null,
          date: e.measurement_date,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => a.ageMonths - b.ageMonths);

    return { curves, patientPoints };
  }, [sex, birthDate, entries, metric, patientMaxAgeMonths]);

  const handleAdd = async () => {
    if (!formWeight && !formHeight && !formHC) {
      toast.error("Ingrese al menos una medición");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/anthropometry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          measurement_date: formDate,
          weight_kg: formWeight ? Number(formWeight) : null,
          height_cm: formHeight ? Number(formHeight) : null,
          head_circumference_cm: formHC ? Number(formHC) : null,
          notes: formNotes || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Medición registrada");
      setShowForm(false);
      setFormWeight("");
      setFormHeight("");
      setFormHC("");
      setFormNotes("");
      setFormDate(new Date().toISOString().slice(0, 10));
      fetchEntries();
    } catch {
      toast.error("Error al guardar");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Eliminar esta medición",
      description: "Esta acción no se puede deshacer.",
      confirmText: "Eliminar",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await fetch(
      `/api/patients/${patientId}/anthropometry?entryId=${id}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      toast.success("Medición eliminada");
      fetchEntries();
    } else {
      toast.error("Error al eliminar");
    }
  };

  // Guards
  if (!birthDate) {
    return (
      <EmptyState
        title="Falta fecha de nacimiento"
        description="Agrega la fecha de nacimiento del paciente en la pestaña Datos para calcular percentiles."
      />
    );
  }

  if (!sex) {
    return (
      <EmptyState
        title="Falta sexo biológico"
        description="Las curvas OMS usan tablas separadas por sexo. Registra el sexo del paciente en la pestaña Datos."
        actionLabel={onRequestSexUpdate ? "Ir a Datos" : undefined}
        onAction={onRequestSexUpdate}
      />
    );
  }

  const metricCfg = METRIC_OPTIONS.find((m) => m.key === metric)!;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Curvas de Crecimiento (OMS)</h4>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          {showForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {showForm ? "Cancelar" : "Nueva medición"}
        </button>
      </div>

      {/* Metric selector */}
      <div className="flex flex-wrap gap-1">
        {METRIC_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setMetric(opt.key)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              metric === opt.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* New-measurement form */}
      {showForm && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Fecha</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Peso (kg)</label>
              <input
                type="number"
                step="0.01"
                value={formWeight}
                onChange={(e) => setFormWeight(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Talla (cm)</label>
              <input
                type="number"
                step="0.1"
                value={formHeight}
                onChange={(e) => setFormHeight(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">P. Cefálico (cm)</label>
              <input
                type="number"
                step="0.1"
                value={formHC}
                onChange={(e) => setFormHC(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
            </div>
          </div>
          <input
            type="text"
            placeholder="Notas (opcional)"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
          <button
            onClick={handleAdd}
            disabled={saving}
            className="w-full rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar medición"}
          </button>
        </div>
      )}

      {/* Chart */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : chartData.curves.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-4">
          Sin datos de referencia para esta métrica.
        </p>
      ) : (
        <div className="h-72 w-full rounded-xl border border-border bg-card p-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData.curves} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
              <defs>
                <linearGradient id="band-3-97" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={P50_COLOR} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={P50_COLOR} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="ageMonths"
                type="number"
                domain={[0, "dataMax"]}
                tick={{ fontSize: 10 }}
                label={{ value: "Edad (meses)", position: "insideBottom", offset: -2, fontSize: 10 }}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                width={35}
                label={{
                  value: metricCfg.unit,
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 10,
                  offset: 5,
                }}
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
                formatter={(value, name) => [
                  typeof value === "number" ? value.toFixed(2) : String(value ?? ""),
                  String(name),
                ]}
                labelFormatter={(v) => `${v} meses`}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
              {/* Shaded band P3–P97 (stacked area trick) */}
              <Area
                type="monotone"
                dataKey="p3"
                stackId="band"
                stroke="none"
                fill="transparent"
                legendType="none"
                name="P3-base"
              />
              <Area
                type="monotone"
                dataKey={(d: { p3: number; p97: number }) => d.p97 - d.p3}
                stackId="band"
                stroke="none"
                fill="url(#band-3-97)"
                legendType="none"
                name="P3-P97"
              />
              {/* Percentile lines */}
              <Line
                type="monotone"
                dataKey="p3"
                stroke={PERCENTILE_COLOR}
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                name="P3"
              />
              <Line
                type="monotone"
                dataKey="p15"
                stroke={PERCENTILE_COLOR}
                strokeWidth={1}
                strokeDasharray="4 2"
                strokeOpacity={0.6}
                dot={false}
                name="P15"
              />
              <Line
                type="monotone"
                dataKey="p50"
                stroke={P50_COLOR}
                strokeWidth={2}
                dot={false}
                name="P50 (mediana)"
              />
              <Line
                type="monotone"
                dataKey="p85"
                stroke={PERCENTILE_COLOR}
                strokeWidth={1}
                strokeDasharray="4 2"
                strokeOpacity={0.6}
                dot={false}
                name="P85"
              />
              <Line
                type="monotone"
                dataKey="p97"
                stroke={PERCENTILE_COLOR}
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                name="P97"
              />
              {/* Patient trajectory */}
              <Scatter
                data={chartData.patientPoints}
                dataKey="patient"
                fill={PATIENT_COLOR}
                line={{ stroke: PATIENT_COLOR, strokeWidth: 2 }}
                lineType="joint"
                shape="circle"
                name="Paciente"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Latest measurement summary */}
      {chartData.patientPoints.length > 0 && (() => {
        const latest = chartData.patientPoints[chartData.patientPoints.length - 1];
        const zoneColor =
          latest.percentile! < 3 || latest.percentile! > 97
            ? "text-red-500 bg-red-500/10"
            : latest.percentile! < 15 || latest.percentile! > 85
              ? "text-amber-500 bg-amber-500/10"
              : "text-emerald-500 bg-emerald-500/10";
        return (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
            <div className="flex-1 text-xs">
              <div className="font-semibold">
                {metricCfg.label}: {latest.patient.toFixed(2)} {metricCfg.unit}
              </div>
              <div className="text-muted-foreground">
                {latest.ageMonths} meses • {latest.date}
              </div>
            </div>
            <div className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", zoneColor)}>
              P{latest.percentile} · z={latest.zScore}
            </div>
          </div>
        );
      })()}

      {/* Measurements table */}
      {entries.length > 0 && (
        <div className="space-y-1">
          <h5 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Historial
          </h5>
          <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
            {entries.slice().reverse().map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <div className="w-20 shrink-0 text-muted-foreground">{e.measurement_date}</div>
                <div className="flex-1 flex flex-wrap gap-3">
                  {e.weight_kg != null && <span>{e.weight_kg} kg</span>}
                  {e.height_cm != null && <span>{e.height_cm} cm</span>}
                  {e.head_circumference_cm != null && <span>PC {e.head_circumference_cm} cm</span>}
                </div>
                <button
                  onClick={() => handleDelete(e.id)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center space-y-2">
      <TrendingUp className="h-6 w-6 mx-auto text-muted-foreground" />
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="text-xs text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
