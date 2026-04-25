// Public API of the e-invoice module.
//
// External code imports from here — never directly from provider-specific
// files. This keeps the provider a true implementation detail.
//
//   import { getProvider, loadCredentials, type InvoicePayload } from "@/lib/einvoice";

import { NubefactProvider } from "./nubefact-provider";
import type { EInvoiceProvider } from "./provider";
import type { ProviderCredentials } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";

// ── Provider factory ───────────────────────────────────────────────────────

const providers: Record<string, EInvoiceProvider> = {
  nubefact: new NubefactProvider(),
};

export function getProvider(name: string): EInvoiceProvider {
  const p = providers[name];
  if (!p) {
    throw new Error(
      `[einvoice] Unknown provider: ${name}. Supported: ${Object.keys(providers).join(", ")}`
    );
  }
  return p;
}

// ── Load credentials for an org ────────────────────────────────────────────
//
// Returns null if the org has no active e-invoice config. Tokens are stored
// encrypted — this is the only place they get decrypted. Callers get plain
// values ready to pass to the provider.

interface LoadedConfig {
  providerName: string;
  credentials: ProviderCredentials;
  ruc: string;
  legalName: string;
  fiscalAddress: string | null;
  ubigeo: string | null;
  defaultCurrency: "PEN" | "USD";
  defaultIgvPercent: number;
  autoEmitOnPayment: boolean;
  autoSendEmail: boolean;
}

interface EInvoiceConfigRow {
  provider: string;
  mode: "sandbox" | "production";
  is_active: boolean;
  ruc: string | null;
  legal_name: string | null;
  fiscal_address: string | null;
  ubigeo: string | null;
  provider_route_encrypted: string | null;
  provider_token_encrypted: string | null;
  default_currency: "PEN" | "USD";
  default_igv_percent: number;
  auto_emit_on_payment: boolean;
  auto_send_email: boolean;
}

export async function loadConfig(
  organizationId: string
): Promise<LoadedConfig | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("einvoice_configs")
    .select(
      "provider, mode, is_active, ruc, legal_name, fiscal_address, ubigeo, " +
        "provider_route_encrypted, provider_token_encrypted, " +
        "default_currency, default_igv_percent, auto_emit_on_payment, auto_send_email"
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as EInvoiceConfigRow;

  if (!row.is_active) return null;
  if (!row.provider_route_encrypted || !row.provider_token_encrypted) return null;
  if (!row.ruc || !row.legal_name) return null;

  const route = decrypt(row.provider_route_encrypted);
  const token = decrypt(row.provider_token_encrypted);

  return {
    providerName: row.provider,
    credentials: { route, token, mode: row.mode },
    ruc: row.ruc,
    legalName: row.legal_name,
    fiscalAddress: row.fiscal_address,
    ubigeo: row.ubigeo,
    defaultCurrency: row.default_currency,
    defaultIgvPercent: Number(row.default_igv_percent),
    autoEmitOnPayment: row.auto_emit_on_payment,
    autoSendEmail: row.auto_send_email,
  };
}

// ── Public re-exports ──────────────────────────────────────────────────────

export { computeInvoiceTotals, todayInLima } from "./mapper";
export {
  mapPaymentMethodToSunat,
  violatesBancarizacion,
  BANCARIZACION_THRESHOLD_PEN,
  BANCARIZACION_THRESHOLD_USD,
} from "./payment-mapper";
export type { SunatPaymentMethod } from "./payment-mapper";
export type { EInvoiceProvider } from "./provider";
export type {
  InvoicePayload,
  InvoiceLineItem,
  InvoiceCustomer,
  EmitResult,
  QueryResult,
  CancelResult,
  ProviderCredentials,
  DocTypeCode,
  CustomerDocTypeCode,
  CurrencyCode,
  IgvAffectationCode,
  SunatTransactionCode,
  UnitOfMeasureCode,
} from "./types";
export {
  DocType,
  CustomerDocType,
  Currency,
  IgvAffectation,
  SunatTransaction,
  UnitOfMeasure,
} from "./types";
