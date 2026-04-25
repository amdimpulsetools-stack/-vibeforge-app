"use client";

// Dialog to emit an electronic invoice (boleta or factura) for a given
// appointment. Pre-fills patient + service + price from the appointment.
//
// User can:
//   - Toggle factura vs boleta (auto-suggested based on customer doc type)
//   - Pick a series (defaults to active default per doc_type)
//   - Edit customer fiscal data inline
//   - Edit/add/remove items (default = single item from the appointment service)
//   - See live totals
//   - Emit
//
// On success: shows the result (number, PDF link), notifies parent.

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Receipt,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Mail,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import {
  mapPaymentMethodToSunat,
  violatesBancarizacion,
  BANCARIZACION_THRESHOLD_PEN,
  BANCARIZACION_THRESHOLD_USD,
} from "@/lib/einvoice";
import type {
  EInvoiceConfigData,
  EInvoiceSeries,
} from "@/hooks/use-einvoice-config";

interface AppointmentForEmit {
  id: string;
  patient_id: string | null;
  patient_name: string;
  patient_phone: string | null;
  service_id: string;
  service_name: string;
  price_snapshot: number | null;
  appointment_date: string;
  start_time: string;
  einvoice_id?: string | null;
  /**
   * Total amount the patient owes for this appointment after discounts.
   * Used to detect partial payments and offer the "billing mode" radio.
   * Falls back to price_snapshot if not provided.
   */
  total_price?: number | null;
  /**
   * Sum of payments registered against this appointment so far.
   * If `amount_paid > 0 && amount_paid < total_price`, the dialog
   * pre-selects "billing mode = paid" and rescales item prices
   * proportionally to that amount (so the boleta reflects exactly
   * what the patient has paid — see TICKET in COMING-UPDATES).
   */
  amount_paid?: number | null;
  /**
   * Free-text label of the most recent payment_method registered for
   * this appointment (e.g. "Yape", "Visa", "Efectivo"). Pre-fills the
   * SUNAT 59 mapping in the modal and powers the Bancarización warning.
   * Falls back to the latest patient_payments row server-side if absent.
   */
  last_payment_method?: string | null;
}

interface PatientFiscal {
  fiscal_doc_type: string | null;
  fiscal_doc_number: string | null;
  legal_name: string | null;
  fiscal_address: string | null;
  fiscal_email: string | null;
  email: string | null;
  dni: string | null;
}

interface ServiceFiscal {
  igv_affectation: number | null;
  unit_of_measure: string | null;
  sunat_product_code: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentForEmit;
  config: EInvoiceConfigData;
  series: EInvoiceSeries[];
  /** Called after a successful emit. */
  onEmitted: (info: {
    invoiceId: string;
    docType: number;
    series: string;
    number: number;
    pdfUrl?: string;
  }) => void;
}

interface EditableItem {
  description: string;
  quantity: number;
  /**
   * Unit price WITH IGV included — what the patient actually pays per unit.
   * For Peruvian clinics this is the catalog price (services.base_price).
   * Internal calculations split this into subtotal (without IGV) + IGV
   * before sending to Nubefact, since SUNAT requires the breakdown.
   */
  unit_price: number;
  igv_affectation: number;
  service_id: string | null;
  unit_of_measure: string;
  sunat_product_code?: string;
}

const IGV_OPTIONS = [
  { value: 1, label: "Gravado" },
  { value: 8, label: "Exonerado" },
  { value: 9, label: "Inafecto" },
];

const DOC_TYPE_OPTIONS = [
  { value: "1", label: "DNI" },
  { value: "6", label: "RUC" },
  { value: "4", label: "CE" },
  { value: "7", label: "Pasaporte" },
  { value: "-", label: "Varios (consumidor final)" },
];

export function EInvoiceEmitDialog({
  open,
  onOpenChange,
  appointment,
  config,
  series,
  onEmitted,
}: Props) {
  // Customer fiscal data (loaded from patient row when dialog opens)
  const [customerDocType, setCustomerDocType] = useState("1");
  const [customerDocNumber, setCustomerDocNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [loadingPatient, setLoadingPatient] = useState(false);

  // Doc type for the invoice (1=factura, 2=boleta) — auto-suggested
  const [docType, setDocType] = useState<1 | 2>(2);
  const [selectedSeries, setSelectedSeries] = useState("");

  // Items
  const [items, setItems] = useState<EditableItem[]>([]);
  // Snapshot of the items as loaded from the appointment — used as the
  // baseline when toggling billingMode between "total" and "paid".
  const [originalItems, setOriginalItems] = useState<EditableItem[]>([]);

  // Billing mode: emit for the total of the appointment, or only for the
  // amount actually paid so far (partial payment / advance).
  const [billingMode, setBillingMode] = useState<"total" | "paid">("total");

  // Discount + observations
  const [discount, setDiscount] = useState(0);
  const [observations, setObservations] = useState("");
  const [sendEmail, setSendEmail] = useState(config.auto_send_email);

  // Payment method (free-text label from `lookup_values`). Pre-filled
  // from the latest patient_payments row of the appointment. Mapped to
  // SUNAT Catálogo 59 for the comprobante.
  const [paymentMethodLabel, setPaymentMethodLabel] = useState<string>("");

  // Submission
  const [emitting, setEmitting] = useState(false);
  const [result, setResult] = useState<
    | null
    | {
        ok: true;
        invoiceId: string;
        docType: number;
        series: string;
        number: number;
        pdfUrl?: string;
        sunatAccepted?: boolean;
      }
    | { ok: false; error: string; retryable: boolean }
  >(null);

  // Auto-suggest doc type based on customer doc
  useEffect(() => {
    setDocType(customerDocType === "6" ? 1 : 2);
  }, [customerDocType]);

  // Pick the default series for the chosen doc type
  useEffect(() => {
    const candidates = series.filter(
      (s) => s.doc_type === docType && s.is_active
    );
    if (candidates.length === 0) {
      setSelectedSeries("");
      return;
    }
    const def = candidates.find((s) => s.is_default) ?? candidates[0];
    setSelectedSeries(def.series);
  }, [docType, series]);

  // Apply / revert the proportional rescale when billingMode toggles.
  // We rescale from the baseline (originalItems) on every transition so
  // toggling paid → total → paid doesn't accumulate the suffix or drift.
  // Note: this fires only when billingMode/originalItems/amount_paid change,
  // NOT on each item edit, so manual price edits made AFTER selecting a
  // mode are preserved.
  useEffect(() => {
    if (originalItems.length === 0) return;
    if (billingMode === "total") {
      setItems(originalItems);
      return;
    }
    const amountPaid = appointment.amount_paid ?? 0;
    const sumBaseline = originalItems.reduce(
      (sum, it) => sum + it.quantity * it.unit_price,
      0
    );
    if (sumBaseline <= 0 || amountPaid <= 0) {
      setItems(originalItems);
      return;
    }
    const factor = amountPaid / sumBaseline;
    const PARTIAL_TAG = " (pago parcial)";
    setItems(
      originalItems.map((it) => ({
        ...it,
        unit_price: round2(it.unit_price * factor),
        description: it.description.endsWith(PARTIAL_TAG)
          ? it.description
          : `${it.description}${PARTIAL_TAG}`,
      }))
    );
  }, [billingMode, originalItems, appointment.amount_paid]);

  // Load patient + service fiscal data when dialog opens
  useEffect(() => {
    if (!open) return;
    setResult(null);
    setLoadingPatient(true);

    const fetchAll = async () => {
      const supabase = createClient();
      let patientFiscal: PatientFiscal | null = null;
      let serviceFiscal: ServiceFiscal | null = null;

      if (appointment.patient_id) {
        const { data } = await supabase
          .from("patients")
          .select(
            "fiscal_doc_type, fiscal_doc_number, legal_name, fiscal_address, fiscal_email, email, dni"
          )
          .eq("id", appointment.patient_id)
          .maybeSingle();
        patientFiscal = (data as unknown as PatientFiscal) ?? null;
      }

      const { data: svcData } = await supabase
        .from("services")
        .select("igv_affectation, unit_of_measure, sunat_product_code")
        .eq("id", appointment.service_id)
        .maybeSingle();
      serviceFiscal = (svcData as unknown as ServiceFiscal) ?? null;

      // Customer
      if (patientFiscal) {
        setCustomerDocType(patientFiscal.fiscal_doc_type ?? "1");
        setCustomerDocNumber(
          patientFiscal.fiscal_doc_number ?? patientFiscal.dni ?? ""
        );
        setCustomerName(
          patientFiscal.legal_name ?? appointment.patient_name ?? ""
        );
        setCustomerAddress(patientFiscal.fiscal_address ?? "");
        setCustomerEmail(
          patientFiscal.fiscal_email ?? patientFiscal.email ?? ""
        );
      } else {
        // Boleta a consumidor final por default
        setCustomerDocType("1");
        setCustomerDocNumber("");
        setCustomerName(appointment.patient_name ?? "");
        setCustomerAddress("");
        setCustomerEmail("");
      }

      // Default item from appointment service. price_snapshot is treated
      // as the FINAL price (with IGV included) — clinic catalog convention.
      const price = appointment.price_snapshot ?? 0;
      const baseline: EditableItem[] = [
        {
          description: appointment.service_name ?? "Servicio",
          quantity: 1,
          unit_price: price,
          igv_affectation: serviceFiscal?.igv_affectation ?? 1,
          service_id: appointment.service_id,
          unit_of_measure: serviceFiscal?.unit_of_measure ?? "ZZ",
          sunat_product_code: serviceFiscal?.sunat_product_code ?? undefined,
        },
      ];
      setOriginalItems(baseline);
      setItems(baseline);

      // Pre-select billingMode based on the appointment's payment state.
      // Partial = paid > 0 AND paid < total. The toggle effect below will
      // rescale the items down to amount_paid when "paid" is active.
      const totalPrice = appointment.total_price ?? price;
      const amountPaid = appointment.amount_paid ?? 0;
      const isPartial = amountPaid > 0 && amountPaid < totalPrice;
      setBillingMode(isPartial ? "paid" : "total");

      setDiscount(0);
      setObservations("");
      setSendEmail(config.auto_send_email);
      setPaymentMethodLabel(appointment.last_payment_method ?? "");
      setLoadingPatient(false);
    };

    void fetchAll();
  }, [open, appointment, config]);

  // ── Live totals ────────────────────────────────────────────────────────
  // The user enters `unit_price` WITH IGV included (the price the patient
  // actually pays). We back out the SUNAT-required breakdown:
  //   - For taxed items: subtotal = unit_price / (1 + IGV%)
  //                      igv = unit_price - subtotal
  //   - For exempt/unaffected: subtotal = unit_price; igv = 0
  // The total stays equal to sum(quantity * unit_price) − discount, which
  // is the figure the patient sees and pays.
  const totals = useMemo(() => {
    const igvFactor = Number(config.default_igv_percent) / 100;
    let subtotalTaxed = 0;
    let subtotalExempt = 0;
    let subtotalUnaffected = 0;
    let igvAmount = 0;
    let total = 0;
    for (const it of items) {
      const isTaxed = it.igv_affectation === 1;
      // Per-unit breakdown
      const unitSubtotal = isTaxed
        ? round2(it.unit_price / (1 + igvFactor))
        : round2(it.unit_price);
      const unitIgv = isTaxed ? round2(it.unit_price - unitSubtotal) : 0;
      // Line totals
      const lineSubtotal = round2(unitSubtotal * it.quantity);
      const lineIgv = round2(unitIgv * it.quantity);
      const lineTotal = round2(lineSubtotal + lineIgv);
      if (isTaxed) subtotalTaxed += lineSubtotal;
      else if (it.igv_affectation === 8) subtotalExempt += lineSubtotal;
      else if (it.igv_affectation === 9 || it.igv_affectation === 12)
        subtotalUnaffected += lineSubtotal;
      igvAmount += lineIgv;
      total += lineTotal;
    }
    return {
      subtotalTaxed: round2(subtotalTaxed),
      subtotalExempt: round2(subtotalExempt),
      subtotalUnaffected: round2(subtotalUnaffected),
      igvAmount: round2(igvAmount),
      total: round2(Math.max(total - discount, 0)),
    };
  }, [items, discount, config.default_igv_percent]);

  // ── SUNAT payment method + Bancarización warning ──────────────────────
  // We auto-map the free-text label to SUNAT Catálogo 59 just for the UI
  // preview and the Ley 28194 check. The same mapping happens server-side
  // (it's the source of truth) — this is informational only.
  const sunatPayment = useMemo(
    () => mapPaymentMethodToSunat(paymentMethodLabel),
    [paymentMethodLabel]
  );
  const bancarizacionWarning = useMemo(() => {
    return violatesBancarizacion(
      totals.total,
      config.default_currency,
      sunatPayment
    );
  }, [totals.total, config.default_currency, sunatPayment]);
  const bancarizacionThreshold =
    config.default_currency === "USD"
      ? BANCARIZACION_THRESHOLD_USD
      : BANCARIZACION_THRESHOLD_PEN;

  // ── Validation ─────────────────────────────────────────────────────────
  const customerValid = (() => {
    if (!customerName.trim()) return false;
    if (customerDocType === "-") return true;
    if (customerDocType === "1") return /^\d{8}$/.test(customerDocNumber);
    if (customerDocType === "6") {
      return (
        /^\d{11}$/.test(customerDocNumber) &&
        customerName.trim().length > 0 &&
        customerAddress.trim().length > 0
      );
    }
    return customerDocNumber.trim().length > 0;
  })();
  const itemsValid =
    items.length > 0 &&
    items.every(
      (it) =>
        it.description.trim().length > 0 &&
        it.quantity > 0 &&
        it.unit_price >= 0
    );
  const seriesValid = selectedSeries.length === 4;

  const formValid = customerValid && itemsValid && seriesValid;

  // ── Item ops ───────────────────────────────────────────────────────────
  const addItem = () =>
    setItems((prev) => [
      ...prev,
      {
        description: "",
        quantity: 1,
        unit_price: 0,
        igv_affectation: 1,
        service_id: null,
        unit_of_measure: "ZZ",
      },
    ]);
  const removeItem = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = <K extends keyof EditableItem>(
    i: number,
    key: K,
    value: EditableItem[K]
  ) =>
    setItems((prev) =>
      prev.map((it, idx) => (idx === i ? { ...it, [key]: value } : it))
    );

  // ── Emit ───────────────────────────────────────────────────────────────
  const handleEmit = async () => {
    setEmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/einvoices/emit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: appointment.id,
          doc_type: docType,
          series: selectedSeries,
          customer_doc_type: customerDocType,
          customer_doc_number: customerDocNumber,
          customer_name: customerName.trim(),
          customer_address: customerAddress.trim() || null,
          customer_email: customerEmail.trim() || null,
          currency: config.default_currency,
          igv_percent: Number(config.default_igv_percent),
          invoice_discount: discount,
          observations: observations.trim() || null,
          send_to_customer_email: sendEmail,
          payment_method_label: paymentMethodLabel.trim() || null,
          // Send unit_price (with IGV) — the route does the breakdown.
          items: items.map((it) => ({
            service_id: it.service_id,
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            igv_affectation: it.igv_affectation,
            unit_of_measure: it.unit_of_measure,
            sunat_product_code: it.sunat_product_code,
          })),
        }),
      });
      const json = (await res.json()) as
        | {
            ok: true;
            invoice_id: string;
            doc_type: number;
            series: string;
            number: number;
            pdf_url?: string;
            sunat_accepted?: boolean;
          }
        | { ok: false; error: string; retryable: boolean; invoice_id?: string };

      if (json.ok) {
        setResult({
          ok: true,
          invoiceId: json.invoice_id,
          docType: json.doc_type,
          series: json.series,
          number: json.number,
          pdfUrl: json.pdf_url,
          sunatAccepted: json.sunat_accepted,
        });
        onEmitted({
          invoiceId: json.invoice_id,
          docType: json.doc_type,
          series: json.series,
          number: json.number,
          pdfUrl: json.pdf_url,
        });
      } else {
        setResult({ ok: false, error: json.error, retryable: json.retryable });
      }
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Error de red",
        retryable: true,
      });
    } finally {
      setEmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const isFactura = docType === 1;
  const seriesForType = series.filter((s) => s.doc_type === docType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl max-h-[92vh] overflow-hidden p-0 gap-0 flex flex-col [&>button]:hidden">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {result?.ok ? "Comprobante emitido" : "Emitir comprobante"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {result?.ok
                  ? `${isFactura ? "Factura" : "Boleta"} ${result.series}-${result.number}`
                  : "Revisa los datos y emite. Una vez emitido, no se puede editar."}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {result?.ok ? (
            <SuccessPanel
              result={result}
              sandbox={config.mode === "sandbox"}
              sentToEmail={
                sendEmail && customerEmail.trim()
                  ? customerEmail.trim()
                  : null
              }
            />
          ) : (
            <>
              {/* Doc type + series */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium mb-1">Tipo</div>
                  <div className="flex gap-2">
                    <DocTypeChip
                      active={docType === 2}
                      onClick={() => setDocType(2)}
                    >
                      Boleta
                    </DocTypeChip>
                    <DocTypeChip
                      active={docType === 1}
                      onClick={() => setDocType(1)}
                    >
                      Factura
                    </DocTypeChip>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium mb-1">Serie</div>
                  <select
                    value={selectedSeries}
                    onChange={(e) => setSelectedSeries(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
                  >
                    {seriesForType.length === 0 ? (
                      <option value="">— Sin series —</option>
                    ) : (
                      seriesForType.map((s) => (
                        <option key={s.series} value={s.series}>
                          {s.series}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Billing mode (only when there's a partial payment) */}
              {(() => {
                const totalPrice =
                  appointment.total_price ?? appointment.price_snapshot ?? 0;
                const amountPaid = appointment.amount_paid ?? 0;
                if (amountPaid <= 0 || amountPaid >= totalPrice) return null;
                const pending = round2(totalPrice - amountPaid);
                return (
                  <fieldset className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                    <legend className="text-xs font-semibold px-2 text-amber-700 dark:text-amber-300 uppercase">
                      Pago parcial detectado
                    </legend>
                    <div className="text-xs text-muted-foreground">
                      El paciente pagó{" "}
                      <b className="text-foreground">
                        {config.default_currency} {fmt(amountPaid)}
                      </b>{" "}
                      de{" "}
                      <b className="text-foreground">
                        {config.default_currency} {fmt(totalPrice)}
                      </b>
                      . Quedan pendientes {config.default_currency}{" "}
                      {fmt(pending)}. Elegí por qué monto emitir esta boleta:
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <BillingModeChip
                        active={billingMode === "paid"}
                        onClick={() => setBillingMode("paid")}
                        title={`Por monto pagado (${config.default_currency} ${fmt(amountPaid)})`}
                        subtitle="Recomendado — emite otra boleta cuando complete el saldo"
                      />
                      <BillingModeChip
                        active={billingMode === "total"}
                        onClick={() => setBillingMode("total")}
                        title={`Por total (${config.default_currency} ${fmt(totalPrice)})`}
                        subtitle="Solo si vas a cobrar el saldo en efectivo sin boleta"
                      />
                    </div>
                  </fieldset>
                );
              })()}

              {/* Customer */}
              <fieldset className="rounded-xl border border-border/60 p-4 space-y-3">
                <legend className="text-xs font-semibold px-2 text-muted-foreground uppercase">
                  Cliente
                </legend>

                {loadingPatient && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Cargando datos fiscales del paciente…
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-[11px] font-medium mb-1">Tipo doc</div>
                    <select
                      value={customerDocType}
                      onChange={(e) => setCustomerDocType(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                    >
                      {DOC_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <div className="text-[11px] font-medium mb-1">Número</div>
                    <input
                      value={customerDocNumber}
                      onChange={(e) =>
                        setCustomerDocNumber(e.target.value.replace(/\s/g, ""))
                      }
                      disabled={customerDocType === "-"}
                      className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-mono disabled:opacity-50"
                      placeholder={
                        customerDocType === "1"
                          ? "12345678"
                          : customerDocType === "6"
                            ? "20600695771"
                            : ""
                      }
                    />
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-medium mb-1">
                    {customerDocType === "6" ? "Razón social" : "Nombre completo"}
                  </div>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
                  />
                </div>

                {customerDocType === "6" && (
                  <div>
                    <div className="text-[11px] font-medium mb-1">
                      Dirección fiscal *
                    </div>
                    <input
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                )}

                <div>
                  <div className="text-[11px] font-medium mb-1">Email (opcional)</div>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
                  />
                </div>
              </fieldset>

              {/* Items */}
              <fieldset className="rounded-xl border border-border/60 p-4 space-y-2">
                <legend className="text-xs font-semibold px-2 text-muted-foreground uppercase">
                  Ítems
                </legend>

                {items.map((it, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border/60 p-3 grid grid-cols-12 gap-2"
                  >
                    <input
                      value={it.description}
                      onChange={(e) =>
                        updateItem(i, "description", e.target.value)
                      }
                      placeholder="Descripción"
                      className="col-span-12 rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={it.quantity}
                      onChange={(e) =>
                        updateItem(i, "quantity", Number(e.target.value))
                      }
                      placeholder="Cant"
                      className="col-span-3 rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={it.unit_price}
                      onChange={(e) =>
                        updateItem(i, "unit_price", Number(e.target.value))
                      }
                      placeholder="Precio (con IGV)"
                      title="Precio unitario con IGV incluido — lo que paga el paciente"
                      className="col-span-4 rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <select
                      value={it.igv_affectation}
                      onChange={(e) =>
                        updateItem(
                          i,
                          "igv_affectation",
                          Number(e.target.value)
                        )
                      }
                      className="col-span-4 rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
                    >
                      {IGV_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(i)}
                        className="col-span-1 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}

                <button
                  onClick={addItem}
                  className="w-full rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                >
                  + Agregar ítem
                </button>
              </fieldset>

              {/* Discount + observations */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium mb-1">Descuento global</div>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <div className="text-xs font-medium mb-1">Observaciones</div>
                  <input
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Payment method (SUNAT 59) */}
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-medium">Método de pago</span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    SUNAT {sunatPayment.code} · {sunatPayment.description}
                  </span>
                </div>
                <input
                  value={paymentMethodLabel}
                  onChange={(e) => setPaymentMethodLabel(e.target.value)}
                  placeholder="Ej. Yape, Visa, Efectivo, Transferencia"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              {/* Bancarización warning (Ley 28194) — total ≥ S/2,000 + Efectivo */}
              {bancarizacionWarning && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                    <div className="font-semibold mb-0.5">
                      Bancarización (Ley 28194)
                    </div>
                    Estás emitiendo por <b>{config.default_currency} {fmt(totals.total)}</b>{" "}
                    en <b>efectivo</b> (≥ {config.default_currency}{" "}
                    {fmt(bancarizacionThreshold)}). El cliente <b>perderá</b>{" "}
                    derecho a deducir IGV y costo / gasto. Sugerimos cobrar con
                    Yape, transferencia o tarjeta y luego emitir el comprobante.
                  </div>
                </div>
              )}

              {/* Send email toggle */}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="rounded accent-primary cursor-pointer"
                />
                Enviar PDF al paciente por email
              </label>

              {/* Totals */}
              <div className="rounded-xl bg-muted/30 border border-border p-4 space-y-1.5 text-sm">
                <Row label="Subtotal gravado" value={`${config.default_currency} ${fmt(totals.subtotalTaxed)}`} />
                {totals.subtotalExempt > 0 && (
                  <Row label="Exonerado" value={`${config.default_currency} ${fmt(totals.subtotalExempt)}`} />
                )}
                {totals.subtotalUnaffected > 0 && (
                  <Row label="Inafecto" value={`${config.default_currency} ${fmt(totals.subtotalUnaffected)}`} />
                )}
                <Row
                  label={`IGV (${config.default_igv_percent}%)`}
                  value={`${config.default_currency} ${fmt(totals.igvAmount)}`}
                />
                {discount > 0 && (
                  <Row label="Descuento" value={`− ${config.default_currency} ${fmt(discount)}`} />
                )}
                <div className="pt-2 border-t border-border flex items-baseline justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="text-xl font-bold tabular-nums">
                    {config.default_currency} {fmt(totals.total)}
                  </span>
                </div>
              </div>

              {/* Error */}
              {result && !result.ok && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                  <div className="flex-1 text-sm text-rose-700 dark:text-rose-300">
                    <div className="font-medium">No se pudo emitir</div>
                    <div className="text-xs mt-1">{result.error}</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3 flex items-center justify-end gap-2">
          {result?.ok ? (
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Cerrar
            </button>
          ) : (
            <>
              <button
                onClick={() => onOpenChange(false)}
                disabled={emitting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleEmit}
                disabled={emitting || !formValid}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {emitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Emitir{isFactura ? " factura" : " boleta"}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function SuccessPanel({
  result,
  sandbox,
  sentToEmail,
}: {
  result: {
    ok: true;
    invoiceId: string;
    docType: number;
    series: string;
    number: number;
    pdfUrl?: string;
    sunatAccepted?: boolean;
  };
  sandbox: boolean;
  sentToEmail: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold text-emerald-700 dark:text-emerald-300">
            {result.series}-{String(result.number).padStart(8, "0")}
          </div>
          <div className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">
            {sandbox
              ? "Modo PRUEBAS — el comprobante NO se envía a SUNAT (activa producción cuando estés listo)."
              : result.sunatAccepted
                ? "Aceptado por SUNAT."
                : "Enviado a SUNAT (esperando confirmación)."}
          </div>
        </div>
      </div>

      {sentToEmail && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex items-start gap-2 text-xs">
          <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1">
            <span className="text-muted-foreground">Comprobante enviado a </span>
            <span className="font-medium text-foreground break-all">
              {sentToEmail}
            </span>
            <span className="text-muted-foreground">
              {" "}
              — Nubefact entrega el PDF en minutos.
            </span>
          </div>
        </div>
      )}

      {result.pdfUrl && (
        <a
          href={result.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors w-full justify-center"
        >
          <ExternalLink className="h-4 w-4" />
          Abrir PDF del comprobante
        </a>
      )}
    </div>
  );
}

function BillingModeChip({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border px-3 py-2 transition-colors ${
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-background hover:bg-accent"
      }`}
    >
      <div className={`text-sm font-medium ${active ? "text-primary" : ""}`}>
        {title}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
        {subtitle}
      </div>
    </button>
  );
}

function DocTypeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background hover:bg-accent text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
