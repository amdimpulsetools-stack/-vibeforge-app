// Nubefact implementation of EInvoiceProvider.
//
// Wire details (from docs/nubefact-api-reference.md):
//   - Transport: POST JSON to the org's unique `route` URL
//   - Auth header: `Authorization: Token token="<token>"` (literal, not Bearer)
//   - Content-Type: application/json
//   - Operations discriminated by a "operacion" field in the body
//   - HTTP 200 may still mean error — always check body for `errors` key
//
// The provider is stateless; credentials are passed per-call. This keeps it
// pure and safe to reuse across orgs in the same serverless invocation.
//
// Everything Nubefact-shaped lives in this file: the catalog translation
// tables, the payload mapper (toNubefactGenerate) and the wire types. The
// provider-agnostic arithmetic is in mapper.ts — a second provider
// (YendaFact, direct to SUNAT) reuses that and writes its own file like this
// one.

import type { EInvoiceProvider } from "./provider";
import type {
  InvoicePayload,
  InvoiceLineItem,
  EmitResult,
  QueryResult,
  CancelResult,
  ProviderCredentials,
  DocTypeCode,
  CustomerDocTypeCode,
  CurrencyCode,
  IgvAffectationCode,
} from "./types";
import { DocType, CustomerDocType, Currency, IgvAffectation } from "./types";

// ── Nubefact wire types ────────────────────────────────────────────────────
//
// Local to this file. External code should not import these.

interface NubefactErrorBody {
  errors: string;
  codigo?: number;
}

interface NubefactEmitResponse {
  tipo_de_comprobante: number;
  serie: string;
  numero: number;
  enlace?: string;
  enlace_del_pdf?: string;
  enlace_del_xml?: string;
  enlace_del_cdr?: string;
  aceptada_por_sunat?: boolean;
  sunat_description?: string | null;
  sunat_note?: string | null;
  sunat_responsecode?: string | null;
  sunat_soap_error?: string;
  cadena_para_codigo_qr?: string;
  codigo_hash?: string;
}

interface NubefactQueryResponse extends NubefactEmitResponse {
  anulado?: boolean;
}

interface NubefactCancelResponse {
  numero: number;
  enlace?: string;
  sunat_ticket_numero?: string;
  aceptada_por_sunat?: boolean;
  sunat_description?: string | null;
  sunat_note?: string | null;
  sunat_responsecode?: string | null;
  sunat_soap_error?: string;
  enlace_del_pdf?: string;
  enlace_del_xml?: string;
  enlace_del_cdr?: string;
}

// ── Catalog translation: Yenda domain → Nubefact wire ──────────────────────
//
// Today every table below is the identity: our internal enums (types.ts) were
// born copying Nubefact's own codes, and those values are PERSISTED in the DB
// (einvoices.doc_type, einvoice_line_items.igv_affectation, …), so they are
// not up for renumbering.
//
// The tables exist anyway, written out explicitly, because this is the exact
// spot a second provider diverges. A direct-to-SUNAT emitter (UBL 2.1, e.g.
// YendaFact) has to translate these same domain values into the official
// catalogs, where they are NOT the identity:
//
//   Catálogo 01 — tipo de documento: factura "01", boleta "03",
//                 nota de crédito "07", nota de débito "08"
//   Catálogo 02 — moneda: "PEN" / "USD" (ISO 4217, not 1 / 2)
//   Catálogo 06 — tipo de documento del cliente: RUC "6", DNI "1", CE "4",
//                 pasaporte "7", sin documento "0"
//   Catálogo 07 — afectación IGV: gravado "10", exonerado "20",
//                 inafecto "30" (plus the gratuito variants)
//
// Keeping the mapping here means the next integration writes its own table
// instead of hunting for where each code is assumed.

const DOC_TYPE_TO_NUBEFACT: Record<DocTypeCode, number> = {
  [DocType.FACTURA]: 1,
  [DocType.BOLETA]: 2,
  [DocType.NOTA_CREDITO]: 3,
  [DocType.NOTA_DEBITO]: 4,
};

const CUSTOMER_DOC_TYPE_TO_NUBEFACT: Record<CustomerDocTypeCode, string> = {
  [CustomerDocType.RUC]: "6",
  [CustomerDocType.DNI]: "1",
  [CustomerDocType.CE]: "4",
  [CustomerDocType.PASSPORT]: "7",
  [CustomerDocType.VARIOS]: "-",
  [CustomerDocType.NON_RESIDENT]: "0",
  [CustomerDocType.DIPLOMATIC]: "A",
  [CustomerDocType.RESIDENCE_COUNTRY]: "B",
  [CustomerDocType.SAFE_CONDUCT]: "G",
};

const CURRENCY_TO_NUBEFACT: Record<CurrencyCode, number> = {
  [Currency.PEN]: 1,
  [Currency.USD]: 2,
  [Currency.EUR]: 3,
  [Currency.GBP]: 4,
};

const IGV_AFFECTATION_TO_NUBEFACT: Record<IgvAffectationCode, number> = {
  [IgvAffectation.GRAVADO]: 1,
  [IgvAffectation.EXONERADO]: 8,
  [IgvAffectation.INAFECTO]: 9,
  [IgvAffectation.INAFECTO_MUESTRAS_MEDICAS]: 12,
  [IgvAffectation.EXPORTACION]: 16,
  [IgvAffectation.EXONERADO_GRATUITO]: 17,
  [IgvAffectation.INAFECTO_GRATUITO]: 20,
};

// ── Payload mapping (Yenda InvoicePayload → Nubefact JSON) ─────────────────
//
// Nubefact quirks handled here:
//   - Dates in DD-MM-YYYY (not ISO)
//   - Booleans serialized as "true"/"false" strings in many examples
//     (we send actual booleans — both work per their docs, but strings
//     are what all their examples show, so we match that style)
//   - Empty strings instead of null for optional numeric fields
//
// The output is a plain object ready to JSON.stringify into the request body.

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
    // Always 0: any discount is already prorated into the net unit price
    // (see applyInvoiceDiscount in mapper.ts). Declaring it here on top of a
    // net price is the ambiguity SUNAT rejects.
    descuento: "",
    subtotal: item.subtotal,
    tipo_de_igv: IGV_AFFECTATION_TO_NUBEFACT[item.igvAffectation],
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
    tipo_de_comprobante: DOC_TYPE_TO_NUBEFACT[p.docType],
    serie: p.series,
    numero: p.number,
    sunat_transaction: p.sunatTransaction ?? 1,

    cliente_tipo_de_documento: CUSTOMER_DOC_TYPE_TO_NUBEFACT[p.customer.docType],
    cliente_numero_de_documento: p.customer.docNumber,
    cliente_denominacion: p.customer.name,
    cliente_direccion: strOrEmpty(p.customer.address),
    cliente_email: strOrEmpty(p.customer.email),
    cliente_email_1: "",
    cliente_email_2: "",

    fecha_de_emision: formatDate(p.issueDate),
    fecha_de_vencimiento: "",

    moneda: CURRENCY_TO_NUBEFACT[p.currency],
    tipo_de_cambio: p.exchangeRate != null ? p.exchangeRate : "",
    porcentaje_de_igv: p.igvPercent,

    // Both 0 on purpose. `p.discountAmount` is kept for our own audit trail,
    // but the comprobante travels with net prices per line: declaring the
    // discount again here would double-count it against `total_gravada`.
    descuento_global: "",
    total_descuento: "",
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
    documento_que_se_modifica_tipo: p.referenced
      ? DOC_TYPE_TO_NUBEFACT[p.referenced.docType]
      : "",
    documento_que_se_modifica_serie: p.referenced ? p.referenced.series : "",
    documento_que_se_modifica_numero: p.referenced ? p.referenced.number : "",
    tipo_de_nota_de_credito:
      p.referenced && p.docType === DocType.NOTA_CREDITO
        ? p.referenced.noteType
        : "",
    tipo_de_nota_de_debito:
      p.referenced && p.docType === DocType.NOTA_DEBITO
        ? p.referenced.noteType
        : "",

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

// ── Error handling helpers ─────────────────────────────────────────────────

// Which Nubefact error codes warrant retry (transient vs permanent).
// See docs/nubefact-api-reference.md section 4.
const NON_RETRYABLE_CODES = new Set([
  10, // invalid token
  11, // invalid route
  12, // wrong content-type (bug)
  20, // invalid format (bug)
  23, // duplicate (handled at correlative level)
  24, // not found
  50, // account suspended
  51, // suspended for non-payment
]);

function isNubefactError(body: unknown): body is NubefactErrorBody {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as { errors?: unknown }).errors === "string"
  );
}

function toErrorResult(body: NubefactErrorBody, rawResponse: unknown) {
  const code = body.codigo != null ? String(body.codigo) : "unknown";
  const retryable = body.codigo != null ? !NON_RETRYABLE_CODES.has(body.codigo) : true;
  return {
    rawResponse,
    error: {
      code,
      message: body.errors,
      retryable,
    },
  };
}

// ── Low-level request ──────────────────────────────────────────────────────

interface NubefactRequestResult<T> {
  ok: boolean;
  body: T | NubefactErrorBody | null;
  httpStatus: number;
  networkError?: string;
}

async function postToNubefact<T>(
  creds: ProviderCredentials,
  payload: unknown
): Promise<NubefactRequestResult<T>> {
  try {
    const res = await fetch(creds.route, {
      method: "POST",
      headers: {
        Authorization: `Token token="${creds.token}"`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Non-JSON response (rare) — treat as failure
    }

    return {
      ok: res.ok && !isNubefactError(body),
      body: body as T | NubefactErrorBody | null,
      httpStatus: res.status,
    };
  } catch (err) {
    return {
      ok: false,
      body: null,
      httpStatus: 0,
      networkError: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Provider implementation ────────────────────────────────────────────────

export class NubefactProvider implements EInvoiceProvider {
  readonly name = "nubefact";

  async emit(
    creds: ProviderCredentials,
    payload: InvoicePayload
  ): Promise<EmitResult> {
    const nubefactPayload = toNubefactGenerate(payload);
    const { ok, body, httpStatus, networkError } =
      await postToNubefact<NubefactEmitResponse>(creds, nubefactPayload);

    if (networkError) {
      return {
        ok: false,
        rawResponse: null,
        error: {
          code: "network",
          message: networkError,
          retryable: true,
        },
      };
    }

    if (!body) {
      return {
        ok: false,
        rawResponse: { httpStatus },
        error: {
          code: "parse",
          message: `Nubefact returned non-JSON body (HTTP ${httpStatus})`,
          retryable: true,
        },
      };
    }

    if (isNubefactError(body)) {
      return { ok: false, ...toErrorResult(body, body) };
    }

    if (!ok) {
      return {
        ok: false,
        rawResponse: body,
        error: {
          code: `http_${httpStatus}`,
          message: `HTTP ${httpStatus}`,
          retryable: httpStatus >= 500 || httpStatus === 0,
        },
      };
    }

    const r = body as NubefactEmitResponse;
    return {
      ok: true,
      providerInvoiceId: extractProviderId(r.enlace),
      providerLink: r.enlace,
      pdfUrl: r.enlace_del_pdf,
      xmlUrl: r.enlace_del_xml,
      cdrUrl: r.enlace_del_cdr,
      sunatAccepted: r.aceptada_por_sunat ?? false,
      sunatResponseCode: r.sunat_responsecode ?? undefined,
      sunatDescription: r.sunat_description ?? undefined,
      qrCodeData: r.cadena_para_codigo_qr,
      hashCode: r.codigo_hash,
      rawResponse: r,
    };
  }

  async query(
    creds: ProviderCredentials,
    docType: DocTypeCode,
    series: string,
    number: number
  ): Promise<QueryResult> {
    const { ok, body, httpStatus, networkError } =
      await postToNubefact<NubefactQueryResponse>(creds, {
        operacion: "consultar_comprobante",
        tipo_de_comprobante: docType,
        serie: series,
        numero: number,
      });

    if (networkError) {
      return {
        ok: false,
        found: false,
        rawResponse: null,
        error: { code: "network", message: networkError, retryable: true },
      };
    }

    if (!body) {
      return {
        ok: false,
        found: false,
        rawResponse: { httpStatus },
        error: { code: "parse", message: `HTTP ${httpStatus}`, retryable: true },
      };
    }

    if (isNubefactError(body)) {
      const result = toErrorResult(body, body);
      // Code 24 = not found — not an error in the conceptual sense
      const notFound = body.codigo === 24;
      return {
        ok: notFound,
        found: false,
        rawResponse: result.rawResponse,
        error: notFound ? undefined : result.error,
      };
    }

    if (!ok) {
      return {
        ok: false,
        found: false,
        rawResponse: body,
        error: { code: `http_${httpStatus}`, message: `HTTP ${httpStatus}`, retryable: false },
      };
    }

    const r = body as NubefactQueryResponse;
    return {
      ok: true,
      found: true,
      cancelled: r.anulado ?? false,
      providerLink: r.enlace,
      pdfUrl: r.enlace_del_pdf,
      xmlUrl: r.enlace_del_xml,
      cdrUrl: r.enlace_del_cdr,
      sunatAccepted: r.aceptada_por_sunat ?? false,
      sunatResponseCode: r.sunat_responsecode ?? undefined,
      sunatDescription: r.sunat_description ?? undefined,
      rawResponse: r,
    };
  }

  async cancel(
    creds: ProviderCredentials,
    docType: DocTypeCode,
    series: string,
    number: number,
    reason: string
  ): Promise<CancelResult> {
    const { ok, body, httpStatus, networkError } =
      await postToNubefact<NubefactCancelResponse>(creds, {
        operacion: "generar_anulacion",
        tipo_de_comprobante: docType,
        serie: series,
        numero: number,
        motivo: reason,
        codigo_unico: "",
      });

    if (networkError) {
      return {
        ok: false,
        rawResponse: null,
        error: { code: "network", message: networkError, retryable: true },
      };
    }

    if (!body) {
      return {
        ok: false,
        rawResponse: { httpStatus },
        error: { code: "parse", message: `HTTP ${httpStatus}`, retryable: true },
      };
    }

    if (isNubefactError(body)) {
      return { ok: false, ...toErrorResult(body, body) };
    }

    if (!ok) {
      return {
        ok: false,
        rawResponse: body,
        error: { code: `http_${httpStatus}`, message: `HTTP ${httpStatus}`, retryable: httpStatus >= 500 },
      };
    }

    const r = body as NubefactCancelResponse;
    return {
      ok: true,
      ticket: r.sunat_ticket_numero,
      pdfUrl: r.enlace_del_pdf,
      xmlUrl: r.enlace_del_xml,
      cdrUrl: r.enlace_del_cdr,
      sunatAccepted: r.aceptada_por_sunat ?? false,
      rawResponse: r,
    };
  }

  async queryCancellation(
    creds: ProviderCredentials,
    docType: DocTypeCode,
    series: string,
    number: number
  ): Promise<CancelResult> {
    const { ok, body, httpStatus, networkError } =
      await postToNubefact<NubefactCancelResponse>(creds, {
        operacion: "consultar_anulacion",
        tipo_de_comprobante: docType,
        serie: series,
        numero: number,
      });

    if (networkError) {
      return {
        ok: false,
        rawResponse: null,
        error: { code: "network", message: networkError, retryable: true },
      };
    }

    if (!body) {
      return {
        ok: false,
        rawResponse: { httpStatus },
        error: { code: "parse", message: `HTTP ${httpStatus}`, retryable: true },
      };
    }

    if (isNubefactError(body)) {
      return { ok: false, ...toErrorResult(body, body) };
    }

    if (!ok) {
      return {
        ok: false,
        rawResponse: body,
        error: { code: `http_${httpStatus}`, message: `HTTP ${httpStatus}`, retryable: httpStatus >= 500 },
      };
    }

    const r = body as NubefactCancelResponse;
    return {
      ok: true,
      ticket: r.sunat_ticket_numero,
      pdfUrl: r.enlace_del_pdf,
      xmlUrl: r.enlace_del_xml,
      cdrUrl: r.enlace_del_cdr,
      sunatAccepted: r.aceptada_por_sunat ?? false,
      rawResponse: r,
    };
  }
}

// Nubefact returns public URLs like `https://www.nubefact.com/cpe/<uuid>`.
// The uuid serves as our providerInvoiceId. Best-effort extraction.
function extractProviderId(enlace?: string): string | undefined {
  if (!enlace) return undefined;
  const parts = enlace.split("/");
  return parts[parts.length - 1] || undefined;
}
