"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/supabase/client";
import {
  BUDGET_TREATMENT_TYPES,
  BUDGET_TREATMENT_TYPE_LABELS,
  type BudgetTreatmentType,
} from "@/types/fertility";

export interface BudgetFilters {
  treatment_types: BudgetTreatmentType[];
  doctor_id: string;
  date_from: string | null;
  date_to: string | null;
  q: string;
}

interface DoctorOption {
  user_id: string;
  full_name: string;
}

export function BudgetFiltersSheet({
  open,
  onOpenChange,
  draft,
  onDraftChange,
  onApply,
  onReset,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  draft: BudgetFilters;
  onDraftChange: (next: BudgetFilters) => void;
  onApply: (next: BudgetFilters) => void;
  onReset: () => void;
}) {
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    // Pull org members with user_profiles. Each user_id is potentially a sender.
    supabase
      .from("organization_members")
      .select("user_id, role, is_active")
      .eq("is_active", true)
      .then(async ({ data }) => {
        if (!data) return;
        const ids = data.map((m) => m.user_id);
        if (ids.length === 0) return;
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("id, full_name")
          .in("id", ids);
        const opts: DoctorOption[] = (profiles ?? []).map((p) => ({
          user_id: p.id as string,
          full_name: (p.full_name as string) ?? "Sin nombre",
        }));
        opts.sort((a, b) => a.full_name.localeCompare(b.full_name));
        setDoctors(opts);
      });
  }, [open]);

  const toggleType = (t: BudgetTreatmentType) => {
    const exists = draft.treatment_types.includes(t);
    onDraftChange({
      ...draft,
      treatment_types: exists
        ? draft.treatment_types.filter((x) => x !== t)
        : [...draft.treatment_types, t],
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>
            Refina la lista de presupuestos por tipo, doctor, fecha o nombre.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 py-4">
          {/* Search */}
          <div>
            <label className="text-xs font-medium">Buscar paciente</label>
            <input
              type="text"
              value={draft.q}
              onChange={(e) => onDraftChange({ ...draft, q: e.target.value })}
              placeholder="Nombre o apellido"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Treatment types */}
          <div>
            <p className="text-xs font-medium">Tipo de tratamiento</p>
            <div className="mt-2 space-y-1.5">
              {BUDGET_TREATMENT_TYPES.map((t) => (
                <label
                  key={t}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={draft.treatment_types.includes(t)}
                    onCheckedChange={() => toggleType(t)}
                  />
                  <span>{BUDGET_TREATMENT_TYPE_LABELS[t]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Doctor */}
          <div>
            <label className="text-xs font-medium">Quién envió</label>
            <select
              value={draft.doctor_id}
              onChange={(e) => onDraftChange({ ...draft, doctor_id: e.target.value })}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="all">Todos</option>
              {doctors.map((d) => (
                <option key={d.user_id} value={d.user_id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium">Desde</label>
              <input
                type="date"
                value={draft.date_from ?? ""}
                onChange={(e) =>
                  onDraftChange({ ...draft, date_from: e.target.value || null })
                }
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Hasta</label>
              <input
                type="date"
                value={draft.date_to ?? ""}
                onChange={(e) =>
                  onDraftChange({ ...draft, date_to: e.target.value || null })
                }
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        </div>

        <SheetFooter className="border-t border-border px-4 py-3">
          <div className="flex w-full items-center justify-between gap-2">
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={() => onApply(draft)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Aplicar
            </button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
