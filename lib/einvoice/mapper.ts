// Maps Yenda's internal InvoicePayload to Nubefact's JSON payload format.
//
// Nubefact quirks this mapper handles:
//   - Dates in DD-MM-YYYY (not ISO)
//   - Booleans serialized as "true"/"false" strings in many examples
//     (we send actual booleans — both work per their docs, but strings
//     are what all their examples show, so we match that style)
//   - Empty strings instead of null for optional numeric fields
//   - `descuento_global` is the invoice-level discount (not the sum of
//     per-item discounts — those go inside each item)
//
// The output is a plain object ready to JSON.stringify into the request body.

import type { InvoicePayload, InvoiceLineItem } from "./types";

// Convert "YYYY-MM-DD" → "DD-MM-YYYY"
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) throw new Error(`Invalid ISO date: ${iso}`);
  return `${d}-${m}-${y}`;
}

function strOrEmpty(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

function numOrEmpty(v: number | null | undefined): string | number {
  if (v === null || v === undefined || v === 0) return "";
  return v;
}

function mapItem(item: InvoiceLineItem) {
  return {
    unidad_de_medida: item.unitOfMeasure ?? "ZZ",
    codigo: item.internalCode ?? "",
    codigo_producto_sunat: item.sunatProductCode ?? "",
    descripcion: item.description,
    cantidad: item.quantity,
    valor_unitario: item.unitValue,
    precio_unitario: item.unitPrice,
    descuento: numOrEmpty(item.discount),
    subtotal: item.subtotal,
    tipo_de_igv: item.igvAffectation,
    igv: item.igvAmount,
    total: item.total,
    anticipo_regularizacion: false,
    anticipo_documento_serie: "",
    anticipo_documento_numero: "",
  };
}

export function toNubefactGenerate(p: InvoicePayload): Record<string, unknown> {
  const out: Record<string, unknown> = {
    operacion: "generar_comprobante",
    tipo_de_comprobante: p.docType,
    serie: p.series,
    numero: p.number,
    sunat_transaction: p.sunatTransaction ?? 1,

    cliente_tipo_de_documento: p.customer.docType,
    cliente_numero_de_documento: p.customer.docNumber,
    cliente_denominacion: p.customer.name,
    cliente_direccion: p.customer.address ?? "",
    cliente_email: p.customer.email ?? "",
    cliente_email_1: "",
    cliente_email_2: "",

    fecha_de_emision: formatDate(p.issueDate),
    fecha_de_vencimiento: "",

    moneda: p.currency,
    tipo_de_cambio: p.exchangeRate != null ? p.exchangeRate : "",
    porcentaje_de_igv: p.igvPercent,

    descuento_global: numOrEmpty(p.discountAmount),
    total_descuento: numOrEmpty(p.discountAmount),
    total_anticipo: "",
    total_gravada: numOrEmpty(p.subtotalTaxed),
    total_inafecta: numOrEmpty(p.subtotalUnaffected),
    total_exonerada: numOrEmpty(p.subtotalExempt),
    total_igv: numOrEmpty(p.igvAmount),
    total_gratuita: numOrEmpty(p.subtotalFree),
    total_otros_cargos: "",
    total: p.total,

    percepcion_tipo: "",
    percepcion_base_imponible: "",
    total_percepcion: "",
    total_incluido_percepcion: "",

    detraccion: false,
    observaciones: p.observations ?? "",

    // Reference doc (for NC / ND)
    documento_que_se_modifica_tipo: p.referenced ? p.referenced.docType : "",
    documento_que_se_modifica_serie: p.referenced ? p.referenced.series : "",
    documento_que_se_modifica_numero: p.referenced ? p.referenced.number : "",
    tipo_de_nota_de_credito:
      p.referenced && p.docType === 3 ? p.referenced.noteType : "",
    tipo_de_nota_de_debito:
      p.referenced && p.docType === 4 ? p.referenced.noteType : "",

    enviar_automaticamente_a_la_sunat: p.sendToSunat,
    enviar_automaticamente_al_cliente: p.sendToCustomerEmail,

    codigo_unico: "",
    condiciones_de_pago: p.paymentMethod?.condition ?? "",
    medio_de_pago: p.paymentMethod?.medio ?? "",
    placa_vehiculo: "",
    orden_compra_servicio: "",
    tabla_personalizada_codigo: "",
    formato_de_pdf: p.pdfFormat ?? "",

    items: p.items.map(mapItem),
  };

  return out;
}

// Pure totals calculation for an invoice. Useful for UI previews and as a
// sanity check before emitting: Nubefact rejects invoices where totals
// don't reconcile with line items (error code 20).
export function computeInvoiceTotals(
  items: InvoiceLineItem[],
  invoiceLevelDiscount = 0
): {
  subtotalTaxed: number;
  subtotalExempt: number;
  subtotalUnaffected: number;
  subtotalFree: number;
  igvAmount: number;
  total: number;
} {
  let subtotalTaxed = 0;
  let subtotalExempt = 0;
  let subtotalUnaffected = 0;
  let subtotalFree = 0;
  let igvAmount = 0;
  let total = 0;

  for (const item of items) {
    const code = item.igvAffectation;
    // 1 = gravado; 8 = exonerado; 9 = inafecto; 12 = inafecto muestras médicas;
    // 16 = exportación; 17 = exonerado gratuito; 20 = inafecto gratuito.
    // Gratuito (17, 20) go to subtotalFree.
    if (code === 17 || code === 20) {
      subtotalFree += item.subtotal;
    } else if (code === 8) {
      subtotalExempt += item.subtotal;
    } else if (code === 9 || code === 12) {
      subtotalUnaffected += item.subtotal;
    } else {
      subtotalTaxed += item.subtotal;
    }
    igvAmount += item.igvAmount;
    total += item.total;
  }

  const adjustedTotal = Math.max(total - invoiceLevelDiscount, 0);

  return {
    subtotalTaxed: round2(subtotalTaxed),
    subtotalExempt: round2(subtotalExempt),
    subtotalUnaffected: round2(subtotalUnaffected),
    subtotalFree: round2(subtotalFree),
    igvAmount: round2(igvAmount),
    total: round2(adjustedTotal),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Today's date in Lima timezone (UTC-5, no DST), as YYYY-MM-DD.
//
// Use this whenever you set `issueDate` on an InvoicePayload — Nubefact
// validates that the date is today in Peru time and rejects (error code 21)
// otherwise. Vercel servers run in UTC, so a naive `new Date().toISOString()`
// is wrong any time after 19:00 Peru time.
//
// Implementation note: we use Intl.DateTimeFormat with explicit timeZone so
// it works correctly regardless of where the code runs (local dev, CI,
// Vercel edge, Vercel serverless). No external date library needed.
export function todayInLima(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA produces "YYYY-MM-DD" out of the box.
  return fmt.format(new Date());
}
