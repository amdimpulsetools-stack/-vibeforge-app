"use client";

/**
 * "Iniciar tratamiento" — confirmación previa a crear el tratamiento desde
 * un presupuesto aceptado (POST /api/budgets/[id]/start → RPC mig 245).
 *
 * Por qué un modal y no un botón directo: iniciar es la transición con más
 * consecuencias del embudo (crea el tratamiento, congela el monto acordado
 * y cambia el presupuesto a «En curso»). Antes bastaba un click y nadie
 * podía corregir la doctora ni la fecha de inicio. Aquí se precarga todo lo
 * que ya sabemos del presupuesto y solo se piden los datos que el RPC
 * acepta: doctora, asistente, fecha y nota.
 *
 * El monto NO se edita ni se recalcula: es `budget_records.amount` tal cual
 * (una fórmula, un número). El RPC lo copia a `treatments.expected_total`.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { useOrganization } from "@/components/organization-provider";
import { useOrgToday } from "@/hooks/use-org-today";
import type { TreatmentStartInput } from "@/types/treatments";

interface DoctorOption {
  id: string;
  full_name: string;
}

interface ResponsibleOption {
  id: string;
  label: string;
  role?: string | null;
}

/** Fila del presupuesto que el listado NO trae (assigned_doctor_id / servicio). */
interface BudgetStartContext {
  assigned_doctor_id: string | null;
  service_id: string | null;
  service_name: string | null;
}

export interface TreatmentStartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  patientName: string;
  /** Etiqueta legible del tipo (FIV, IIU…) tal como la pinta la card. */
  treatmentTypeLabel: string;
  /** `budget_records.amount` — monto acordado, bruto. */
  amount: number | null;
  /** Se dispara tras iniciar, para refrescar el listado del kanban. */
  onStarted?: () => void;
}

export function TreatmentStartDialog({
  open,
  onOpenChange,
  budgetId,
  patientName,
  treatmentTypeLabel,
  amount,
  onStarted,
}: TreatmentStartDialogProps) {
  const router = useRouter();
  const { organizationId } = useOrganization();
  // Fecha civil de la org (mig 240): tras las 19:00 Lima, toISOString()
  // proponía el día siguiente como inicio del tratamiento.
  const { today: orgToday } = useOrgToday();

  const [doctorId, setDoctorId] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [startedAt, setStartedAt] = useState(() => orgToday());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Contexto del presupuesto: `assigned_doctor_id` y el nombre del servicio
  // no viajan en el listado (BUDGET_COLUMNS de /api/budgets), así que se
  // piden aquí, solo al abrir el modal.
  const { data: context, isPending: contextPending } = useQuery({
    queryKey: ["budget-start-context", budgetId],
    enabled: open,
    queryFn: async (): Promise<BudgetStartContext | null> => {
      const { data } = await createClient()
        .from("budget_records")
        .select("assigned_doctor_id, service_id, service:services(name)")
        .eq("id", budgetId)
        .maybeSingle();
      if (!data) return null;
      const row = data as unknown as {
        assigned_doctor_id: string | null;
        service_id: string | null;
        service: { name: string | null } | { name: string | null }[] | null;
      };
      const service = Array.isArray(row.service) ? row.service[0] : row.service;
      return {
        assigned_doctor_id: row.assigned_doctor_id ?? null,
        service_id: row.service_id ?? null,
        service_name: service?.name ?? null,
      };
    },
  });

  // Acotado a la org activa: la RLS devuelve los doctores de TODAS las orgs
  // del usuario y el RPC rechaza una doctora de otra clínica.
  const { data: doctors = [] } = useQuery({
    queryKey: ["treatment-start-doctors", organizationId],
    enabled: open && !!organizationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DoctorOption[]> => {
      const { data } = await createClient()
        .from("doctors")
        .select("id, full_name")
        .eq("organization_id", organizationId as string)
        .eq("is_active", true)
        .order("full_name");
      return (data as unknown as DoctorOption[]) ?? [];
    },
  });

  // Mismo endpoint que usa el scheduler (hooks/use-scheduler-master-data):
  // devuelve organization_members.id, que es justo lo que espera
  // `treatments.assistant_member_id`.
  const { data: responsibles = [] } = useQuery({
    queryKey: ["treatment-start-responsibles"],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ResponsibleOption[]> => {
      const res = await fetch("/api/members/responsibles");
      if (!res.ok) return [];
      return ((await res.json()) as ResponsibleOption[]) ?? [];
    },
  });

  // Al abrir (y cuando llega el contexto) se reponen los valores por
  // defecto: doctora tratante del presupuesto y "hoy" de la org.
  useEffect(() => {
    if (!open) return;
    setDoctorId(context?.assigned_doctor_id ?? "");
    setAssistantId("");
    setStartedAt(orgToday());
    setNotes("");
  }, [open, context?.assigned_doctor_id, orgToday]);

  const treatmentText = [treatmentTypeLabel, context?.service_name]
    .filter(Boolean)
    .join(" · ");

  const confirm = async () => {
    setSaving(true);
    const body: TreatmentStartInput = {
      doctor_id: doctorId || null,
      assistant_member_id: assistantId || null,
      started_at: startedAt || undefined,
      notes: notes.trim() || undefined,
    };
    const res = await fetch(`/api/budgets/${budgetId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    const json = (await res.json().catch(() => ({}))) as {
      treatment_id?: string;
      error?: string;
    };
    if (!res.ok) {
      toast.error(json.error ?? "No se pudo iniciar el tratamiento");
      return;
    }
    toast.success("Tratamiento iniciado");
    onOpenChange(false);
    onStarted?.();
    if (json.treatment_id) {
      router.push(`/tratamientos/${json.treatment_id}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md p-5 [&>button]:top-4 [&>button]:right-4">
        <DialogTitle className="text-base font-bold">
          Iniciar tratamiento
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          Se creará el tratamiento y el presupuesto quedará «En curso». Los
          pagos se registran en Tratamientos.
        </DialogDescription>

        {/* Resumen precargado — todo viene del presupuesto, nada se reescribe. */}
        <dl className="mt-4 space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-xs">
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">Paciente</dt>
            <dd className="text-right font-semibold">{patientName}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">Tratamiento</dt>
            <dd className="text-right font-semibold">
              {contextPending && !context ? "…" : treatmentText || treatmentTypeLabel}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">Monto acordado</dt>
            <dd className="text-right font-semibold">
              {amount != null ? formatCurrency(Number(amount)) : "Sin monto registrado"}
            </dd>
          </div>
        </dl>

        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label htmlFor="ts-doctor" className="text-xs font-medium">
              Doctora
            </label>
            <select
              id="ts-doctor"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">-- Sin asignar --</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="ts-assistant" className="text-xs font-medium">
              Asistente <span className="text-muted-foreground">(opcional)</span>
            </label>
            <select
              id="ts-assistant"
              value={assistantId}
              onChange={(e) => setAssistantId(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">-- Ninguno --</option>
              {responsibles.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="ts-date" className="text-xs font-medium">
              Fecha de inicio
            </label>
            <input
              id="ts-date"
              type="date"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="ts-notes" className="text-xs font-medium">
              Nota <span className="text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              id="ts-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ej. inicia estimulación el lunes"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="min-h-[44px] rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={saving}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Iniciar tratamiento
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
