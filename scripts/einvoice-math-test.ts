/**
 * Numeric tests for the e-invoice tax arithmetic.
 *
 * The repo has no test runner (no vitest / jest), so this is a plain script
 * with asserts — same spirit as scripts/einvoice-smoke-test.ts. No network,
 * no DB: it exercises the pure helpers in lib/einvoice/mapper.ts.
 *
 * Usage:
 *   npx tsx scripts/einvoice-math-test.ts
 *
 * Exits with code 1 if any case fails, so it can be wired into CI later.
 *
 * Every expected number here was verified by hand against SUNAT's rule:
 * the base is backed out of the LINE amount and the IGV is the exact
 * difference, so subtotal + igv == total to the cent, always.
 */

import {
  computeLineTax,
  computeInvoiceTotals,
  prorateDiscount,
  applyInvoiceDiscount,
  isTaxedAffectation,
} from "../lib/einvoice/mapper";
import { IgvAffectation, type InvoiceLineItem } from "../lib/einvoice/types";

// ── Mini assert harness ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(name: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 1e-9;
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name} = ${actual}`);
  } else {
    failed++;
    console.log(
      `  \x1b[31m✗\x1b[0m ${name} — esperado ${expected}, obtenido ${actual}`
    );
  }
}

function section(title: string) {
  console.log(`\n── ${title} ──`);
}

// Builds a line the way the emit route does, from a catalog price WITH IGV.
function line(
  quantity: number,
  unitPriceWithTax: number,
  igvAffectation: number = IgvAffectation.GRAVADO,
  lineDiscount = 0
): InvoiceLineItem {
  const a = computeLineTax({
    quantity,
    unitPriceWithTax,
    lineDiscount,
    isTaxed: isTaxedAffectation(igvAffectation),
    igvPercent: 18,
  });
  return {
    description: `Ítem q=${quantity} P=${unitPriceWithTax}`,
    quantity,
    unitValue: a.unitValue,
    unitPrice: a.unitPrice,
    subtotal: a.subtotal,
    discount: 0,
    igvAffectation: igvAffectation as InvoiceLineItem["igvAffectation"],
    igvAmount: a.igvAmount,
    total: a.lineTotal,
  };
}

// ── Case 0: regresión — servicio suelto, q=1, sin descuento ────────────────
// La emisión de servicios actual NO puede cambiar de importes.
section("Caso 0 — regresión q=1 (los totales de hoy no cambian)");
{
  const a = computeLineTax({
    quantity: 1,
    unitPriceWithTax: 150,
    isTaxed: true,
    igvPercent: 18,
  });
  check("subtotal", a.subtotal, 127.12);
  check("igv", a.igvAmount, 22.88);
  check("total", a.lineTotal, 150.0);
  check("valor_unitario", a.unitValue, 127.12);
  check("precio_unitario", a.unitPrice, 150.0);
}

// ── Case a: cantidad alta (el bug del redondeo por unidad) ─────────────────
section("Caso a — q=12, P=35.50 (antes: 361.08 / 64.92)");
{
  const a = computeLineTax({
    quantity: 12,
    unitPriceWithTax: 35.5,
    isTaxed: true,
    igvPercent: 18,
  });
  check("line_total", a.lineTotal, 426.0);
  check("subtotal", a.subtotal, 361.02);
  check("igv", a.igvAmount, 64.98);
  check("subtotal + igv", a.subtotal + a.igvAmount, a.lineTotal);
}

// ── Case b: comprobante mixto gravado + exonerado ──────────────────────────
section("Caso b — mixto: consulta gravada + 2 exonerados + 3 gravados");
{
  const items = [
    line(1, 150.0, IgvAffectation.GRAVADO),
    line(2, 18.0, IgvAffectation.EXONERADO),
    line(3, 210.0, IgvAffectation.GRAVADO),
  ];
  const t = computeInvoiceTotals(items);
  check("total", t.total, 816.0);
  check("total_gravada", t.subtotalTaxed, 661.02);
  check("total_exonerada", t.subtotalExempt, 36.0);
  check("total_igv", t.igvAmount, 118.98);
  check(
    "gravada + exonerada + igv == total",
    Number((t.subtotalTaxed + t.subtotalExempt + t.igvAmount).toFixed(2)),
    t.total
  );
  // Las líneas suman los totales de cabecera sin residuo.
  check(
    "Σ líneas == total",
    Number(items.reduce((s, i) => s + i.total, 0).toFixed(2)),
    t.total
  );
  check(
    "Σ igv de líneas == total_igv",
    Number(items.reduce((s, i) => s + i.igvAmount, 0).toFixed(2)),
    t.igvAmount
  );
}

// ── Case c: descuento global prorrateado ───────────────────────────────────
section("Caso c — descuento global S/ 60 sobre S/ 360 (150 + 210)");
{
  const shares = prorateDiscount([150, 210], 60);
  check("descuento línea 1", shares[0], 25.0);
  check("descuento línea 2", shares[1], 35.0);

  const items = [line(1, 150, IgvAffectation.GRAVADO, shares[0]), line(1, 210, IgvAffectation.GRAVADO, shares[1])];
  check("línea 1 total", items[0].total, 125.0);
  check("línea 2 total", items[1].total, 175.0);

  const t = computeInvoiceTotals(items);
  check("total_gravada", t.subtotalTaxed, 254.24);
  check("total_igv", t.igvAmount, 45.76);
  check("total", t.total, 300.0);
  check("gravada + igv == total", Number((t.subtotalTaxed + t.igvAmount).toFixed(2)), t.total);

  // Mismo resultado por la vía de computeInvoiceTotals(items, descuento):
  // el prorrateo vive en un solo sitio (applyInvoiceDiscount).
  const gross = [line(1, 150), line(1, 210)];
  const t2 = computeInvoiceTotals(gross, 60);
  check("vía computeInvoiceTotals — gravada", t2.subtotalTaxed, 254.24);
  check("vía computeInvoiceTotals — igv", t2.igvAmount, 45.76);
  check("vía computeInvoiceTotals — total", t2.total, 300.0);

  const applied = applyInvoiceDiscount(gross, 60);
  check("applyInvoiceDiscount — línea 1", applied[0].total, 125.0);
  check("applyInvoiceDiscount — línea 2", applied[1].total, 175.0);
}

// ── Case d: mayor resto con céntimos que no reparten limpio ────────────────
section("Caso d — mayor resto: 33.34 / 33.33 / 33.33 con descuento S/ 10");
{
  const grosses = [33.34, 33.33, 33.33];
  const shares = prorateDiscount(grosses, 10);
  check("Σ descuentos == 10.00", Number(shares.reduce((s, n) => s + n, 0).toFixed(2)), 10.0);

  const items = grosses.map((p, i) => line(1, p, IgvAffectation.GRAVADO, shares[i]));
  const t = computeInvoiceTotals(items);
  check("total", t.total, 90.0);
  check("Σ líneas == total", Number(items.reduce((s, i) => s + i.total, 0).toFixed(2)), 90.0);
  check("gravada + igv == total", Number((t.subtotalTaxed + t.igvAmount).toFixed(2)), t.total);
}

// ── Case e: el descuento nunca desborda ni deja líneas en negativo ─────────
section("Caso e — bordes del prorrateo");
{
  const clamped = prorateDiscount([100, 50], 500);
  check("descuento > importe se topa en el bruto", Number(clamped.reduce((s, n) => s + n, 0).toFixed(2)), 150.0);

  const noDiscount = prorateDiscount([100, 50], 0);
  check("sin descuento no reparte", noDiscount[0] + noDiscount[1], 0);

  // Una línea gratuita al final no debe absorber el residuo del redondeo.
  const withFree = prorateDiscount([33.34, 33.33, 0], 10);
  check("línea en 0 no recibe descuento", withFree[2], 0);
  check("Σ descuentos == 10.00 igual", Number(withFree.reduce((s, n) => s + n, 0).toFixed(2)), 10.0);
}

// ── Resultado ──────────────────────────────────────────────────────────────

console.log(
  `\n${failed === 0 ? "\x1b[32m✓" : "\x1b[31m✗"} ${passed} asserts OK, ${failed} fallidos\x1b[0m`
);
process.exit(failed === 0 ? 0 : 1);
