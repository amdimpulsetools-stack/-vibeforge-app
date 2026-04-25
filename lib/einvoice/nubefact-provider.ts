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

import type { EInvoiceProvider } from "./provider";
import type {
  InvoicePayload,
  EmitResult,
  QueryResult,
  CancelResult,
  ProviderCredentials,
  DocTypeCode,
} from "./types";
import { toNubefactGenerate } from "./mapper";

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
