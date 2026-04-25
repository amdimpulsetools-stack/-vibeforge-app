// Abstract e-invoice provider contract.
//
// Everything Yenda calls to emit/query/cancel invoices goes through this
// interface. Current implementation: NubefactProvider. Swappable for
// FactproProvider, SunatDirectProvider, etc. without touching UI or
// business flows.
//
// Contract: every method must be "safe" — a failure is reported via the
// `error` field of the result, never by throwing. This keeps the caller
// (usually a Next.js route handler) simple: inspect `.ok`, branch on
// `.error.retryable` if it's false.

import type {
  InvoicePayload,
  EmitResult,
  QueryResult,
  CancelResult,
  ProviderCredentials,
  DocTypeCode,
} from "./types";

export interface EInvoiceProvider {
  readonly name: string;

  /**
   * Emits a new invoice (factura, boleta, NC, or ND).
   * Returns the provider response normalized to EmitResult.
   * Never throws — errors go in the `error` field.
   */
  emit(creds: ProviderCredentials, payload: InvoicePayload): Promise<EmitResult>;

  /**
   * Queries the current state of an already-submitted invoice.
   * Used when emit failed with a network error to check if it actually
   * went through before retrying.
   */
  query(
    creds: ProviderCredentials,
    docType: DocTypeCode,
    series: string,
    number: number
  ): Promise<QueryResult>;

  /**
   * Submits a "comunicación de baja" to cancel an invoice.
   * SUNAT processes this asynchronously — the result usually includes a
   * `ticket` that must be polled with `queryCancellation`.
   */
  cancel(
    creds: ProviderCredentials,
    docType: DocTypeCode,
    series: string,
    number: number,
    reason: string
  ): Promise<CancelResult>;

  /**
   * Polls the status of a pending cancellation.
   */
  queryCancellation(
    creds: ProviderCredentials,
    docType: DocTypeCode,
    series: string,
    number: number
  ): Promise<CancelResult>;
}
