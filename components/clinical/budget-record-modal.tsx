"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Receipt, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { useOrgFertilityAdvisors } from "@/hooks/use-org-fertility-advisors";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────────────────────────
// BudgetRecordModal (Phase 4 rewrite)
//
// Standalone "Registrar presupuesto" flow — used from the agenda
// (Scheduler → Presupuestos) and from the patient detail page when
// the user wants to assign a budget without coming from a cita.
//
// Previously this modal was a "register-already-sent" flow that just
// created a 7-day followup with a free-text "Monto aproximado". With
// the tier-based pricing now in place, monto aproximado made no
// sense (the system couldn't compute totals or render the PDF), so
// it was retired in favour of the proper assign flow:
//
//   patient → service → tier (A/B/C) → doctor → asesora → notes
//
// Posts to /api/budgets/assign — same endpoint as the cita-sidebar
// flow. The only thing that differs from AssignBudgetModal is the
// patient picker (we search instead of taking it as a prop) and we
// never have an appointment_id to pass, so the doctor dropdown is
// always shown.
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

interface OrgDoctor {
  id: string;
  full_name: string;
}

interface PatientOption {
  id: string;
  full_name: string;
}

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

export function BudgetRecordModal({
  open,
  onOpenChange,
  patient,
  onSaved,
}: BudgetRecordModalProps) {
  const [patientId, setPatientId] = useState<string>(patient?.id ?? "");
  const [selectedPatientLabel, setSelectedPatientLabel] = useState<string>(
    patient?.full_name ?? "",
  );
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<PatientOption[]>([]);
  const [searching, setSearching] = useState(false);

  const [services, setServices] = useState<BudgetEligibleService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [serviceId, setServiceId] = useState<string>("");
  const [tier, setTier] = useState<"A" | "B" | "C" | null>(null);

  const [orgDoctors, setOrgDoctors] = useState<OrgDoctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [doctorId, setDoctorId] = useState<string>("");

  const [asesoraId, setAsesoraId] = useState<string>("");
  const { advisors, loading: advisorsLoading } = useOrgFertilityAdvisors();

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadServices = useCallback(async () => {
    setServicesLoading(true);
    try {
      const res = await fetch("/api/services/budget-eligible", {
        cache: "no-store",
      });
      if (!res.ok) {
        setServices([]);
        return;
      }
      const data = (await res.json()) as BudgetEligibleService[];
      setServices(Array.isArray(data) ? data : []);
    } catch {
      setServices([]);
    } finally {
      setServicesLoading(false);
    }
  }, []);

  const loadDoctors = useCallback(async () => {
    setDoctorsLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("doctors")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name");
      setOrgDoctors((data as OrgDoctor[] | null) ?? []);
    } finally {
      setDoctorsLoading(false);
    }
  }, []);

  // Reset on open/close.
  useEffect(() => {
    if (open) {
      setPatientId(patient?.id ?? "");
      setSelectedPatientLabel(patient?.full_name ?? "");
      setPatientQuery("");
      setPatientResults([]);
      setServiceId("");
      setTier(null);
      setDoctorId("");
      setAsesoraId("");
      setNotes("");
      void loadServices();
      void loadDoctors();
    }
  }, [open, patient, loadServices, loadDoctors]);

  // Patient search (debounced) — only when no preselected patient.
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

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  // Reset tier when service changes.
  useEffect(() => {
    setTier(null);
  }, [serviceId]);

  const canSubmit = Boolean(
    patientId &&
      serviceId &&
      tier &&
      doctorId &&
      asesoraId &&
      !submitting,
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/budgets/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          service_id: serviceId,
          tier,
          doctor_id: doctorId,
          asesora_id: asesoraId,
          appointment_id: null,
          followup_id: null,
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(err.error ?? "No se pudo registrar el presupuesto");
        return;
      }
      toast.success("Presupuesto asignado. Pendiente de procesar.");
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-xl p-0 [&>button]:top-4 [&>button]:right-4">
        <div className="space-y-4 p-5">
          <DialogHeader>
            <div className="flex items-start gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
                <Receipt className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base font-bold">
                  Registrar presupuesto
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Elige paciente, servicio, tier, médico tratante y
                  asesora. El presupuesto queda pendiente de envío hasta
                  que la obstetra de turno lo despache.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Patient picker — hidden when preselected */}
          {patient ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Paciente
              </p>
              <p className="text-sm font-medium">{patient.full_name}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Paciente
              </label>
              {patientId && selectedPatientLabel ? (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                  <span className="truncate font-medium">
                    {selectedPatientLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPatientId("");
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
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={patientQuery}
                    onChange={(e) => setPatientQuery(e.target.value)}
                    placeholder="Buscar por nombre o apellido"
                    className="w-full rounded-lg border border-input bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
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
                              setPatientId(p.id);
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
            </div>
          )}

          {/* Service picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Servicio
            </label>
            {servicesLoading ? (
              <div className="flex h-10 items-center justify-center rounded-lg border border-input bg-background text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Cargando servicios…
              </div>
            ) : services.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                No hay servicios marcados como elegibles para
                presupuestos. Configúralos desde{" "}
                <span className="font-medium">Admin → Servicios</span>.
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

          {/* Tier picker — only when a service is selected */}
          {selectedService && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tier (paquete)
              </label>
              {selectedService.tiers.length === 0 ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-600">
                  Este servicio aún no tiene tiers configurados.
                  Configúralos desde Admin → Servicios.
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
                          !disabled &&
                            !isSelected &&
                            "border-border bg-card hover:border-emerald-500/40 hover:bg-emerald-500/5",
                          !disabled &&
                            isSelected &&
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

          {/* Doctor (manual select — standalone flow has no cita) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Médico tratante
            </label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              disabled={doctorsLoading || orgDoctors.length === 0}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60"
            >
              <option value="">Selecciona un doctor…</option>
              {orgDoctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Asesora (required) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Asesora de fertilidad
            </label>
            <select
              value={asesoraId}
              onChange={(e) => setAsesoraId(e.target.value)}
              disabled={advisorsLoading || advisors.length === 0}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60"
            >
              <option value="">Selecciona una asesora…</option>
              {advisors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name}
                </option>
              ))}
            </select>
            {!advisorsLoading && advisors.length === 0 && (
              <p className="text-[11px] text-amber-600">
                No hay asesoras configuradas. Activa el flag de asesora
                en Admin → Miembros.
              </p>
            )}
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

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
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
              Registrar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
