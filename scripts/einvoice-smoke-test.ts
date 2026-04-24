/**
 * Smoke test for the e-invoice module.
 *
 * Two modes:
 *
 *   1. Dry-run (default): builds the Nubefact payload from a realistic
 *      clinical scenario, prints it, validates totals reconcile, and
 *      compares key fields against a known-good fixture. No network.
 *
 *   2. Live: actually hits Nubefact demo environment. Requires
 *      NUBEFACT_DEMO_ROUTE and NUBEFACT_DEMO_TOKEN env vars. Pass
 *      `--live` to enable.
 *
 * Usage:
 *   npx tsx scripts/einvoice-smoke-test.ts
 *   npx tsx scripts/einvoice-smoke-test.ts --live
 *
 * This is a developer tool — not part of the runtime bundle.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NubefactProvider } from "../lib/einvoice/nubefact-provider";
import { toNubefactGenerate, computeInvoiceTotals } from "../lib/einvoice/mapper";
import {
  DocType,
  CustomerDocType,
  Currency,
  IgvAffectation,
  UnitOfMeasure,
  type InvoicePayload,
} from "../lib/einvoice/types";

const isLive = process.argv.includes("--live");

// ── Scenario: typical clinic invoice ───────────────────────────────────────
// Sra. Ana Rodríguez (DNI) pays for two services at a fertility clinic.

function buildScenario(): InvoicePayload {
  const items = [
    {
      description: "Consulta con ginecóloga — primera vez",
      quantity: 1,
      unitValue: 150,         // S/ 150 sin IGV
      unitPrice: 177,         // S/ 177 con IGV
      subtotal: 150,
      igvAffectation: IgvAffectation.GRAVADO,
      igvAmount: 27,          // 18% de 150
      total: 177,
      unitOfMeasure: UnitOfMeasure.SERVICE,
      internalCode: "001",
    },
    {
      description: "Ecografía transvaginal",
      quantity: 1,
      unitValue: 80,
      unitPrice: 94.40,
      subtotal: 80,
      igvAffectation: IgvAffectation.GRAVADO,
      igvAmount: 14.40,
      total: 94.40,
      unitOfMeasure: UnitOfMeasure.SERVICE,
      internalCode: "002",
    },
  ];

  const totals = computeInvoiceTotals(items);

  return {
    docType: DocType.BOLETA,        // doctor a persona natural → boleta
    series: "BBB1",
    number: 1,
    sunatTransaction: 1,

    customer: {
      docType: CustomerDocType.DNI,
      docNumber: "46829123",
      name: "ANA RODRIGUEZ LOPEZ",
      email: "",
    },

    currency: Currency.PEN,
    igvPercent: 18,

    subtotalTaxed: totals.subtotalTaxed,
    subtotalExempt: totals.subtotalExempt,
    subtotalUnaffected: totals.subtotalUnaffected,
    subtotalFree: totals.subtotalFree,
    igvAmount: totals.igvAmount,
    discountAmount: 0,
    total: totals.total,

    items,

    issueDate: new Date().toISOString().split("T")[0],
    sendToSunat: true,
    sendToCustomerEmail: false,
    observations: "Smoke test — Yenda e-invoice module",
  };
}

// ── Dry-run: build payload and validate ────────────────────────────────────

function dryRun() {
  console.log("┌─ DRY RUN (no network) ─────────────────────────────────┐\n");

  const payload = buildScenario();
  const nubefactBody = toNubefactGenerate(payload);

  console.log("Payload (Nubefact JSON):");
  console.log(JSON.stringify(nubefactBody, null, 2));

  console.log("\n── Sanity checks ──");
  const checks: { name: string; ok: boolean; detail?: string }[] = [];

  const sumItemsTotal = payload.items.reduce((a, b) => a + b.total, 0);
  checks.push({
    name: "Sum of line totals == invoice total",
    ok: Math.abs(sumItemsTotal - payload.total) < 0.01,
    detail: `sum=${sumItemsTotal} total=${payload.total}`,
  });

  const sumIgv = payload.items.reduce((a, b) => a + b.igvAmount, 0);
  checks.push({
    name: "Sum of line IGV == invoice IGV",
    ok: Math.abs(sumIgv - payload.igvAmount) < 0.01,
    detail: `sum=${sumIgv} igv=${payload.igvAmount}`,
  });

  checks.push({
    name: "Series is 4 chars",
    ok: payload.series.length === 4,
  });

  checks.push({
    name: "Series starts with B for boleta",
    ok: payload.series.startsWith("B"),
  });

  const dateParts = (nubefactBody.fecha_de_emision as string).split("-");
  checks.push({
    name: "fecha_de_emision is DD-MM-YYYY",
    ok: dateParts.length === 3 && dateParts[0].length === 2 && dateParts[2].length === 4,
    detail: nubefactBody.fecha_de_emision as string,
  });

  for (const c of checks) {
    const mark = c.ok ? "✓" : "✗";
    const color = c.ok ? "\x1b[32m" : "\x1b[31m";
    const reset = "\x1b[0m";
    console.log(`  ${color}${mark}${reset} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }

  // Compare against a real Nubefact fixture to make sure our shape matches
  compareFixture(nubefactBody);

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${failed === 0 ? "\x1b[32m✓ all checks passed\x1b[0m" : `\x1b[31m✗ ${failed} check(s) failed\x1b[0m`}`);
  console.log("\n└────────────────────────────────────────────────────────┘");
}

function compareFixture(generated: Record<string, unknown>) {
  const fixturePath = resolve(
    __dirname,
    "../docs/EJEMPLOS-DE-ARCHIVOS-JSON/EJEMPLO JSON GENERAR CPE FACTURA 1 GRAVADA.txt"
  );
  let fixture: Record<string, unknown>;
  try {
    fixture = JSON.parse(readFileSync(fixturePath, "utf-8"));
  } catch (err) {
    console.log(`\n  (skipping fixture compare — ${err instanceof Error ? err.message : err})`);
    return;
  }

  console.log("\n── Shape compatibility with Nubefact fixture ──");
  const requiredKeys = Object.keys(fixture);
  const generatedKeys = new Set(Object.keys(generated));
  const missing = requiredKeys.filter((k) => !generatedKeys.has(k));
  const extra = [...generatedKeys].filter((k) => !requiredKeys.includes(k));

  if (missing.length === 0) {
    console.log("  \x1b[32m✓\x1b[0m All required top-level keys present");
  } else {
    console.log(`  \x1b[31m✗\x1b[0m Missing keys: ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    console.log(`  \x1b[33m⚠\x1b[0m Extra keys (harmless if ignored by Nubefact): ${extra.join(", ")}`);
  }
}

// ── Live: hit Nubefact demo ────────────────────────────────────────────────

async function liveRun() {
  console.log("┌─ LIVE RUN (Nubefact demo) ─────────────────────────────┐\n");

  const route = process.env.NUBEFACT_DEMO_ROUTE;
  const token = process.env.NUBEFACT_DEMO_TOKEN;
  if (!route || !token) {
    console.error(
      "\x1b[31mMissing NUBEFACT_DEMO_ROUTE or NUBEFACT_DEMO_TOKEN env.\x1b[0m\n" +
        "Create a free demo account at https://www.nubefact.com/register,\n" +
        "then open API (Integración) to copy your route + token."
    );
    process.exit(1);
  }

  const provider = new NubefactProvider();
  const payload = buildScenario();

  console.log(`Provider: ${provider.name}`);
  console.log(`Route:    ${route}`);
  console.log(`Boleta:   ${payload.series}-${payload.number}\n`);
  console.log("Emitting…");

  const result = await provider.emit({ route, token, mode: "sandbox" }, payload);

  console.log("\n── Result ──");
  console.log(`  ok:                  ${result.ok}`);
  console.log(`  providerInvoiceId:   ${result.providerInvoiceId ?? "—"}`);
  console.log(`  providerLink:        ${result.providerLink ?? "—"}`);
  console.log(`  pdfUrl:              ${result.pdfUrl ?? "—"}`);
  console.log(`  xmlUrl:              ${result.xmlUrl ?? "—"}`);
  console.log(`  cdrUrl:              ${result.cdrUrl ?? "—"}`);
  console.log(`  sunatAccepted:       ${result.sunatAccepted ?? "—"}`);
  console.log(`  sunatDescription:    ${result.sunatDescription ?? "—"}`);
  if (result.error) {
    console.log(`\n\x1b[31m  error.code:     ${result.error.code}`);
    console.log(`  error.message:  ${result.error.message}`);
    console.log(`  error.retryable: ${result.error.retryable}\x1b[0m`);
  }

  console.log("\n── Raw response ──");
  console.log(JSON.stringify(result.rawResponse, null, 2));
  console.log("\n└────────────────────────────────────────────────────────┘");
  process.exit(result.ok ? 0 : 1);
}

// ── Entry point ────────────────────────────────────────────────────────────

(async () => {
  if (isLive) {
    await liveRun();
  } else {
    dryRun();
  }
})();
