"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Receipt } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { FertilityAddonGate } from "@/components/addons/fertility-addon-gate";
import { useOrgFertilityAdvisors } from "@/hooks/use-org-fertility-advisors";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface OrgDoctor {
  id: string;
  full_name: string;
}

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

interface ExistingActiveBudget {
  id: string;
  treatment_type: string;
  tier: "A" | "B" | "C" | null;
  acceptance_status: "pending_acceptance" | "accepted";
  sent_at: string | null;
  assigned_at: string | null;
  amount: number | null;
}

function formatMoney(n: number, currency: "PEN" | "USD"): string {
  const prefix = currency === "USD" ? "USD" : "S/";
  return `${prefix} ${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRelativeDays(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
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
  // Sobreprecio de honorarios (mig 174). String para permitir edición
  // libre; se parsea a número al enviar. "" / 0 = sin ajuste.
  const [honorariosAdjustment, setHonorariosAdjustment] = useState<string>("");
  const [asesoraId, setAsesoraId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Doctor (médico tratante). In flow A (modal opened with
  // `appointmentId`) we auto-fill from the cita's `doctor_id` and
  // render it read-only — the user can't pick a different one because
  // the budget is conceptually tied to that visit. In flow A' (no
  // appointmentId — opened from a followup card or the patient
  // drawer) we render a dropdown of all active org doctors.
  const [doctorId, setDoctorId] = useState<string>("");
  const [doctorName, setDoctorName] = useState<string | null>(null);
  // Set when the linked appointment has NO doctor — we block the
  // submit and surface a friendly error so the user goes to the cita
  // and assigns one first.
  const [appointmentDoctorMissing, setAppointmentDoctorMissing] =
    useState(false);
  // List for the dropdown — only populated when there's no appointment.
  const [orgDoctors, setOrgDoctors] = useState<OrgDoctor[]>([]);
  const [doctorLoading, setDoctorLoading] = useState(false);

  // ── Existing active budgets for this patient ───────────────────
  // Loaded on open and used to (a) render a warning banner and (b)
  // require the user to tick "Confirmo que es adicional" before
  // submitting. The backend enforces the same rule via a 409 on
  // /api/budgets/assign — this is the UX layer of that contract.
  const [existingBudgets, setExistingBudgets] = useState<
    ExistingActiveBudget[]
  >([]);
  const [existingLoading, setExistingLoading] = useState(false);
  const [acknowledgedExisting, setAcknowledgedExisting] = useState(false);
  const hasExisting = existingBudgets.length > 0;

  const { advisors, loading: advisorsLoading } = useOrgFertilityAdvisors();

  const loadExistingBudgets = useCallback(async () => {
    if (!patientId) return;
    setExistingLoading(true);
    try {
      const res = await fetch(
        `/api/budgets?limit=20&patient_id=${encodeURIComponent(patientId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setExistingBudgets([]);
        return;
      }
      const data = (await res.json()) as {
        items?: ExistingActiveBudget[];
      };
      const items = Array.isArray(data.items) ? data.items : [];
      const active = items.filter(
        (b) =>
          b.acceptance_status === "pending_acceptance" ||
          b.acceptance_status === "accepted",
      );
      setExistingBudgets(active);
    } catch {
      setExistingBudgets([]);
    } finally {
      setExistingLoading(false);
    }
  }, [patientId]);

  // Doctor loader: pre-fill from the cita's doctor when appointmentId
  // is set, otherwise fetch the list of org doctors for the dropdown.
  // Both branches use the supabase client directly (doctors + appts
  // have org-scoped RLS, so the user can only ever see their org).
  const loadDoctorContext = useCallback(async () => {
    setDoctorLoading(true);
    setAppointmentDoctorMissing(false);
    try {
      const supabase = createClient();
      if (appointmentId) {
        const { data: appt } = await supabase
          .from("appointments")
          .select("doctor_id, doctor:doctors(id, full_name)")
          .eq("id", appointmentId)
          .maybeSingle();
        // PostgREST embeds the related row as a single object for
        // many-to-one FKs at runtime, but its generated types model
        // it as an array. Normalize to a scalar.
        const rawDoc = appt?.doctor as unknown;
        const doc = (Array.isArray(rawDoc) ? rawDoc[0] : rawDoc) as
          | { id: string; full_name: string }
          | null
          | undefined;
        if (!appt?.doctor_id || !doc) {
          // Empty doctor on the cita — make it clear in the UI and
          // disable submit. The user has to assign a doctor to the
          // cita first.
          setAppointmentDoctorMissing(true);
          setDoctorId("");
          setDoctorName(null);
          setOrgDoctors([]);
          return;
        }
        setDoctorId(doc.id);
        setDoctorName(doc.full_name);
        setOrgDoctors([]);
      } else {
        const { data } = await supabase
          .from("doctors")
          .select("id, full_name")
          .eq("is_active", true)
          .order("full_name");
        setOrgDoctors((data as OrgDoctor[] | null) ?? []);
        setDoctorId("");
        setDoctorName(null);
      }
    } finally {
      setDoctorLoading(false);
    }
  }, [appointmentId]);

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
      setHonorariosAdjustment("");
      setAsesoraId("");
      setNotes("");
      setAcknowledgedExisting(false);
      setExistingBudgets([]);
      setDoctorId("");
      setDoctorName(null);
      setOrgDoctors([]);
      setAppointmentDoctorMissing(false);
      void loadServices();
      void loadExistingBudgets();
      void loadDoctorContext();
    }
  }, [open, loadServices, loadExistingBudgets, loadDoctorContext]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  // Currently-selected tier row (for base amount + currency of the
  // live total preview). Null until a tier is picked.
  const selectedTier = useMemo(
    () =>
      selectedService && tier
        ? selectedService.tiers.find((t) => t.tier === tier) ?? null
        : null,
    [selectedService, tier],
  );

  // Parsed, non-negative, cents-rounded honorarios surcharge. 0 when
  // the field is empty or invalid.
  const adjustmentValue = useMemo(() => {
    const n = Number.parseFloat(honorariosAdjustment);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }, [honorariosAdjustment]);

  // When the picked service changes, reset the tier (the new service
  // may not even have a tier with the previously-selected letter) and
  // any honorarios surcharge tied to the previous selection.
  useEffect(() => {
    setTier(null);
    setHonorariosAdjustment("");
  }, [serviceId]);

  // El ajuste solo aplica al Tier A (decisión founder: es un
  // sobreprecio sobre el paquete MÁS ALTO; "subir un poco" desde C
  // no tiene sentido existiendo B). Al bajar de tier se descarta
  // cualquier monto ya tecleado para que no viaje oculto al submit.
  useEffect(() => {
    if (tier !== "A") setHonorariosAdjustment("");
  }, [tier]);

  const canSubmit = Boolean(
    serviceId &&
      tier &&
      doctorId &&
      asesoraId &&
      !submitting &&
      !appointmentDoctorMissing &&
      (!hasExisting || acknowledgedExisting),
  );

  const handleSubmit = async () => {
    if (!serviceId || !tier || !doctorId || !asesoraId) return;
    if (appointmentDoctorMissing) return;
    if (hasExisting && !acknowledgedExisting) return;
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
          appointment_id: appointmentId ?? null,
          followup_id: followupId ?? null,
          honorarios_adjustment: adjustmentValue > 0 ? adjustmentValue : undefined,
          notes: notes.trim() ? notes.trim() : undefined,
          acknowledged_existing: hasExisting ? acknowledgedExisting : undefined,
        }),
      });
      if (res.status === 409) {
        // Backend caught an active budget we didn't know about
        // (race condition: another user assigned one while this
        // modal was open). Re-fetch + force acknowledgment.
        const err = (await res.json().catch(() => ({}))) as {
          existing?: ExistingActiveBudget[];
          message?: string;
        };
        if (Array.isArray(err.existing)) {
          setExistingBudgets(err.existing);
        } else {
          await loadExistingBudgets();
        }
        setAcknowledgedExisting(false);
        toast.error(
          err.message ??
            "La paciente tiene presupuestos activos. Confirma para continuar.",
        );
        return;
      }
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
      {/* Ancho > alto (pedido founder): 3xl con campos a dos columnas en
          desktop; tope de altura con scroll interno para que el modal
          nunca toque los bordes de la pantalla. */}
      <DialogContent className="w-full max-w-3xl p-0 [&>button]:top-4 [&>button]:right-4">
        <div className="max-h-[85vh] space-y-4 overflow-y-auto p-5">
          <div className="flex items-start gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
              <Receipt className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-bold">
                Asignar presupuesto
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Elige el servicio, el tier (paquete), el médico
                tratante y la asesora. La obstetra de turno enviará el
                presupuesto a la paciente después.
              </DialogDescription>
            </div>
          </div>

          {/* Existing-budgets warning ─ shown when this patient already
              has an active budget. Forces an explicit acknowledgment
              before submit. */}
          {existingLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Verificando presupuestos previos…
            </div>
          ) : hasExisting ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.08] p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                      Esta paciente ya tiene{" "}
                      {existingBudgets.length === 1
                        ? "un presupuesto activo"
                        : `${existingBudgets.length} presupuestos activos`}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Revisa antes de crear uno adicional para evitar
                      duplicados.
                    </p>
                  </div>
                  <ul className="space-y-1">
                    {existingBudgets.map((b) => (
                      <li
                        key={b.id}
                        className="rounded-md border border-amber-500/30 bg-background/60 px-2 py-1.5 text-[11px]"
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-semibold">
                            {b.treatment_type}
                            {b.tier ? ` · Tier ${b.tier}` : ""}
                          </span>
                          <span className="text-muted-foreground">
                            {b.acceptance_status === "accepted"
                              ? "Aceptado"
                              : b.sent_at
                              ? "Esperando respuesta"
                              : "Sin procesar"}
                          </span>
                          <span className="text-muted-foreground">
                            · asignado {formatRelativeDays(b.assigned_at)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <label className="flex cursor-pointer items-start gap-2 pt-1 text-xs">
                    <input
                      type="checkbox"
                      checked={acknowledgedExisting}
                      onChange={(e) =>
                        setAcknowledgedExisting(e.target.checked)
                      }
                      className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-amber-600"
                    />
                    <span className="text-amber-700 dark:text-amber-400">
                      Confirmo que este es un presupuesto{" "}
                      <strong>adicional</strong>, no un duplicado.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}

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

          {/* Ajuste de honorarios (opcional). Solo visible con el TIER A
              elegido (sobreprecio sobre el paquete más alto; el server
              rechaza ajuste con B/C). Sobreprecio ≥ 0 que se integra en
              el total. En plantillas que itemizan honorarios se reparte
              proporcionalmente entre las líneas de honorarios del
              tratamiento en múltiplos de S/ 10 (honorarios-fold.ts), de
              ahí la sugerencia de usar múltiplos de 10. */}
          {selectedTier && tier === "A" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ajuste de honorarios (opcional)
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {selectedTier.currency === "USD" ? "USD" : "S/"}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={honorariosAdjustment}
                  onChange={(e) => {
                    // Solo dígitos y un punto decimal; sin negativos.
                    const cleaned = e.target.value
                      .replace(/[^0-9.]/g, "")
                      .replace(/(\..*)\./g, "$1");
                    setHonorariosAdjustment(cleaned);
                  }}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-input bg-background py-2 pl-11 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Sobreprecio sobre los honorarios del tier para casos
                particulares. Se suma al total y se reparte entre las
                líneas de honorarios del tratamiento; la paciente no ve
                una línea de “ajuste”. Usa múltiplos de 10 para que los
                montos queden redondos.
              </p>
              {adjustmentValue > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-xs">
                  <span className="text-muted-foreground">
                    Tier {tier} {formatMoney(selectedTier.amount, selectedTier.currency)}
                    {" + "}ajuste {formatMoney(adjustmentValue, selectedTier.currency)}
                  </span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    Total{" "}
                    {formatMoney(
                      selectedTier.amount + adjustmentValue,
                      selectedTier.currency,
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Doctor + asesora lado a lado en desktop para acortar el
              modal; apilados en móvil. */}
          <div className="grid gap-4 sm:grid-cols-2">
          {/* Doctor (médico tratante). Read-only when sourced from a
              cita, dropdown otherwise. Both required — a budget needs
              a treating doctor to render the PDF properly. */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Médico tratante
            </label>
            {doctorLoading ? (
              <div className="flex h-10 items-center justify-center rounded-lg border border-input bg-background text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Cargando…
              </div>
            ) : appointmentId ? (
              appointmentDoctorMissing ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.08] p-3 text-xs text-amber-700 dark:text-amber-400">
                  Esta cita no tiene doctor asignado. Asígnale un doctor
                  desde la ficha de la cita antes de generar el
                  presupuesto.
                </div>
              ) : (
                <div className="rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm">
                  {doctorName ?? "—"}
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    desde la cita
                  </span>
                </div>
              )
            ) : (
              <select
                value={doctorId}
                onChange={(e) => {
                  const id = e.target.value;
                  setDoctorId(id);
                  setDoctorName(
                    orgDoctors.find((d) => d.id === id)?.full_name ?? null,
                  );
                }}
                disabled={orgDoctors.length === 0}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-60"
              >
                <option value="">Selecciona un doctor…</option>
                {orgDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Asesora dropdown — required. Filters to org members
              flagged is_fertility_advisor (mig 137). */}
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
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notas internas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
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
