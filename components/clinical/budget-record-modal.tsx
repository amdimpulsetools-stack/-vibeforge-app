"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import {
  BUDGET_TREATMENT_TYPES,
  BUDGET_TREATMENT_TYPE_LABELS,
  type BudgetTreatmentType,
} from "@/types/fertility";

const formSchema = z.object({
  patient_id: z.string().uuid("Selecciona un paciente"),
  treatment_type: z.enum(BUDGET_TREATMENT_TYPES),
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => (v === "" || v === null ? null : Number(v)))
    .refine((v) => v === null || (!Number.isNaN(v) && v >= 0), "Monto inválido")
    .nullable()
    .optional(),
  notes: z.string().max(500).optional(),
});

type FormValues = z.input<typeof formSchema>;

export interface BudgetRecordModalProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Pre-selected patient — when provided, the patient picker is hidden. */
  patient?: {
    id: string;
    full_name: string;
  } | null;
  onSaved?: () => void;
}

interface PatientOption {
  id: string;
  full_name: string;
}

export function BudgetRecordModal({
  open,
  onOpenChange,
  patient,
  onSaved,
}: BudgetRecordModalProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      patient_id: patient?.id ?? "",
      treatment_type: "FIV",
      amount: "",
      notes: "",
    },
  });

  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<PatientOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatientLabel, setSelectedPatientLabel] = useState<string>(
    patient?.full_name ?? "",
  );

  useEffect(() => {
    if (!open) {
      reset({
        patient_id: patient?.id ?? "",
        treatment_type: "FIV",
        amount: "",
        notes: "",
      });
      setPatientQuery("");
      setPatientResults([]);
      setSelectedPatientLabel(patient?.full_name ?? "");
    }
  }, [open, patient, reset]);

  // Patient search (only when no patient is preselected).
  useEffect(() => {
    if (patient) return;
    if (patientQuery.trim().length < 2) {
      setPatientResults([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("patients")
        .select("id, first_name, last_name")
        .or(
          `first_name.ilike.%${patientQuery}%,last_name.ilike.%${patientQuery}%`,
        )
        .limit(8);
      if (cancelled) return;
      const opts: PatientOption[] = (data ?? []).map((p) => ({
        id: p.id as string,
        full_name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
      }));
      setPatientResults(opts);
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [patientQuery, patient]);

  const watchedPatientId = watch("patient_id");

  const onSubmit = async (values: FormValues) => {
    if (!values.patient_id) {
      toast.error("Selecciona un paciente");
      return;
    }
    const amountValue =
      values.amount === "" || values.amount === undefined || values.amount === null
        ? null
        : Number(values.amount);
    const res = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: values.patient_id,
        treatment_type: values.treatment_type,
        amount: amountValue,
        notes: values.notes?.trim() ? values.notes.trim() : null,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "No se pudo registrar el presupuesto");
      return;
    }
    toast.success("Presupuesto registrado. Seguimiento creado para 7 días.");
    onSaved?.();
    onOpenChange(false);
  };

  const treatmentOptions = useMemo(
    () =>
      BUDGET_TREATMENT_TYPES.map((k) => ({
        value: k,
        label: BUDGET_TREATMENT_TYPE_LABELS[k],
      })),
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md p-5 [&>button]:top-4 [&>button]:right-4">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            Registrar presupuesto enviado
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Crea un seguimiento de 7 días para recordar el contacto con el paciente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-3 space-y-4">
          {/* Patient field */}
          {patient ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Paciente
              </p>
              <p className="text-sm font-medium">{patient.full_name}</p>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium">Paciente</label>
              {watchedPatientId && selectedPatientLabel ? (
                <div className="mt-1 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                  <span className="truncate font-medium">{selectedPatientLabel}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setValue("patient_id", "");
                      setSelectedPatientLabel("");
                      setPatientQuery("");
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-accent"
                    aria-label="Quitar paciente"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={patientQuery}
                    onChange={(e) => setPatientQuery(e.target.value)}
                    placeholder="Buscar por nombre o apellido"
                    className="w-full rounded-lg border border-input bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  {(searching || patientResults.length > 0) && (
                    <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover shadow-lg">
                      {searching && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          Buscando…
                        </div>
                      )}
                      {!searching &&
                        patientResults.map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => {
                              setValue("patient_id", p.id, { shouldValidate: true });
                              setSelectedPatientLabel(p.full_name);
                              setPatientQuery("");
                              setPatientResults([]);
                            }}
                            className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent"
                          >
                            {p.full_name || "Paciente"}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
              {errors.patient_id && (
                <p className="mt-1 text-[11px] text-rose-500">
                  {errors.patient_id.message as string}
                </p>
              )}
            </div>
          )}

          {/* Treatment type */}
          <div>
            <label className="text-xs font-medium">Tipo de tratamiento</label>
            <Controller
              control={control}
              name="treatment_type"
              render={({ field }) => (
                <select
                  {...field}
                  value={field.value as BudgetTreatmentType}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {treatmentOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            />
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-medium">
              Monto aproximado{" "}
              <span className="text-muted-foreground">(opcional)</span>
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                S/
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                {...register("amount")}
                className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="0.00"
              />
            </div>
            {errors.amount && (
              <p className="mt-1 text-[11px] text-rose-500">
                {errors.amount.message as string}
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium">
              Notas <span className="text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              {...register("notes")}
              rows={3}
              maxLength={500}
              placeholder="Ej. Cotización con financiamiento, fecha tentativa, etc."
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? "Registrando…" : "Registrar envío"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
