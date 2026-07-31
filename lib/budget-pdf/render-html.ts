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
 * Uses `puppeteer-core` + `@sparticuz/chromium` so the chromium binary
 * fits within Vercel's serverless function size limits. The sparticuz
 * package ships a brotli-compressed chromium-headless-shell that only
 * runs on linux x86_64 — perfect for Vercel/AWS Lambda, but it will
 * fail on macOS local dev. For local dev on Mac, point CHROME_PATH at
 * a local Chrome install, or run `npm run dev` from a linux container.
 */

import fs from "fs/promises";
import path from "path";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Handlebars from "handlebars";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import type { BudgetPdfProps } from "./document";
import {
  FIV_NGS_PRICES,
  FIV_TIER_BREAKDOWNS,
  type FivPhaseBreakdown,
} from "./data/fiv-tiers";
import type { OrgPdfOverrides } from "./data/vitra-overrides";

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
 * Parse a Peruvian-formatted "11,200.00" string back into a number.
 * Inverse of `formatPen` — needed to fold a per-budget honorarios
 * surcharge into the otherwise-hardcoded FIV breakdown strings.
 */
function parsePen(s: string): number {
  return Number(s.replace(/,/g, "")) || 0;
}

/**
 * Fold a honorarios surcharge (mig 174) into a FIV breakdown. The
 * whole delta lands on the aspiración phase — the main procedure fee —
 * so the patient sees a single, higher "Honorarios médicos" figure
 * with no separate "ajuste" line (per the chosen UX). The phase
 * subtotal and the grand total move by the same delta so every column
 * still reconciles: subtotal = honorarios + procedimiento, and
 * total = Σ subtotales. Returns the breakdown untouched when delta ≤ 0.
 */
function applyHonorariosAdjustment(
  breakdown: FivPhaseBreakdown,
  delta: number,
): FivPhaseBreakdown {
  if (!delta || delta <= 0) return breakdown;
  return {
    ...breakdown,
    aspiracion: {
      ...breakdown.aspiracion,
      honorarios_medicos: formatPen(
        parsePen(breakdown.aspiracion.honorarios_medicos) + delta,
      ),
      subtotal: formatPen(parsePen(breakdown.aspiracion.subtotal) + delta),
    },
    total_formatted: formatPen(parsePen(breakdown.total_formatted) + delta),
  };
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
  overrides: OrgPdfOverrides,
): Record<string, unknown> {
  const tier = props.tier ?? "A";
  const breakdown = applyHonorariosAdjustment(
    FIV_TIER_BREAKDOWNS[tier],
    props.honorariosAdjustment ?? 0,
  );

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
      // Línea "teléfonos · email" pre-unida para que la plantilla no
      // imprima un separador colgante cuando falta uno de los dos.
      contact_line: [overrides.phones, overrides.email]
        .filter(Boolean)
        .join(" · "),
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
      // Celular real del perfil de la asesora asignada; si no lo tiene,
      // el fallback resuelto (config explícita → teléfono de la org).
      phone: props.asesora?.phone || overrides.advisor_phone_fallback,
    },
    budget: {
      code: synthBudgetCode(props.budgetId, issuedAt),
      issued_at_short: format(issuedAt, "dd/MM/yyyy", { locale: es }),
      valid_until_short: format(validUntil, "dd/MM/yyyy", { locale: es }),
      // Always use the breakdown total — the per-line subtotals must
      // match the displayed total exactly, so we ignore `props.amount`
      // (which may be stale if the DB tier prices haven't been
      // updated to match the 2026-06-04 .docx revision). The honorarios
      // surcharge (mig 174) is already folded into `breakdown` above,
      // so total + aspiración line + subtotal all move together.
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
 *
 * `overrides` is the plugin's resolved config (defaults merged with
 * the org's row from `org_plugins.config`). Passed by the plugin
 * `render()` wrapper in lib/plugins/registry.ts so this function
 * stays decoupled from where the data came from.
 */
export async function renderFivHtmlPdf(
  props: BudgetPdfProps & { budgetId: string },
  overrides: OrgPdfOverrides,
): Promise<Buffer> {
  const template = await loadFivTemplate();
  const data = buildFivData(props, overrides);
  const html = template(data);

  // On Vercel we let @sparticuz/chromium provide the executable. For
  // local dev set CHROME_PATH=/Applications/Google Chrome.app/... (Mac)
  // or /usr/bin/google-chrome (Linux).
  //
  // setGraphicsMode must be set BEFORE executablePath() — sparticuz
  // reads it during binary resolution. With it left at the default
  // (true), cold-start extracts swiftshader libs into /tmp, which
  // frequently fails on serverless filesystems. PDF rendering doesn't
  // need WebGL, so we disable.
  chromium.setGraphicsMode = false;
  const executablePath =
    process.env.CHROME_PATH || (await chromium.executablePath());
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
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

// Routing is now done by the plugin resolver
// (`lib/plugins/active.ts:getActiveBudgetPdfPlugin`). Generator code
// no longer asks "is this a Vitra FIV budget?" — it asks "is there
// an installed plugin for this (org, treatment)?" and the registry
// answers.
