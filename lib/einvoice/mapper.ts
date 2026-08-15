// Provider-agnostic invoice arithmetic.
//
// This file holds ONLY what is true for any electronic-invoicing provider:
// how a line's taxable base and IGV are derived from a final price, how an
// invoice-level discount is prorated, how the header totals are added up and
// what "today" means in Peru.
//
// Anything provider-specific (payload shape, field names, catalog codes)
// lives next to its provider — see nubefact-provider.ts.

import type { InvoiceLineItem } from "./types";

// ── Per-line tax arithmetic ────────────────────────────────────────────────
//
// Catalog prices in a clinic are FINAL prices per unit (IGV included). Backing
// out the taxable base has to happen on the LINE amount, never on the unit
// price: rounding the unit value to 2 decimals and then multiplying by the
// quantity repeats the rounding error once per unit (q=12 at S/ 35.50 used to
// declare S/ 0.06 too much base and S/ 0.06 too little IGV).
//
// Correct order (the one SUNAT / Nubefact reconcile against):
//   line_gross    = round2(q * unit_price_with_igv)
//   line_total    = line_gross − line_discount
//   line_subtotal = round2(line_total / (1 + igv%))
//   line_igv      = line_total − line_subtotal      ← exact, by difference
//   unit_value    = round4(line_subtotal / q)       ← 4 decimals: what both
//   unit_price    = round4(line_total / q)            the DB and Nubefact take
//
// Exonerated / unaffected lines pay no IGV: the base IS the line amount.
export interface LineTaxInput {
  quantity: number;
  /** Unit price WITH IGV included (catalog convention). */
  unitPriceWithTax: number;
  /** Share of the invoice-level discount assigned to this line. */
  lineDiscount?: number;
  /** true = gravado (code 1). Exonerado / inafecto / gratuito are false. */
  isTaxed: boolean;
  igvPercent: number;
}

export interface LineTaxAmounts {
  lineGross: number;
  lineDiscount: number;
  lineTotal: number;
  subtotal: number;
  igvAmount: number;
  unitValue: number;
  unitPrice: number;
}

export function computeLineTax(input: LineTaxInput): LineTaxAmounts {
  const q = input.quantity;
  const lineGross = round2(q * input.unitPriceWithTax);
  const lineDiscount = round2(input.lineDiscount ?? 0);
  const lineTotal = round2(lineGross - lineDiscount);
  const subtotal = input.isTaxed
    ? round2(lineTotal / (1 + input.igvPercent / 100))
    : lineTotal;
  // By difference — never round the IGV independently, or the line stops
  // reconciling (subtotal + igv must equal total to the cent).
  const igvAmount = round2(lineTotal - subtotal);
  return {
    lineGross,
    lineDiscount,
    lineTotal,
    subtotal,
    igvAmount,
    unitValue: q > 0 ? round4(subtotal / q) : 0,
    unitPrice: q > 0 ? round4(lineTotal / q) : 0,
  };
}

// Only code 1 (gravado) carries IGV. Exonerado (8), inafecto (9, 12),
// exportación (16) and the gratuito codes (17, 20) all resolve to base = line
// amount, igv = 0.
export function isTaxedAffectation(code: number): boolean {
  return code === 1;
}

// ── Invoice-level discount ─────────────────────────────────────────────────
//
// A global discount CANNOT simply be subtracted from the total: the base and
// the IGV are computed per line, so subtracting only at the end declares
// total_gravada + total_igv ≠ total and over-declares IGV (the customer pays
// less but SUNAT is told the full tax).
//
// We prorate it over the lines BEFORE backing out base/IGV, proportional to
// each line's gross amount. Rounding is settled with the largest-remainder
// rule: n−1 shares are rounded to 2 decimals and the last line takes
// `target − sum(rest)`, so the shares add up to the discount to the exact
// cent. ("Last line" = last line with a non-zero amount — a free/gratuito
// line at the end must never absorb a residue it can't pay for.)
//
// Once the discount lives inside each line's net price, the payload declares
// no discount at all (descuento / descuento_global = 0). SUNAT validates
// declared discounts against unit prices, and sending both the net price and
// the discount is exactly the ambiguity that gets comprobantes rejected.
export function prorateDiscount(
  lineGrossAmounts: number[],
  discount: number
): number[] {
  const shares = lineGrossAmounts.map(() => 0);
  const gross = lineGrossAmounts.reduce((acc, n) => acc + n, 0);
  const target = Math.min(round2(discount), round2(gross));
  if (!(target > 0) || !(gross > 0)) return shares;

  // Only lines with an amount take part in the split.
  const payable = lineGrossAmounts
    .map((amount, index) => ({ amount, index }))
    .filter((l) => l.amount > 0);
  const absorberIndex = payable[payable.length - 1].index;

  let assigned = 0;
  for (const line of payable) {
    if (line.index === absorberIndex) continue;
    const share = round2((target * line.amount) / gross);
    shares[line.index] = share;
    assigned = round2(assigned + share);
  }
  shares[absorberIndex] = round2(target - assigned);
  return shares;
}

// Re-derives the line items of an invoice with a global discount already
// prorated into their net prices. The returned lines carry no discount of
// their own — the price IS the discounted price.
export function applyInvoiceDiscount(
  items: InvoiceLineItem[],
  invoiceLevelDiscount: number,
  igvPercent = 18
): InvoiceLineItem[] {
  const shares = prorateDiscount(
    items.map((i) => i.total),
    invoiceLevelDiscount
  );
  return items.map((item, idx) => {
    const amounts = computeLineTax({
      quantity: item.quantity,
      // The line's current net unit price — item.total already includes IGV.
      unitPriceWithTax: item.quantity > 0 ? item.total / item.quantity : 0,
      lineDiscount: shares[idx],
      isTaxed: isTaxedAffectation(item.igvAffectation),
      igvPercent,
    });
    return {
      ...item,
      unitValue: amounts.unitValue,
      unitPrice: amounts.unitPrice,
      subtotal: amounts.subtotal,
      discount: 0,
      igvAmount: amounts.igvAmount,
      total: amounts.lineTotal,
    };
  });
}

// Pure totals calculation for an invoice. Useful for UI previews and as a
// sanity check before emitting: Nubefact rejects invoices where totals
// don't reconcile with line items (error code 20).
//
// `invoiceLevelDiscount` is prorated into the lines first (see
// applyInvoiceDiscount) — pass 0 when the caller already did that.
export function computeInvoiceTotals(
  items: InvoiceLineItem[],
  invoiceLevelDiscount = 0,
  igvPercent = 18
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

  const effectiveItems =
    invoiceLevelDiscount > 0
      ? applyInvoiceDiscount(items, invoiceLevelDiscount, igvPercent)
      : items;

  for (const item of effectiveItems) {
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

  // No subtraction here: the discount is already inside the line totals.
  return {
    subtotalTaxed: round2(subtotalTaxed),
    subtotalExempt: round2(subtotalExempt),
    subtotalUnaffected: round2(subtotalUnaffected),
    subtotalFree: round2(subtotalFree),
    igvAmount: round2(igvAmount),
    total: round2(total),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
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
