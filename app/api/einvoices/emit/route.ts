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
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.organization_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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

  // ── 1) Reserve next correlative ───────────────────────────────────────
  // We do an UPDATE ... RETURNING that increments current_number atomically.
  // If two emits race, both get distinct numbers (Postgres locks the row).
  const { data: seriesData, error: seriesErr } = await admin
    .from("einvoice_series")
    .select("id, current_number")
    .eq("organization_id", orgId)
    .eq("doc_type", data.doc_type)
    .eq("series", data.series)
    .eq("is_active", true)
    .maybeSingle();

  if (seriesErr || !seriesData) {
    return NextResponse.json(
      { error: `Serie ${data.series} no está registrada o no está activa.` },
      { status: 400 }
    );
  }

  const series = seriesData as unknown as SeriesRow;
  const nextNumber = (series.current_number ?? 0) + 1;

  const { error: bumpErr } = await admin
    .from("einvoice_series")
    .update({ current_number: nextNumber })
    .eq("id", series.id);

  if (bumpErr) {
    return NextResponse.json({ error: bumpErr.message }, { status: 500 });
  }

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

  // ── 4) Call provider ───────────────────────────────────────────────────
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

    // Link from appointment
    if (data.appointment_id) {
      await admin
        .from("appointments")
        .update({ einvoice_id: invoiceId })
        .eq("id", data.appointment_id);
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

  // If error code 23 (duplicate) → our local correlative is desynced.
  // Rollback so the next attempt picks the same number (the user retries).
  if (errorCode === "23") {
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
