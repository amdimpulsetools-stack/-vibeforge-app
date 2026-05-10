"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Receipt } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { FertilityAddonGate } from "@/components/addons/fertility-addon-gate";
import { useOrgFertilityAdvisors } from "@/hooks/use-org-fertility-advisors";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────────────────────────
// AssignBudgetModal
//
// Phase 3 of the Budget Tiers feature. Lets a doctor or fertility
// advisor pick a service + tier (A/B/C) for a patient and persists it
// via POST /api/budgets/assign. The budget starts with sent_at = NULL
// (Sin procesar) and is later sent by the obstetra "of turn" through
// POST /api/budgets/[id]/send.
//
// The whole component is wrapped in <FertilityAddonGate> so it is
// rendered as null when the org doesn't have the addon — defense in
// depth (parents should already have guarded the entry point).
// ──────────────────────────────────────────────────────────────────

interface ServiceTier {
  tier: "A" | "B" | "C";
  amount: number;
  currency: "PEN" | "USD";
  includes_text: string | null;
  is_active: boolean;
}

interface BudgetEligibleService {
  id: string;
  name: string;
  duration_minutes: number;
  tiers: ServiceTier[];
}

export interface AssignBudgetModalProps {
  open: boolean;
  onClose: () => void;
  /** Patient the budget is for. Required. */
  patientId: string;
  /** When launched from an appointment card. */
  appointmentId?: string;
  /** When launched from a followup card. */
  followupId?: string;
  /** Optional optimistic refresh hook fired with the new budget id. */
  onCreated?: (budgetId: string) => void;
}

export function AssignBudgetModal(props: AssignBudgetModalProps) {
  return (
    <FertilityAddonGate>
      <AssignBudgetModalInner {...props} />
    </FertilityAddonGate>
  );
}

function AssignBudgetModalInner({
  open,
  onClose,
  patientId,
  appointmentId,
  followupId,
  onCreated,
}: AssignBudgetModalProps) {
  const [services, setServices] = useState<BudgetEligibleService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState<string>("");
  const [tier, setTier] = useState<"A" | "B" | "C" | null>(null);
  const [asesoraId, setAsesoraId] = useState<string>(""); // "" = sin asignar
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { advisors, loading: advisorsLoading } = useOrgFertilityAdvisors();

  const loadServices = useCallback(async () => {
    setServicesLoading(true);
    setServicesError(null);
    try {
      const res = await fetch("/api/services/budget-eligible", {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setServicesError(
          (err as { error?: string }).error ??
            "No se pudieron cargar los servicios elegibles",
        );
        setServices([]);
        return;
      }
      const data = (await res.json()) as BudgetEligibleService[];
      setServices(Array.isArray(data) ? data : []);
    } catch {
      setServicesError("Error de red al cargar servicios");
      setServices([]);
    } finally {
      setServicesLoading(false);
    }
  }, []);

  // Reset state on open/close so the next mount starts clean.
  useEffect(() => {
    if (open) {
      setServiceId("");
      setTier(null);
      setAsesoraId("");
      setNotes("");
      void loadServices();
    }
  }, [open, loadServices]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  // When the picked service changes, reset the tier (the new service
  // may not even have a tier with the previously-selected letter).
  useEffect(() => {
    setTier(null);
  }, [serviceId]);

  const canSubmit = Boolean(serviceId && tier && !submitting);

  const handleSubmit = async () => {
    if (!serviceId || !tier) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/budgets/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          service_id: serviceId,
          tier,
          asesora_id: asesoraId === "" ? null : asesoraId,
          appointment_id: appointmentId ?? null,
          followup_id: followupId ?? null,
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(err.error ?? "No se pudo asignar el presupuesto");
        return;
      }
      const data = (await res.json()) as { id: string };
      toast.success("Presupuesto asignado. Pendiente de procesar.");
      onCreated?.(data.id);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-full max-w-xl p-0 [&>button]:top-4 [&>button]:right-4">
        <div className="space-y-4 p-5">
          <div className="flex items-start gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
              <Receipt className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-bold">
                Asignar presupuesto
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Elige el servicio, el tier (paquete) y opcionalmente la
                asesora. La obstetra de turno enviará el presupuesto
                después.
              </DialogDescription>
            </div>
          </div>

          {/* Service picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Servicio
            </label>
            {servicesLoading ? (
              <div className="flex h-10 items-center justify-center rounded-lg border border-input bg-background text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Cargando servicios elegibles…
              </div>
            ) : servicesError ? (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 text-xs text-rose-600">
                {servicesError}
              </div>
            ) : services.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                No hay servicios marcados como elegibles para presupuestos.
                Configúralos desde <span className="font-medium">Admin → Servicios</span>.
              </div>
            ) : (
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                <option value="">Selecciona un servicio…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Tier picker */}
          {selectedService && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tier (paquete)
              </label>
              {selectedService.tiers.length === 0 ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-600">
                  Este servicio aún no tiene tiers configurados. Configúralos
                  desde Admin → Servicios.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(["A", "B", "C"] as const).map((letter) => {
                    const t = selectedService.tiers.find(
                      (x) => x.tier === letter,
                    );
                    const disabled = !t;
                    const isSelected = tier === letter;
                    return (
                      <button
                        key={letter}
                        type="button"
                        disabled={disabled}
                        onClick={() => t && setTier(letter)}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-colors",
                          disabled &&
                            "cursor-not-allowed border-dashed border-border/60 opacity-50",
                          !disabled && !isSelected &&
                            "border-border bg-card hover:border-emerald-500/40 hover:bg-emerald-500/5",
                          !disabled && isSelected &&
                            "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30",
                        )}
                      >
                        <div className="flex items-baseline justify-between">
                          <span className="text-lg font-bold">
                            Tier {letter}
                          </span>
                          {!disabled && (
                            <span
                              className={cn(
                                "text-[10px] font-semibold uppercase tracking-wide",
                                isSelected
                                  ? "text-emerald-600"
                                  : "text-muted-foreground",
                              )}
                            >
                              {isSelected ? "Seleccionado" : "Disponible"}
                            </span>
                          )}
                        </div>
                        {t ? (
                          <p
                            className={cn(
                              "mt-1 text-sm",
                              isSelected
                                ? "font-semibold text-emerald-700 dark:text-emerald-400"
                                : "text-muted-foreground",
                            )}
                          >
                            {t.currency === "USD" ? "USD" : "S/"}{" "}
                            {Number(t.amount).toFixed(2)}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs italic text-muted-foreground">
                            No configurado
                          </p>
                        )}
                        {t?.includes_text && (
                          <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                            {t.includes_text}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Asesora dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Asesora (opcional)
            </label>
            <select
              value={asesoraId}
              onChange={(e) => setAsesoraId(e.target.value)}
              disabled={advisorsLoading}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60"
            >
              <option value="">Sin asignar</option>
              {advisors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Si lo dejas en blanco, la obstetra de turno la asignará al
              enviar.
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notas internas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Contexto para la asesora, condiciones especiales, etc."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Asignar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
