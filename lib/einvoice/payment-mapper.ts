// Maps a Yenda `payment_method` label (free-text from `lookup_values`,
// per-org configurable) to the SUNAT Catálogo 59 code expected on the
// emitted invoice.
//
// Why heuristic and not table-driven:
//   `payment_method` is text the org's owner types in Settings → Lookups.
//   Seed includes Efectivo / Yape / Visa, but every org can add more
//   ("Plin", "BIM", "Transferencia BCP", "Crédito 30 días"…). A static
//   per-label dictionary would miss those and force config UI to keep up.
//
//   This pure function normalizes the label (lowercase, sin tildes) and
//   matches against an ordered list of regex rules. First match wins;
//   default falls back to "099 - Otros medios de pago" — always a valid
//   SUNAT value, so an unknown label never blocks emission.
//
// SUNAT does NOT validate this code in real time at emission. The PDF
// renders it; tax inspections downstream care about it. So "best-effort
// correct" is the right bar — a reasonable mapping covers 95% of real
// Peruvian wallets and bank methods, and the 5% edge cases land on 099
// and emit anyway.

export interface SunatPaymentMethod {
  /** SUNAT Catálogo 59 code (3-digit string with leading zeros). */
  code: string;
  /** Human-readable description for the PDF. */
  description: string;
  /**
   * True when the underlying instrument is physical cash. Used by the
   * UI to surface a Bancarización warning (Ley 28194) when total ≥
   * S/2,000 and the method is cash.
   */
  isCash: boolean;
  /**
   * True when the underlying instrument is bancarizado per Ley 28194
   * (transferencias, depósitos, cheques no negociables, tarjetas, wallets
   * que corren por la CCE). Cash is NOT bancarizado over the threshold.
   */
  isBanked: boolean;
}

interface Rule {
  pattern: RegExp;
  result: SunatPaymentMethod;
}

// Order matters: more specific patterns first.
//   - "Tarjeta de débito" must match before "Tarjeta" (which assumes credit).
//   - "Cheque de gerencia" must match before "Cheque" (no-negociable default).
//   - "Crédito 30 días" must match before "Tarjeta de crédito" so we don't
//     classify financed terms as plastic.
const RULES: Rule[] = [
  // Wallets and mobile money (CCE — bancarizados).
  // Yape (BCP), Plin (Interbank/BBVA/Scotia), Tunki (Interbank), BIM (ASBANC),
  // Lukita (Banco de la Nación), Agora Pay (BBVA).
  {
    pattern: /\b(yape|plin|tunki|bim|lukita|agora\s*pay)\b/,
    result: {
      code: "003",
      description: "Transferencia de fondos",
      isCash: false,
      isBanked: true,
    },
  },

  // Bank wires / deposits.
  {
    pattern: /\b(deposito|depósito|abono\s*en\s*cuenta)\b/,
    result: {
      code: "001",
      description: "Depósito en cuenta",
      isCash: false,
      isBanked: true,
    },
  },
  {
    pattern: /\b(transferencia|transfer|interbancaria|cce|bcp|bbva|interbank|scotia|pichincha)\b/,
    result: {
      code: "003",
      description: "Transferencia de fondos",
      isCash: false,
      isBanked: true,
    },
  },

  // Cards — debit before credit (more specific first).
  // IMPORTANT: tarjeta-credito must come BEFORE the generic credit-terms
  // rule below, otherwise "Tarjeta de crédito" matches /credito/ first
  // and lands on 099.
  {
    pattern: /\b(tarjeta\s*de?\s*debito|tarjeta\s*débito|debito|débito|td)\b/,
    result: {
      code: "005",
      description: "Tarjeta de débito",
      isCash: false,
      isBanked: true,
    },
  },
  {
    pattern: /\b(tarjeta\s*de?\s*credito|tarjeta\s*crédito|tc)\b/,
    result: {
      code: "006",
      description: "Tarjeta de crédito emitida en el país",
      isCash: false,
      isBanked: true,
    },
  },

  // Credit terms (factura a crédito = forma_pago=Crédito, not a "method"
  // strictly, but orgs sometimes label payments this way in the lookup).
  // Must come AFTER tarjeta-credito.
  {
    pattern: /\b(credito|crédito|cuotas|30\s*dias|60\s*dias|plazo)\b/,
    result: {
      code: "099",
      description: "Otros medios de pago",
      isCash: false,
      isBanked: false,
    },
  },
  // Brand-only labels — most clinics seed "Visa" / "Mastercard" without
  // specifying credit/debit. We default to credit as the safer/SUNAT-common
  // interpretation; the org can rename to "Visa Débito" to flip it.
  {
    pattern: /\b(visa|mastercard|amex|american\s*express|diners)\b/,
    result: {
      code: "006",
      description: "Tarjeta de crédito emitida en el país",
      isCash: false,
      isBanked: true,
    },
  },
  {
    pattern: /\btarjeta\b/,
    result: {
      code: "006",
      description: "Tarjeta de crédito emitida en el país",
      isCash: false,
      isBanked: true,
    },
  },

  // Cheques — gerencia before generic.
  {
    pattern: /\bcheque\s*(de\s*)?gerencia\b/,
    result: {
      code: "015",
      description: "Cheque de gerencia",
      isCash: false,
      isBanked: true,
    },
  },
  {
    pattern: /\bcheque\b/,
    result: {
      code: "007",
      description: "Cheques con la cláusula no negociable",
      isCash: false,
      isBanked: true,
    },
  },

  // Cash — last among "real" methods so any wallet/card label wins.
  {
    pattern: /\b(efectivo|cash|contado|monedas|billetes)\b/,
    result: {
      code: "009",
      description: "Efectivo",
      isCash: true,
      isBanked: false,
    },
  },
];

const FALLBACK: SunatPaymentMethod = {
  code: "099",
  description: "Otros medios de pago",
  isCash: false,
  isBanked: false,
};

/**
 * Maps a free-text Yenda payment_method label to the closest SUNAT
 * Catálogo 59 entry. Returns the fallback "099 - Otros medios de pago"
 * for unknown / empty / null labels — never throws.
 */
export function mapPaymentMethodToSunat(
  label: string | null | undefined
): SunatPaymentMethod {
  if (!label) return FALLBACK;
  const normalized = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
  if (!normalized) return FALLBACK;
  for (const rule of RULES) {
    if (rule.pattern.test(normalized)) return rule.result;
  }
  return FALLBACK;
}

/**
 * Bancarización threshold (Ley 28194 — Perú).
 * Transactions ≥ this amount must use a bancarizado medio de pago, or
 * the tax cost/credit is disallowed. Currently S/2,000 (or USD 500).
 */
export const BANCARIZACION_THRESHOLD_PEN = 2000;
export const BANCARIZACION_THRESHOLD_USD = 500;

/**
 * Returns true if a payment of `total` in `currency` paid via `method`
 * would breach Ley 28194. Caller should surface a warning (not block) —
 * SUNAT doesn't reject the comprobante, it disallows downstream cost.
 */
export function violatesBancarizacion(
  total: number,
  currency: "PEN" | "USD",
  method: SunatPaymentMethod
): boolean {
  if (!method.isCash) return false;
  const threshold =
    currency === "USD" ? BANCARIZACION_THRESHOLD_USD : BANCARIZACION_THRESHOLD_PEN;
  return total >= threshold;
}
