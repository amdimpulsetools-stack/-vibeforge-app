// Domain types for the e-invoice module.
//
// Two layers:
//   - "Internal" types (how Yenda talks about invoices — camelCase, explicit
//      enums, strict typing).
//   - "Provider" types (how a specific provider like Nubefact expects its
//      payload — snake_case, loose strings, Peruvian tax codes). Provider
//      types live alongside their implementation (e.g. nubefact-provider.ts),
//      not here.
//
// This file is the boundary. Anything outside lib/einvoice/ must use only
// the types in this file.

// ── Catalog codes (matched against SUNAT / Nubefact) ───────────────────────

// Document type — matches Nubefact `tipo_de_comprobante`
export const DocType = {
  FACTURA: 1,
  BOLETA: 2,
  NOTA_CREDITO: 3,
  NOTA_DEBITO: 4,
} as const;
export type DocTypeCode = (typeof DocType)[keyof typeof DocType];

// Customer ID type — matches Nubefact `cliente_tipo_de_documento`.
// String-typed because SUNAT uses non-numeric codes like '-' and 'A'.
export const CustomerDocType = {
  RUC: "6",
  DNI: "1",
  CE: "4",           // Carnet de Extranjería
  PASSPORT: "7",
  VARIOS: "-",       // Ventas <S/700 sin identificar
  NON_RESIDENT: "0", // Exportación
  DIPLOMATIC: "A",
  RESIDENCE_COUNTRY: "B",
  SAFE_CONDUCT: "G",
} as const;
export type CustomerDocTypeCode = (typeof CustomerDocType)[keyof typeof CustomerDocType];

// Currency — matches Nubefact `moneda`
export const Currency = {
  PEN: 1,
  USD: 2,
  EUR: 3,
  GBP: 4,
} as const;
export type CurrencyCode = (typeof Currency)[keyof typeof Currency];

// Per-item IGV affectation — matches Nubefact `tipo_de_igv`.
// Relevant codes for a typical clinic:
export const IgvAffectation = {
  GRAVADO: 1,                       // default: service with IGV
  EXONERADO: 8,                     // SUNAT-declared exonerated service
  INAFECTO: 9,                      // not subject to IGV
  INAFECTO_MUESTRAS_MEDICAS: 12,    // free medical samples
  EXPORTACION: 16,
  EXONERADO_GRATUITO: 17,
  INAFECTO_GRATUITO: 20,
} as const;
export type IgvAffectationCode = (typeof IgvAffectation)[keyof typeof IgvAffectation];

// SUNAT transaction type — matches Nubefact `sunat_transaction`.
export const SunatTransaction = {
  VENTA_INTERNA: 1,                // default
  EXPORTACION: 2,
  VENTA_INTERNA_ANTICIPOS: 4,
  NO_DOMICILIADO: 29,
  DETRACCION: 30,
  PERCEPCION: 34,
} as const;
export type SunatTransactionCode = (typeof SunatTransaction)[keyof typeof SunatTransaction];

// Unit of measure
export const UnitOfMeasure = {
  SERVICE: "ZZ",   // default for medical services
  UNIT: "NIU",     // physical products
  OTHER: "4A",
} as const;
export type UnitOfMeasureCode = (typeof UnitOfMeasure)[keyof typeof UnitOfMeasure];

// ── Customer (snapshot at emission time) ───────────────────────────────────

export interface InvoiceCustomer {
  docType: CustomerDocTypeCode;
  docNumber: string;
  name: string;               // razón social or full name
  address?: string;           // required for facturas, optional for boletas
  email?: string;             // optional — for Nubefact auto-send
}

// ── Line item ──────────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitValue: number;          // without IGV
  unitPrice: number;          // with IGV
  subtotal: number;           // quantity * unitValue
  discount?: number;
  igvAffectation: IgvAffectationCode;
  igvAmount: number;
  total: number;              // final line amount (with IGV)
  unitOfMeasure?: UnitOfMeasureCode;
  sunatProductCode?: string;
  internalCode?: string;
  serviceId?: string;         // FK to our `services` table, for audit
}

// ── Full invoice payload (what we feed to the provider) ────────────────────

export interface InvoicePayload {
  docType: DocTypeCode;
  series: string;             // 4 chars, starts with F or B
  number: number;             // correlative (we manage locally)
  sunatTransaction?: SunatTransactionCode;  // default 1

  customer: InvoiceCustomer;
  currency: CurrencyCode;     // default PEN
  exchangeRate?: number;      // required if currency != PEN
  igvPercent: number;         // default 18

  // Totals (must reconcile with line items — provider may reject otherwise)
  subtotalTaxed: number;
  subtotalExempt: number;
  subtotalUnaffected: number;
  subtotalFree: number;
  igvAmount: number;
  discountAmount: number;
  total: number;

  items: InvoiceLineItem[];

  // Reference doc (for NC / ND)
  referenced?: {
    docType: DocTypeCode;
    series: string;
    number: number;
    noteType: string;         // see Nubefact `tipo_de_nota_de_credito/_debito`
  };

  /**
   * Payment method declared on the comprobante (SUNAT Catálogo 59).
   * Optional but recommended — required-ish for facturas to support
   * Bancarización (Ley 28194) downstream. When omitted, Nubefact assumes
   * "Contado" with no medio. We always send Contado (the partial-payment
   * model already ensures each comprobante is for an actual cobro);
   * `medio` carries the SUNAT 59 code + description like "003 -
   * Transferencia de fondos".
   */
  paymentMethod?: {
    /** Hardcoded "Contado" for now — credit-terms support is post-pilot. */
    condition: "Contado" | "Crédito";
    /** SUNAT Catálogo 59 line, e.g. "003 - Transferencia de fondos". */
    medio: string;
  };

  // Emission flags
  issueDate: string;          // ISO YYYY-MM-DD (we convert to DD-MM-YYYY for Nubefact)
  sendToSunat: boolean;       // default true
  sendToCustomerEmail: boolean; // Nubefact auto-sends the PDF to customer if true
  observations?: string;
  pdfFormat?: "A4" | "A5" | "TICKET";
}

// ── Provider response (normalized — each provider adapts its response) ─────

export interface EmitResult {
  ok: boolean;
  providerInvoiceId?: string; // UUID or internal ID in the provider
  providerLink?: string;      // public URL
  pdfUrl?: string;
  xmlUrl?: string;
  cdrUrl?: string;
  sunatAccepted?: boolean;
  sunatResponseCode?: string;
  sunatDescription?: string;
  qrCodeData?: string;
  hashCode?: string;
  rawResponse: unknown;       // full provider response for audit
  error?: {
    code: string;             // provider error code or 'network'/'parse'
    message: string;
    retryable: boolean;
  };
}

export interface QueryResult {
  ok: boolean;
  found: boolean;
  cancelled?: boolean;        // true if Nubefact reports `anulado: true`
  providerLink?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  cdrUrl?: string;
  sunatAccepted?: boolean;
  sunatResponseCode?: string;
  sunatDescription?: string;
  rawResponse: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface CancelResult {
  ok: boolean;
  ticket?: string;            // SUNAT ticket (for async cancellation polling)
  pdfUrl?: string;
  xmlUrl?: string;
  cdrUrl?: string;
  sunatAccepted?: boolean;    // often `false` at first — poll until `true`
  rawResponse: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

// ── Provider credentials (what a concrete provider needs to authenticate) ──

export interface ProviderCredentials {
  route: string;              // base URL (varies per provider; per-emitter for Nubefact)
  token: string;
  mode: "sandbox" | "production";
}
