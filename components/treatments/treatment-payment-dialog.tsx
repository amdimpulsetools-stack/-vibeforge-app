"use client";

/**
 * Diálogo único para registrar un cobro de TRATAMIENTO.
 *
 * Reutilizable: lo usan la lista (/tratamientos), el detalle
 * (/tratamientos/[id]) y el drawer de presupuestos. Por eso no pide datos
 * a la API por su cuenta más allá de los métodos de pago: recibe
 * `concepts` y `money` ya resueltos por quien lo abre.
 *
 * Regla de dinero (CLAUDE.md): el único cálculo que hace este componente es
 * "por cobrar después de este pago" = max(0, money.pending − monto). Todo lo
 * demás viene del `money` que devuelve la API.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { HandCoins, Info, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useOrgToday } from "@/hooks/use-org-today";
import { cn, formatCurrency } from "@/lib/utils";
import type { TreatmentMoney } from "@/lib/treatments/money";
import type {
  TreatmentPaymentConcept,
  TreatmentPaymentInput,
} from "@/types/treatments";

export interface TreatmentPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treatmentId: string;
  /** Tipo de tratamiento — se muestra como contexto en la cabecera. */
  treatmentTitle: string;
  patientName: string;
  /** Conceptos del catálogo de la org (mig 242). Se filtra por is_active. */
  concepts: TreatmentPaymentConcept[];
  /** Dinero actual del tratamiento, tal cual lo devolvió la API. */
  money: TreatmentMoney;
  /** Recibe el `money` recalculado por el servidor tras guardar. */
  onSaved: (money: TreatmentMoney) => void;
}

type PaymentKind = "clinic" | "external";

interface PaymentMethodOption {
  id: string;
  label: string;
}

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

export function TreatmentPaymentDialog({
  open,
  onOpenChange,
  treatmentId,
  treatmentTitle,
  patientName,
  concepts,
  money,
  onSaved,
}: TreatmentPaymentDialogProps) {
  const { organizationId } = useOrganization();
  // "Hoy" civil de la org (mig 240): con new Date() un cobro de las 19:30
  // en Lima se estampaba con la fecha de mañana.
  const { today: orgToday } = useOrgToday();

  const [kind, setKind] = useState<PaymentKind>("clinic");
  const [conceptId, setConceptId] = useState("");
  const [otherDetail, setOtherDetail] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => orgToday());
  const [method, setMethod] = useState("");
  const [externalRef, setExternalRef] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const activeConcepts = useMemo(
    () =>
      concepts
        .filter((c) => c.is_active)
        .slice()
        .sort((a, b) => a.display_order - b.display_order),
    [concepts],
  );

  // Catálogo de métodos de pago de la org (lookup_values slug
  // 'payment_method'); el staff guarda el LABEL, igual que en la agenda.
  const { data: methodsData } = useQuery({
    queryKey: ["lookup-values", "payment_method", organizationId],
    enabled: open && !!organizationId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PaymentMethodOption[]> => {
      const { data } = await createClient()
        .from("lookup_values")
        .select("id, label, lookup_categories!inner(slug)")
        .eq("lookup_categories.slug", "payment_method")
        .eq("is_active", true)
        .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
        .order("display_order");
      return ((data ?? []) as { id: string; label: string }[]).map((v) => ({
        id: v.id,
        label: v.label,
      }));
    },
  });
  const paymentMethods = useMemo(() => methodsData ?? [], [methodsData]);

  // Reset al abrir: el diálogo se monta una vez por pantalla y se reusa,
  // así que sin esto el segundo cobro arrancaba con el monto del primero.
  useEffect(() => {
    if (!open) return;
    setKind("clinic");
    setConceptId("");
    setOtherDetail("");
    setAmount("");
    setDate(orgToday());
    setMethod("");
    setExternalRef("");
    setPayeeName("");
    setNotes("");
    setSaving(false);
    // orgToday cambia solo si cambia la zona de la org.
  }, [open, orgToday]);

  const amountNumber = Number(amount);
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0;
  // ÚNICO cálculo de dinero permitido en cliente.
  const pendingAfter = Math.max(0, money.pending - (amountValid ? amountNumber : 0));

  const selectedConcept = activeConcepts.find((c) => c.id === conceptId) ?? null;
  const isOtherConcept = selectedConcept?.key === "otro";

  const canSubmit =
    amountValid &&
    !saving &&
    (kind === "external" || (conceptId !== "" && method !== ""));

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);

    // El detalle del concepto "Otro" no tiene columna propia: viaja en las
    // notas, que es donde el staff lo busca después.
    const composedNotes =
      isOtherConcept && otherDetail.trim()
        ? [otherDetail.trim(), notes.trim()].filter(Boolean).join(" — ")
        : notes.trim();

    const body: TreatmentPaymentInput =
      kind === "clinic"
        ? {
            kind: "clinic",
            amount: amountNumber,
            concept_id: conceptId,
            payment_method: method,
            payment_date: date,
            ...(composedNotes ? { notes: composedNotes } : {}),
            ...(externalRef.trim()
              ? { external_receipt_ref: externalRef.trim() }
              : {}),
          }
        : {
            kind: "external",
            amount: amountNumber,
            concept_id: conceptId || null,
            paid_on: date,
            ...(payeeName.trim() ? { payee_name: payeeName.trim() } : {}),
            ...(composedNotes ? { notes: composedNotes } : {}),
          };

    try {
      const res = await fetch(`/api/treatments/${treatmentId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        money?: TreatmentMoney;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? "No se pudo registrar el pago");
        setSaving(false);
        return;
      }
      toast.success(
        kind === "clinic"
          ? "Pago registrado"
          : "Pago directo a tercero registrado",
      );
      if (json.money) onSaved(json.money);
      onOpenChange(false);
    } catch {
      toast.error("No se pudo registrar el pago");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-emerald-500" />
            Registrar pago
          </DialogTitle>
          <DialogDescription>
            {patientName} · {treatmentTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Primer control a propósito: de él depende si el monto entra a
              Ingresos/Caja o es solo información de cobertura. */}
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              ¿Quién recibió el dinero?
            </legend>
            <label
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm",
                kind === "clinic"
                  ? "border-primary/50 bg-primary/5"
                  : "border-border hover:bg-accent/50",
              )}
            >
              <input
                type="radio"
                name="treatment-payment-kind"
                className="mt-0.5"
                checked={kind === "clinic"}
                onChange={() => setKind("clinic")}
              />
              <span>
                <span className="font-medium">La clínica</span>
                <span className="block text-xs text-muted-foreground">
                  Entra a Ingresos, Caja y comprobantes.
                </span>
              </span>
            </label>
            <label
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm",
                kind === "external"
                  ? "border-primary/50 bg-primary/5"
                  : "border-border hover:bg-accent/50",
              )}
            >
              <input
                type="radio"
                name="treatment-payment-kind"
                className="mt-0.5"
                checked={kind === "external"}
                onChange={() => setKind("external")}
              />
              <span>
                <span className="font-medium">
                  Pagado directamente a un tercero
                </span>
                <span className="block text-xs text-muted-foreground">
                  Laboratorio, anestesiólogo, banco de gametos…
                </span>
              </span>
            </label>
          </fieldset>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Concepto{kind === "external" && " (opcional)"}
            </label>
            <select
              value={conceptId}
              onChange={(e) => setConceptId(e.target.value)}
              className={inputClass}
            >
              <option value="">
                {kind === "external" ? "Sin concepto" : "Selecciona un concepto"}
              </option>
              {activeConcepts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {isOtherConcept && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                ¿De qué se trata?
              </label>
              <input
                value={otherDetail}
                onChange={(e) => setOtherDetail(e.target.value)}
                placeholder="Detalle del concepto"
                className={inputClass}
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Monto (S/)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Fecha
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {kind === "clinic" ? (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Método de pago
                </label>
                {paymentMethods.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {paymentMethods.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMethod(m.label)}
                        className={cn(
                          "min-h-11 rounded-lg border px-3 text-sm transition-colors",
                          method === m.label
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : "border-border hover:bg-accent",
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No hay métodos de pago configurados en Ajustes → Listas.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  N° comprobante externo (opcional)
                </label>
                <input
                  value={externalRef}
                  onChange={(e) => setExternalRef(e.target.value)}
                  placeholder="B001-00001234"
                  className={inputClass}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  ¿A quién le pagó?
                </label>
                <input
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  placeholder="Laboratorio, anestesiólogo…"
                  className={inputClass}
                />
              </div>
              <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                No es un cobro de la clínica: no entra a Ingresos, Caja ni
                comprobantes. Solo cubre parte de lo acordado.
              </p>
            </>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={cn(inputClass, "resize-none")}
            />
          </div>

          <div className="rounded-lg border border-border bg-card p-3 text-sm">
            <span className="text-muted-foreground">
              Por cobrar después de este pago:
            </span>{" "}
            <span className="font-semibold">{formatCurrency(pendingAfter)}</span>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-lg border border-border px-4 text-sm hover:bg-accent md:h-auto md:py-2"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 md:h-auto md:py-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar pago
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
