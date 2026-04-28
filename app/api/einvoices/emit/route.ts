// Emits an electronic invoice (boleta or factura) for an appointment.
//
// Flow:
//   1. Validate input + auth
//   2. Load org config (provider creds + fiscal data)
//   3. Reserve next correlative atomically on einvoice_series
//   4. Insert `einvoices` row with status='sending'
//   5. Call provider.emit() — actual POST to Nubefact
//   6. On success: update row to status='accepted' + persist line items + link from appointment
//   7. On error: update row to status='rejected' (or 'error' if retryable) + ROLLBACK series correlative if it was a duplicate
//
// Auth: any active org member can emit (recepción, doctores y admins).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadConfig,
  getProvider,
  computeInvoiceTotals,
  todayInLima,
  mapPaymentMethodToSunat,
  DocType,
  Currency,
  type DocTypeCode,
  type CustomerDocTypeCode,
  type CurrencyCode,
  type IgvAffectationCode,
  type InvoicePayload,
  type InvoiceLineItem,
} from "@/lib/einvoice";

export const runtime = "nodejs";
export const maxDuration = 30;

const itemSchema = z.object({
  service_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1).max(250),
  quantity: z.coerce.number().positive(),
  // Per-unit price WITH IGV included — what the patient pays per unit.
  // Convention for clinics: catalog prices are final prices. The route
  // splits this into subtotal (sin IGV) + IGV before sending to Nubefact.
  unit_price: z.coerce.number().min(0),
  igv_affectation: z.coerce.number().int().min(1),
  internal_code: z.string().max(15).optional(),
  sunat_product_code: z.string().max(15).optional(),
  unit_of_measure: z.string().max(10).optional(),
});

const bodySchema = z.object({
  appointment_id: z.string().uuid().optional().nullable(),
  doc_type: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  series: z.string().length(4),

  // Customer
  customer_doc_type: z.string().min(1).max(2),
  customer_doc_number: z.string().min(1).max(20),
  customer_name: z.string().min(1).max(200),
  customer_address: z.string().max(500).optional().nullable(),
  customer_email: z.string().email().optional().nullable().or(z.literal("")),

  // Items
  items: z.array(itemSchema).min(1, "Al menos 1 ítem"),

  // Optional
  currency: z.enum(["PEN", "USD"]).default("PEN"),
  igv_percent: z.coerce.number().min(0).max(100).default(18),
  invoice_discount: z.coerce.number().min(0).default(0),
  observations: z.string().max(500).optional().nullable(),
  send_to_customer_email: z.boolean().optional(),
  /**
   * Free-text label of the payment method (matches the org's
   * `lookup_values` for `payment_method`). Optional: if missing, the
   * route falls back to the latest `patient_payments` row for the
   * appointment. Mapped to SUNAT Catálogo 59 internally.
   */
  payment_method_label: z.string().max(100).optional().nullable(),

  // ── Credit note fields (only when doc_type = 3) ─────────────────────
  /** UUID of the einvoice being credited. Required when doc_type=3. */
  referenced_einvoice_id: z.string().uuid().optional().nullable(),
  /**
   * SUNAT Catálogo 9 code for the credit-note reason. Required when
   * doc_type=3. We accept the 2-digit code (e.g. "01", "06") as a string
   * since SUNAT uses leading zeros.
   */
  credit_note_reason_code: z
    .string()
    .regex(/^\d{2}$/, "Motivo SUNAT debe ser 2 dígitos")
    .optional()
    .nullable(),
}).superRefine((data, ctx) => {
  // SUNAT requires fiscal address on facturas (doc_type=1) and credit/
  // debit notes that reference a factura. Boletas to consumidor final
  // can omit it. The wizard already enforces this client-side; this is
  // defense-in-depth so a crafted request can't slip an empty address.
  const isFactura = data.doc_type === 1;
  const isRucCustomer = data.customer_doc_type === "6";
  if ((isFactura || isRucCustomer) && !data.customer_address?.trim()) {
    ctx.addIssue({
      path: ["customer_address"],
      code: z.ZodIssueCode.custom,
      message:
        "La dirección fiscal es obligatoria para facturas y clientes con RUC.",
    });
  }

  // Credit notes need both the referenced einvoice and the SUNAT reason.
  if (data.doc_type === 3) {
    if (!data.referenced_einvoice_id) {
      ctx.addIssue({
        path: ["referenced_einvoice_id"],
        code: z.ZodIssueCode.custom,
        message: "Falta el comprobante a anular para emitir la nota de crédito.",
      });
    }
    if (!data.credit_note_reason_code) {
      ctx.addIssue({
        path: ["credit_note_reason_code"],
        code: z.ZodIssueCode.custom,
        message: "Falta el motivo SUNAT (Catálogo 9) de la nota de crédito.",
      });
    }
  }
});

type SeriesRow = {
  id: string;
  current_number: number;
};

const CURRENCY_MAP: Record<string, CurrencyCode> = {
  PEN: Currency.PEN,
  USD: Currency.USD,
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.organization_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Doctors can NOT emit invoices. Billing/comprobantes is admin/receptionist
  // territory: it requires fiscal context (RUC del cliente, validation,
  // SUNAT reasoning) that is outside the doctor's clinical scope. Owner +
  // admin + receptionist are the only allowed roles.
  if (membership.role === "doctor") {
    return NextResponse.json(
      { error: "El rol doctor no puede emitir comprobantes." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const orgId = membership.organization_id;

  const config = await loadConfig(orgId);
  if (!config) {
    return NextResponse.json(
      { error: "Facturación electrónica no está activa para esta organización." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // ── 0) Resolve credit-note reference (only when doc_type=3) ───────────
  // Load the original einvoice so we can: (a) verify same-org,
  // (b) inherit its series/number for the `referenced` block in the
  // payload, (c) auto-create a doc_type=3 series entry if the org has
  // never emitted a credit note for this series prefix yet (Nubefact
  // demo accounts use the same prefix BBB1 for boleta and NC; the
  // wizard only seeds tipo 1 + 2 by default).
  let referencedEinvoice: {
    id: string;
    doc_type: number;
    series: string;
    number: number;
  } | null = null;
  if (data.doc_type === 3 && data.referenced_einvoice_id) {
    const { data: refRow, error: refErr } = await admin
      .from("einvoices")
      .select("id, organization_id, doc_type, series, number, status")
      .eq("id", data.referenced_einvoice_id)
      .maybeSingle();
    if (refErr || !refRow) {
      return NextResponse.json(
        { error: "No se encontró el comprobante a anular." },
        { status: 404 }
      );
    }
    const ref = refRow as unknown as {
      id: string;
      organization_id: string;
      doc_type: number;
      series: string;
      number: number;
      status: string;
    };
    if (ref.organization_id !== orgId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (ref.status !== "accepted" && ref.status !== "sending") {
      return NextResponse.json(
        {
          error:
            "Solo se pueden anular comprobantes aceptados o en proceso de envío a SUNAT.",
        },
        { status: 400 }
      );
    }
    referencedEinvoice = {
      id: ref.id,
      doc_type: ref.doc_type,
      series: ref.series,
      number: ref.number,
    };

    // Auto-create the doc_type=3 series row for this series name if
    // missing. Nubefact uses the same prefix for boleta/factura and
    // their notes — but our einvoice_series table tracks correlatives
    // per (org, doc_type, series) so we need a row.
    const { data: ncSeries } = await admin
      .from("einvoice_series")
      .select("id")
      .eq("organization_id", orgId)
      .eq("doc_type", 3)
      .eq("series", data.series)
      .maybeSingle();
    if (!ncSeries) {
      await admin.from("einvoice_series").insert({
        organization_id: orgId,
        doc_type: 3,
        series: data.series,
        current_number: 0,
        is_default: true,
        is_active: true,
      });
    }
  }

  // ── 1) Reserve next correlative atomically (RPC, see migration 110) ───
  // Postgres function `reserve_einvoice_correlative` does
  //   UPDATE einvoice_series SET current_number = current_number + 1
  //   WHERE ... RETURNING id, current_number
  // in a single statement. Row-level locks held by the UPDATE serialize
  // concurrent emits cleanly: two parallel calls return distinct numbers
  // (N+1 then N+2) instead of racing on a stale read.
  const { data: rpcData, error: rpcErr } = await admin.rpc(
    "reserve_einvoice_correlative",
    {
      p_organization_id: orgId,
      p_doc_type: data.doc_type,
      p_series: data.series,
    }
  );

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }
  const rpcRows = rpcData as Array<{ series_id: string; reserved_number: number }> | null;
  if (!rpcRows || rpcRows.length === 0) {
    return NextResponse.json(
      { error: `Serie ${data.series} no está registrada o no está activa.` },
      { status: 400 }
    );
  }
  const series: SeriesRow = {
    id: rpcRows[0].series_id,
    current_number: rpcRows[0].reserved_number,
  };
  const nextNumber = rpcRows[0].reserved_number;

  // ── 2) Compute totals from items ──────────────────────────────────────
  // unit_price comes WITH IGV included (catalog convention). We split it:
  //   - Taxed:  unitValue = unit_price / (1 + IGV%); igv = unit_price - unitValue
  //   - Else:   unitValue = unit_price; igv = 0
  // Nubefact's API requires both `valor_unitario` (sin IGV) and
  // `precio_unitario` (con IGV) — so we send both.
  const igvFactor = data.igv_percent / 100;
  const lineItems: InvoiceLineItem[] = data.items.map((it) => {
    const isTaxed = it.igv_affectation === 1; // gravado
    const unitValue = isTaxed
      ? round2(it.unit_price / (1 + igvFactor))
      : round2(it.unit_price);
    const unitIgv = isTaxed ? round2(it.unit_price - unitValue) : 0;
    const subtotal = round2(unitValue * it.quantity);
    const igvAmount = round2(unitIgv * it.quantity);
    const total = round2(subtotal + igvAmount);
    return {
      description: it.description,
      quantity: it.quantity,
      unitValue,
      unitPrice: round2(it.unit_price),
      subtotal,
      igvAffectation: it.igv_affectation as IgvAffectationCode,
      igvAmount,
      total,
      unitOfMeasure: (it.unit_of_measure ?? "ZZ") as InvoiceLineItem["unitOfMeasure"],
      sunatProductCode: it.sunat_product_code,
      internalCode: it.internal_code,
      serviceId: it.service_id ?? undefined,
    };
  });
  const totals = computeInvoiceTotals(lineItems, data.invoice_discount);

  // ── 3) Insert einvoices row in 'sending' state ─────────────────────────
  const { data: invRow, error: invInsertErr } = await admin
    .from("einvoices")
    .insert({
      organization_id: orgId,
      appointment_id: data.appointment_id ?? null,
      doc_type: data.doc_type,
      series: data.series,
      number: nextNumber,
      customer_doc_type: data.customer_doc_type,
      customer_doc_number: data.customer_doc_number,
      customer_name: data.customer_name,
      customer_address: data.customer_address ?? null,
      customer_email: data.customer_email || null,
      currency: data.currency,
      igv_percent: data.igv_percent,
      subtotal_taxed: totals.subtotalTaxed,
      subtotal_exempt: totals.subtotalExempt,
      subtotal_unaffected: totals.subtotalUnaffected,
      subtotal_free: totals.subtotalFree,
      igv_amount: totals.igvAmount,
      discount_amount: data.invoice_discount,
      total: totals.total,
      status: "sending",
      provider: config.providerName,
      issued_at: new Date().toISOString(),
      issued_by_user_id: user.id,
      // Reference to the original (only for NC / ND)
      referenced_doc_type: referencedEinvoice?.doc_type ?? null,
      referenced_series: referencedEinvoice?.series ?? null,
      referenced_number: referencedEinvoice?.number ?? null,
      note_type: data.credit_note_reason_code ?? null,
    })
    .select("id")
    .single();

  if (invInsertErr || !invRow) {
    // Rollback correlative — couldn't even create the row
    await admin
      .from("einvoice_series")
      .update({ current_number: nextNumber - 1 })
      .eq("id", series.id);
    return NextResponse.json(
      { error: invInsertErr?.message ?? "No se pudo crear el comprobante." },
      { status: 500 }
    );
  }
  const invoiceId = (invRow as unknown as { id: string }).id;

  // Insert line items
  await admin.from("einvoice_line_items").insert(
    lineItems.map((item, idx) => ({
      einvoice_id: invoiceId,
      service_id: data.items[idx].service_id ?? null,
      position: idx + 1,
      description: item.description,
      quantity: item.quantity,
      unit_of_measure: item.unitOfMeasure ?? "ZZ",
      unit_value: item.unitValue,
      unit_price: item.unitPrice,
      discount: 0,
      subtotal: item.subtotal,
      igv_affectation: item.igvAffectation,
      igv_amount: item.igvAmount,
      total: item.total,
      sunat_product_code: item.sunatProductCode ?? null,
      internal_code: item.internalCode ?? null,
    }))
  );

  // ── 4) Resolve payment method (SUNAT Catálogo 59) ─────────────────────
  // Caller can pass `payment_method_label` directly (manual emit from the
  // modal — usually the patient_payments row the receptionist just
  // recorded). If absent, we read the latest patient_payments for this
  // appointment as best-effort. If still nothing, the mapper falls back
  // to "099 - Otros medios de pago" — always SUNAT-valid.
  let paymentLabel: string | null = data.payment_method_label?.trim() || null;
  if (!paymentLabel && data.appointment_id) {
    const { data: lastPay } = await admin
      .from("patient_payments")
      .select("payment_method")
      .eq("appointment_id", data.appointment_id)
      .not("payment_method", "is", null)
      .order("payment_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    paymentLabel = (lastPay?.payment_method as string | null) ?? null;
  }
  const sunatPayment = mapPaymentMethodToSunat(paymentLabel);

  // ── 5) Call provider ───────────────────────────────────────────────────
  const provider = getProvider(config.providerName);

  const payload: InvoicePayload = {
    docType: data.doc_type as DocTypeCode,
    series: data.series,
    number: nextNumber,
    sunatTransaction: 1,
    customer: {
      docType: data.customer_doc_type as CustomerDocTypeCode,
      docNumber: data.customer_doc_number,
      name: data.customer_name,
      address: data.customer_address ?? undefined,
      email: data.customer_email || undefined,
    },
    currency: CURRENCY_MAP[data.currency],
    igvPercent: data.igv_percent,
    subtotalTaxed: totals.subtotalTaxed,
    subtotalExempt: totals.subtotalExempt,
    subtotalUnaffected: totals.subtotalUnaffected,
    subtotalFree: totals.subtotalFree,
    igvAmount: totals.igvAmount,
    discountAmount: data.invoice_discount,
    total: totals.total,
    items: lineItems,
    issueDate: todayInLima(),
    sendToSunat: true,
    sendToCustomerEmail:
      data.send_to_customer_email ?? config.autoSendEmail,
    observations: data.observations ?? undefined,
    paymentMethod: {
      condition: "Contado",
      medio: `${sunatPayment.code} - ${sunatPayment.description}`,
    },
    referenced: referencedEinvoice
      ? {
          docType: referencedEinvoice.doc_type as DocTypeCode,
          series: referencedEinvoice.series,
          number: referencedEinvoice.number,
          // SUNAT Catálogo 9 — already validated as 2-digit string
          noteType: data.credit_note_reason_code as string,
        }
      : undefined,
  };

  const result = await provider.emit(config.credentials, payload);

  // ── 5) Persist provider response ──────────────────────────────────────
  if (result.ok) {
    await admin
      .from("einvoices")
      .update({
        status: "accepted",
        provider_invoice_id: result.providerInvoiceId ?? null,
        provider_link: result.providerLink ?? null,
        pdf_url: result.pdfUrl ?? null,
        xml_url: result.xmlUrl ?? null,
        cdr_url: result.cdrUrl ?? null,
        sunat_accepted: result.sunatAccepted ?? false,
        sunat_response_code: result.sunatResponseCode ?? null,
        sunat_description: result.sunatDescription ?? null,
        qr_code_data: result.qrCodeData ?? null,
        hash_code: result.hashCode ?? null,
        provider_raw_response: result.rawResponse as object | null,
      })
      .eq("id", invoiceId);

    // Link from appointment (skip for credit/debit notes — we don't want
    // to overwrite the link to the original boleta/factura; the dashboard
    // and card resolve the NC chain through `referenced_einvoice_id` on
    // the einvoices row itself).
    if (data.appointment_id && data.doc_type !== 3 && data.doc_type !== 4) {
      await admin
        .from("appointments")
        .update({ einvoice_id: invoiceId })
        .eq("id", data.appointment_id);
    }

    // Mark the original as cancelled when this is a credit note that
    // anula the operation (Catálogo 9 reasons 01 = anulación, 06 =
    // devolución total). Other reasons (03 corrección, 09 disminución
    // valor, etc.) keep the original valid.
    if (
      data.doc_type === 3 &&
      referencedEinvoice &&
      (data.credit_note_reason_code === "01" ||
        data.credit_note_reason_code === "06")
    ) {
      await admin
        .from("einvoices")
        .update({ status: "cancelled" })
        .eq("id", referencedEinvoice.id);
    }

    return NextResponse.json({
      ok: true,
      invoice_id: invoiceId,
      doc_type: data.doc_type,
      series: data.series,
      number: nextNumber,
      pdf_url: result.pdfUrl,
      provider_link: result.providerLink,
      sunat_accepted: result.sunatAccepted,
    });
  }

  // Provider rejected or error
  const errorCode = result.error?.code ?? "unknown";
  const newStatus = result.error?.retryable ? "error" : "rejected";

  await admin
    .from("einvoices")
    .update({
      status: newStatus,
      last_error: result.error?.message ?? "Error desconocido",
      last_error_code: errorCode,
      last_error_at: new Date().toISOString(),
      provider_raw_response: result.rawResponse as object | null,
    })
    .eq("id", invoiceId);

  // Rollback the reserved correlative when Nubefact rejects in a way
  // that makes the number "wasted" — the comprobante will never be
  // emitted with this number, so freeing it lets the next attempt
  // reuse it.
  //
  // Cases that warrant rollback:
  //   - 23 (duplicate at provider): the correlative is already used at
  //     Nubefact's side, so our local one is desynced — roll back so
  //     a retry skips the desynced range.
  //   - Non-retryable errors (rejected): user has to fix data and emit
  //     again; the original number is gone forever otherwise (left as a
  //     phantom gap in the series — exactly the bug we hit going from
  //     B001 to BBB1 with serie no autorizada).
  //
  // Caveat: rollback is best-effort. If between the failed emit and the
  // retry another emit succeeds, that one will land on N+1 and the
  // failed-then-retried one ends up as N+2 — totally fine, no gap and
  // no duplicate.
  const shouldRollback = errorCode === "23" || newStatus === "rejected";
  if (shouldRollback) {
    await admin
      .from("einvoice_series")
      .update({ current_number: nextNumber - 1 })
      .eq("id", series.id);
  }

  return NextResponse.json(
    {
      ok: false,
      invoice_id: invoiceId,
      error: result.error?.message ?? "No se pudo emitir el comprobante.",
      error_code: errorCode,
      retryable: result.error?.retryable ?? false,
    },
    { status: 200 }
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
