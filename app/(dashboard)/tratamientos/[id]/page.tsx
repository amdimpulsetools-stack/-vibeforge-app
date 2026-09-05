"use client";

/**
 * /tratamientos/[id] — ficha de un tratamiento.
 *
 * Regla de dinero (CLAUDE.md): Acordado / Pagado (clínica) / Por cobrar y
 * los totales del pie salen de `money` (fórmula única, mig 245). Los pagos
 * directos a terceros se muestran SIEMPRE aparte y con su propia etiqueta:
 * cubren lo acordado, pero no son cobro de la clínica.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ExternalLink,
  HandCoins,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { FertilityAddonGate } from "@/components/addons/fertility-addon-gate";
import { TreatmentPaymentDialog } from "@/components/treatments/treatment-payment-dialog";
import { TreatmentCloseDialog } from "@/components/treatments/treatment-close-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useOrgRole } from "@/hooks/use-org-role";
import { cn, formatCurrency } from "@/lib/utils";
import {
  REVENUE_BUCKET_LABELS,
  TREATMENT_OUTCOME_LABELS,
  TREATMENT_STATUS_LABELS,
  type TreatmentClinicPayment,
  type TreatmentDetailResponse,
  type TreatmentExternalPayment,
} from "@/types/treatments";

/** yyyy-MM-dd → "12 mar 2026" sin desfase de huso (parseISO, no new Date). */
function longDate(d: string): string {
  return format(parseISO(d), "d MMM yyyy", { locale: es });
}

type TimelineRow =
  | { kind: "clinic"; id: string; at: string; payment: TreatmentClinicPayment }
  | { kind: "external"; id: string; at: string; payment: TreatmentExternalPayment };

export default function TreatmentDetailPage() {
  return (
    <FertilityAddonGate
      loadingFallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
      fallback={
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-base font-semibold">Requiere Pack Fertilidad</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Activa el addon Pack Fertilidad para ver los tratamientos.
          </p>
        </div>
      }
    >
      <TreatmentDetail />
    </FertilityAddonGate>
  );
}

function TreatmentDetail() {
  // useParams en vez de las props `params`: en Next 15 llegan como Promise
  // y este componente es de cliente.
  const params = useParams<{ id: string }>();
  const treatmentId = params?.id ?? "";
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { isAdmin } = useOrgRole();

  const [payOpen, setPayOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);

  const { data, isPending, isError } = useQuery({
    queryKey: ["treatments", "detail", treatmentId],
    enabled: !!treatmentId,
    queryFn: async (): Promise<TreatmentDetailResponse> => {
      const res = await fetch(`/api/treatments/${treatmentId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "No se pudo cargar el tratamiento");
      }
      return (await res.json()) as TreatmentDetailResponse;
    },
  });

  // Las notas son un textarea controlado: se siembra con lo que trae la API
  // y a partir de ahí manda el borrador local hasta que se guarda.
  useEffect(() => {
    if (data) setNotesDraft(data.treatment.notes ?? "");
  }, [data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["treatments"] });
  };

  const timeline: TimelineRow[] = useMemo(() => {
    if (!data) return [];
    const rows: TimelineRow[] = [
      ...data.payments.map(
        (p): TimelineRow => ({
          kind: "clinic",
          id: p.id,
          at: p.payment_date,
          payment: p,
        }),
      ),
      ...data.external_payments.map(
        (e): TimelineRow => ({
          kind: "external",
          id: e.id,
          at: e.paid_on,
          payment: e,
        }),
      ),
    ];
    // Fecha civil desc; empate por created_at desc (los ISO comparan bien).
    return rows.sort((a, b) => {
      if (a.at !== b.at) return a.at < b.at ? 1 : -1;
      return a.payment.created_at < b.payment.created_at ? 1 : -1;
    });
  }, [data]);

  const conceptLabel = (conceptId: string | null): string => {
    if (!data || !conceptId) return "Sin concepto";
    return data.concepts.find((c) => c.id === conceptId)?.label ?? "Sin concepto";
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/treatments/${treatmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? "No se pudieron guardar las notas");
        return;
      }
      toast.success("Notas guardadas");
      refresh();
    } catch {
      toast.error("No se pudieron guardar las notas");
    } finally {
      setSavingNotes(false);
    }
  };

  const deletePayment = async (row: TimelineRow) => {
    const ok = await confirm({
      title: "¿Eliminar este pago?",
      description:
        row.kind === "clinic"
          ? "Se descuenta de lo cobrado por la clínica y del arqueo de Caja."
          : "Se descuenta de lo pagado directo a terceros.",
      variant: "destructive",
      confirmText: "Eliminar",
    });
    if (!ok) return;
    setDeletingId(row.id);
    try {
      const res = await fetch(
        `/api/treatments/${treatmentId}/payments?payment_id=${encodeURIComponent(row.id)}&kind=${row.kind}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? "No se pudo eliminar el pago");
        return;
      }
      toast.success("Pago eliminado");
      refresh();
    } catch {
      toast.error("No se pudo eliminar el pago");
    } finally {
      setDeletingId(null);
    }
  };

  const reopen = async () => {
    setReopening(true);
    try {
      const res = await fetch(`/api/treatments/${treatmentId}/reopen`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? "No se pudo reabrir el tratamiento");
        return;
      }
      toast.success("Tratamiento reabierto");
      refresh();
    } catch {
      toast.error("No se pudo reabrir el tratamiento");
    } finally {
      setReopening(false);
    }
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium">No se pudo cargar el tratamiento</p>
        </div>
      </div>
    );
  }

  const { treatment, money, sees_fees, can_close, can_reopen } = data;
  const covered = money.pending === 0 && money.expectedTotal > 0;
  const overpaid = money.paidClinic > money.expectedTotal;

  return (
    <div className="space-y-5 pb-10">
      <BackLink />

      {/* Cabecera */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold">{treatment.patient_name}</h1>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                {treatment.title}
              </span>
              <StatusBadge
                status={treatment.status}
                outcome={treatment.outcome}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {treatment.doctor_name ?? "Sin doctora asignada"}
              {treatment.assistant_name && ` · Asistente ${treatment.assistant_name}`}
              {" · "}
              Inicio {longDate(treatment.started_at)}
              {treatment.closed_at && ` · Cierre ${longDate(treatment.closed_at)}`}
            </p>
            {treatment.outcome_reason && (
              <p className="text-xs italic text-muted-foreground">
                {treatment.outcome_reason}
              </p>
            )}
            {treatment.budget_record_id && (
              <Link
                href="/scheduler/budgets"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Presupuesto
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {treatment.status === "in_progress" && (
              <button
                onClick={() => setPayOpen(true)}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:opacity-90 md:h-auto md:py-2"
              >
                <Plus className="h-4 w-4" />
                Agregar pago
              </button>
            )}
            {can_close && (
              <button
                onClick={() => setCloseOpen(true)}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent md:h-auto md:py-2"
              >
                Cerrar tratamiento
              </button>
            )}
            {can_reopen && (
              <button
                onClick={reopen}
                disabled={reopening}
                className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50 md:h-auto md:py-2"
              >
                {reopening ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Reabrir
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bloque de dinero */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-3 gap-3">
          <MoneyFigure label="Acordado" value={money.expectedTotal} />
          <MoneyFigure label="Pagado (clínica)" value={money.paidClinic} />
          <MoneyFigure
            label="Por cobrar"
            value={money.pending}
            tone={money.pending > 0 ? "amber" : "emerald"}
          />
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
            style={{ width: `${money.progressPercent}%` }}
          />
        </div>

        {money.externalCovered > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Pagado directo a terceros {formatCurrency(money.externalCovered)}{" "}
            <span className="text-muted-foreground/70">
              (no es cobro de la clínica)
            </span>
          </p>
        )}

        {sees_fees && (
          <p className="mt-1 text-xs text-muted-foreground">
            Honorarios cobrados {formatCurrency(money.honorariumPaid)} · Clínica{" "}
            {formatCurrency(money.generalPaid)} · Terceros{" "}
            {formatCurrency(money.thirdPartyPaid)}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {covered && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
              <CheckCircle2 className="h-3 w-3" />
              Acordado cubierto
            </span>
          )}
          {overpaid && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-3 w-3" />
              Pagado supera lo acordado
            </span>
          )}
        </div>
      </div>

      {/* Timeline unificado */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Movimientos</h2>
        </div>

        {timeline.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Todavía no hay pagos registrados.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {timeline.map((row) => (
              <li key={`${row.kind}-${row.id}`} className="flex gap-3 px-4 py-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    row.kind === "clinic"
                      ? "bg-emerald-500/15 text-emerald-600"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {row.kind === "clinic" ? (
                    <HandCoins className="h-4 w-4" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                </span>

                <div className="min-w-0 flex-1 space-y-0.5">
                  {row.kind === "clinic" ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {conceptLabel(row.payment.treatment_concept_id)}
                        </span>
                        {sees_fees && row.payment.revenue_bucket && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {REVENUE_BUCKET_LABELS[row.payment.revenue_bucket]}
                          </span>
                        )}
                        {row.payment.cash_shift_id && (
                          <span
                            title="Registrado en un turno de Caja"
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                          >
                            <Banknote className="h-3 w-3" />
                            Caja
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {longDate(row.payment.payment_date)}
                        {row.payment.payment_method &&
                          ` · ${row.payment.payment_method}`}
                      </p>
                      {row.payment.external_receipt_ref && (
                        <p className="text-[11px] text-muted-foreground">
                          N° comprobante externo:{" "}
                          {row.payment.external_receipt_ref}
                        </p>
                      )}
                      {row.payment.notes && (
                        <p className="text-[11px] text-muted-foreground">
                          {row.payment.notes}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {conceptLabel(row.payment.concept_id)}
                        </span>
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Directo a tercero
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {longDate(row.payment.paid_on)}
                        {row.payment.payee_name &&
                          ` · → ${row.payment.payee_name}`}
                      </p>
                      {row.payment.notes && (
                        <p className="text-[11px] text-muted-foreground">
                          {row.payment.notes}
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div className="flex shrink-0 items-start gap-2">
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      row.kind === "external" && "text-muted-foreground",
                    )}
                  >
                    {formatCurrency(Number(row.payment.amount))}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => deletePayment(row)}
                      disabled={deletingId === row.id}
                      aria-label="Eliminar pago"
                      className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      {deletingId === row.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Totales del pie: vienen de `money`, no de sumar las filas. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Wallet className="h-4 w-4" />
            Total cobrado por la clínica
          </span>
          <span className="font-semibold">
            {formatCurrency(money.paidClinic)}
          </span>
        </div>
        {money.externalCovered > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <span>Pagado directo a terceros</span>
            <span>{formatCurrency(money.externalCovered)}</span>
          </div>
        )}
      </div>

      {/* Notas */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Notas del tratamiento</h2>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          rows={3}
          placeholder="Acuerdos con la paciente, observaciones del ciclo…"
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={saveNotes}
            disabled={savingNotes || notesDraft === (treatment.notes ?? "")}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50 md:h-auto md:py-2"
          >
            {savingNotes ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar notas
          </button>
        </div>
      </div>

      <TreatmentPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        treatmentId={treatmentId}
        treatmentTitle={treatment.title}
        patientName={treatment.patient_name}
        concepts={data.concepts}
        money={money}
        onSaved={() => refresh()}
      />

      <TreatmentCloseDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        treatmentId={treatmentId}
        money={money}
        onClosed={refresh}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/tratamientos"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Tratamientos
    </Link>
  );
}

function MoneyFigure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "amber" | "emerald";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 truncate text-base font-bold md:text-lg",
          tone === "amber" && "text-amber-600",
          tone === "emerald" && "text-emerald-600",
        )}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
  outcome,
}: {
  status: TreatmentDetailResponse["treatment"]["status"];
  outcome: TreatmentDetailResponse["treatment"]["outcome"];
}) {
  const tone =
    status === "in_progress"
      ? "bg-blue-500/15 text-blue-600"
      : outcome === "pregnancy"
        ? "bg-emerald-500/15 text-emerald-600"
        : status === "abandoned"
          ? "bg-muted text-muted-foreground"
          : "bg-blue-500/15 text-blue-600";
  const label =
    status === "in_progress"
      ? TREATMENT_STATUS_LABELS.in_progress
      : outcome
        ? TREATMENT_OUTCOME_LABELS[outcome]
        : TREATMENT_STATUS_LABELS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone,
      )}
    >
      {label}
    </span>
  );
}
