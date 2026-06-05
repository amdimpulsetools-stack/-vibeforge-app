/**
 * HTML → PDF render path for tier-style fertility budgets (Phase 5).
 *
 * Switched per-org from `generate.tsx`. Currently only NATURVITRA's
 * FIV template (`templates/FIV.hbs`) is wired. The data shape per
 * tier (A/B/C) lives in `data/fiv-tiers.ts`; the per-org footer/header
 * overrides live in `data/vitra-overrides.ts`.
 *
 * Rendering pipeline: Handlebars (template + data) → HTML string →
 * Puppeteer headless chromium → PDF buffer.
 *
 * IMPORTANT: this uses `puppeteer` (full, with bundled chromium). It
 * works locally and in any environment that can run a full chromium
 * binary, but it will NOT work on Vercel serverless out-of-the-box —
 * the bundle exceeds the 50MB function size limit. When we deploy to
 * Vercel: switch to `puppeteer-core` + `@sparticuz/chromium`.
 */

import fs from "fs/promises";
import path from "path";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import type { BudgetPdfProps } from "./document";
import { FIV_NGS_PRICES, FIV_TIER_BREAKDOWNS } from "./data/fiv-tiers";
import { getOrgPdfOverrides } from "./data/vitra-overrides";

let cachedTemplate: HandlebarsTemplateDelegate | null = null;

async function loadFivTemplate(): Promise<HandlebarsTemplateDelegate> {
  if (cachedTemplate) return cachedTemplate;
  const templatePath = path.join(
    process.cwd(),
    "lib/budget-pdf/templates/FIV.hbs",
  );
  const source = await fs.readFile(templatePath, "utf8");
  cachedTemplate = Handlebars.compile(source, { noEscape: false });
  return cachedTemplate;
}

/**
 * Format a number into the Peruvian-style "1,234.00" string used
 * across the template. We never inject the "S/" prefix here — the
 * template owns the currency glyph so we don't double up.
 */
function formatPen(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Generate a human-friendly budget code. The DB doesn't yet store
 * one, so we synthesize from year + last 6 chars of the UUID. Stable
 * across renders of the same budget.
 */
function synthBudgetCode(budgetId: string, issuedAt: Date): string {
  const year = issuedAt.getFullYear();
  const tail = budgetId.replace(/-/g, "").slice(-4).toUpperCase();
  return `P-${year}-${tail}`;
}

/**
 * Builds the Handlebars data object for the FIV template from the
 * upstream `BudgetPdfProps` + the per-tier and per-org bundles.
 */
function buildFivData(
  props: BudgetPdfProps & { budgetId: string },
): Record<string, unknown> {
  const overrides = getOrgPdfOverrides(props.org.name);
  if (!overrides) {
    throw new Error(
      `[render-html] No org overrides registered for "${props.org.name}". ` +
        `Add an entry to lib/budget-pdf/data/vitra-overrides.ts.`,
    );
  }
  const tier = props.tier ?? "A";
  const breakdown = FIV_TIER_BREAKDOWNS[tier];

  const issuedAt = props.fecha;
  const validUntil = new Date(issuedAt);
  validUntil.setDate(validUntil.getDate() + props.vigenciaDays);

  const patientName = [props.patient.firstName, props.patient.lastName]
    .filter(Boolean)
    .join(" ")
    .trim() || "—";
  const documentLabel = props.patient.documentNumber
    ? `DNI ${props.patient.documentNumber}`
    : "—";

  return {
    org: {
      legal_name: props.org.name,
      tax_id: props.org.ruc ?? "",
      logo_url: props.org.logoDataUrl ?? "",
      brand_color: overrides.brand_color,
      address: overrides.address,
      phones: overrides.phones,
      email: overrides.email,
      website: overrides.website,
      footer_html: overrides.footer_html,
    },
    patient: {
      full_name: patientName,
      document_label: documentLabel,
    },
    doctor: {
      full_name: props.doctor.fullName,
    },
    advisor: {
      full_name: props.asesora?.fullName ?? "—",
      phone: overrides.advisor_phone_fallback,
    },
    budget: {
      code: synthBudgetCode(props.budgetId, issuedAt),
      issued_at_short: format(issuedAt, "dd/MM/yyyy", { locale: es }),
      valid_until_short: format(validUntil, "dd/MM/yyyy", { locale: es }),
      // Always use the breakdown total — the per-line subtotals must
      // match the displayed total exactly, so we ignore `props.amount`
      // (which may be stale if the DB tier prices haven't been
      // updated to match the 2026-06-04 .docx revision).
      total_formatted: breakdown.total_formatted,
    },
    phases: {
      estimulacion: breakdown.estimulacion,
      aspiracion: breakdown.aspiracion,
      congelacion: breakdown.congelacion,
      transferencia: breakdown.transferencia,
    },
    ngs: FIV_NGS_PRICES,
  };
}

/**
 * Render the FIV template + data into a final PDF buffer (A4).
 */
export async function renderFivHtmlPdf(
  props: BudgetPdfProps & { budgetId: string },
): Promise<Buffer> {
  const template = await loadFivTemplate();
  const data = buildFivData(props);
  const html = template(data);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    // `load` waits for the Google Fonts <link>; the template ships no
    // JS so there's nothing further to settle.
    await page.setContent(html, { waitUntil: "load" });
    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return Buffer.from(pdfBytes);
  } finally {
    await browser.close();
  }
}

/**
 * Decides whether a given budget should be rendered via the new
 * HTML+Handlebars path or fall back to the legacy React-PDF document.
 */
export function shouldUseHtmlPdfPath(
  orgLegalName: string,
  treatmentType: string,
): boolean {
  const overrides = getOrgPdfOverrides(orgLegalName);
  if (!overrides) return false;
  return treatmentType === "FIV";
}
