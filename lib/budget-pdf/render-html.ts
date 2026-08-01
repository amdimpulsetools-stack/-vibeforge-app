/**
 * HTML → PDF render path for tier-style fertility budgets (Phase 5).
 *
 * Switched per-org from `generate.tsx`. NATURVITRA's templates cover
 * FIV, CRIO, IIU, TED, DUO STIM, ROPA and OVODON (`templates/*.hbs`),
 * routed by `props.service.treatmentType`. The data shape per tier
 * (A/B/C) lives in `data/*-tiers.ts`; the per-org footer/header
 * overrides live in `data/vitra-overrides.ts`. The honorarios
 * adjustment (mig 174) is split across each treatment's honorarios
 * lines via `honorarios-fold.ts` (proportional, S/10 steps).
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
} from "./data/fiv-tiers";
import { CRIO_TIER_BREAKDOWNS } from "./data/crio-tiers";
import { IIU_TIER_BREAKDOWNS } from "./data/iiu-tiers";
import { TED_TIER_BREAKDOWNS } from "./data/ted-tiers";
import { DUOSTIM_TIER_BREAKDOWNS } from "./data/duostim-tiers";
import { ROPA_TIER_BREAKDOWNS } from "./data/ropa-tiers";
import { OVODON_TIER_BREAKDOWNS } from "./data/ovodon-tiers";
import type { OrgPdfOverrides } from "./data/vitra-overrides";
import {
  addCents,
  centsOf,
  distributeHonorarios,
} from "./honorarios-fold";

type RenderProps = BudgetPdfProps & { budgetId: string };

// One compiled template per treatment type, cached across invocations
// of the same warm serverless instance.
const cachedTemplates = new Map<string, HandlebarsTemplateDelegate>();

async function loadTemplate(
  templateFile: string,
): Promise<HandlebarsTemplateDelegate> {
  const cached = cachedTemplates.get(templateFile);
  if (cached) return cached;
  const templatePath = path.join(
    process.cwd(),
    "lib/budget-pdf/templates",
    templateFile,
  );
  const source = await fs.readFile(templatePath, "utf8");
  const compiled = Handlebars.compile(source, { noEscape: false });
  cachedTemplates.set(templateFile, compiled);
  return compiled;
}

/** Effective tier, defaulting to A like the original FIV path. */
function resolveTier(props: RenderProps): "A" | "B" | "C" {
  return props.tier ?? "A";
}

/** Ajuste de honorarios (mig 174) en céntimos enteros; 0 = sin fold. */
function honorariosDeltaCents(props: RenderProps): number {
  const d = props.honorariosAdjustment ?? 0;
  return d > 0 ? Math.round(d * 100) : 0;
}

/**
 * Builds the Handlebars data shared by every treatment template:
 * org/brand block, patient, doctor, advisor, budget code + dates.
 * The per-treatment builders add `phases` + `budget.total_formatted`.
 */
function buildCommonData(
  props: RenderProps,
  overrides: OrgPdfOverrides,
): {
  org: Record<string, unknown>;
  patient: Record<string, unknown>;
  doctor: Record<string, unknown>;
  advisor: Record<string, unknown>;
  budget: { code: string; issued_at_short: string; valid_until_short: string };
} {
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
    },
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
 *
 * Honorarios fold (mig 174 + reparto 2026-08): el delta se distribuye
 * proporcionalmente entre las DOS líneas de honorarios (aspiración y
 * transferencia) vía `distributeHonorarios` — múltiplos de S/ 10,
 * resto a la línea mayor. La paciente no ve línea de "ajuste": cada
 * línea, su subtotal de fase y el total general se mueven juntos y
 * todo sigue cuadrando al céntimo.
 */
function buildFivData(
  props: RenderProps,
  overrides: OrgPdfOverrides,
): Record<string, unknown> {
  const base = FIV_TIER_BREAKDOWNS[resolveTier(props)];
  const delta = honorariosDeltaCents(props);
  let breakdown = base;
  if (delta) {
    const [dAsp, dTra] = distributeHonorarios(
      [
        centsOf(base.aspiracion.honorarios_medicos),
        centsOf(base.transferencia.honorarios_medicos),
      ],
      delta,
    );
    breakdown = {
      ...base,
      aspiracion: {
        ...base.aspiracion,
        honorarios_medicos: addCents(base.aspiracion.honorarios_medicos, dAsp),
        subtotal: addCents(base.aspiracion.subtotal, dAsp),
      },
      transferencia: {
        ...base.transferencia,
        honorarios_medicos: addCents(
          base.transferencia.honorarios_medicos,
          dTra,
        ),
        subtotal: addCents(base.transferencia.subtotal, dTra),
      },
      total_formatted: addCents(base.total_formatted, delta),
    };
  }

  const common = buildCommonData(props, overrides);
  return {
    ...common,
    budget: {
      ...common.budget,
      // Always use the breakdown total — the per-line subtotals must
      // match the displayed total exactly, so we ignore `props.amount`
      // (which may be stale if the DB tier prices haven't been
      // updated to match the .docx revision). The honorarios
      // surcharge (mig 174) is already folded into `breakdown` above,
      // so total + línea de honorarios + subtotal all move together.
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
 * CRIO — single phase, ÚNICA línea de honorarios: el reparto degenera
 * al comportamiento histórico (todo el delta a esa línea); subtotal y
 * total se mueven juntos.
 */
function buildCrioData(
  props: RenderProps,
  overrides: OrgPdfOverrides,
): Record<string, unknown> {
  const base = CRIO_TIER_BREAKDOWNS[resolveTier(props)];
  const delta = honorariosDeltaCents(props);
  const breakdown = !delta
    ? base
    : {
        fase: {
          ...base.fase,
          honorarios_medicos: addCents(base.fase.honorarios_medicos, delta),
          subtotal: addCents(base.fase.subtotal, delta),
        },
        total_formatted: addCents(base.total_formatted, delta),
      };

  const common = buildCommonData(props, overrides);
  return {
    ...common,
    budget: { ...common.budget, total_formatted: breakdown.total_formatted },
    phases: { fase: breakdown.fase },
  };
}

/**
 * IIU — single phase, única línea de honorarios: reparto degenerado
 * (todo el delta a esa línea); subtotal + total move together.
 */
function buildIiuData(
  props: RenderProps,
  overrides: OrgPdfOverrides,
): Record<string, unknown> {
  const base = IIU_TIER_BREAKDOWNS[resolveTier(props)];
  const delta = honorariosDeltaCents(props);
  const breakdown = !delta
    ? base
    : {
        procedimiento: {
          ...base.procedimiento,
          honorarios_medicos: addCents(
            base.procedimiento.honorarios_medicos,
            delta,
          ),
          subtotal: addCents(base.procedimiento.subtotal, delta),
        },
        total_formatted: addCents(base.total_formatted, delta),
      };

  const common = buildCommonData(props, overrides);
  return {
    ...common,
    budget: { ...common.budget, total_formatted: breakdown.total_formatted },
    phases: { procedimiento: breakdown.procedimiento },
  };
}

/**
 * TED — single phase, única línea de honorarios: reparto degenerado
 * (todo el delta a esa línea); subtotal + total move together.
 */
function buildTedData(
  props: RenderProps,
  overrides: OrgPdfOverrides,
): Record<string, unknown> {
  const base = TED_TIER_BREAKDOWNS[resolveTier(props)];
  const delta = honorariosDeltaCents(props);
  const breakdown = !delta
    ? base
    : {
        transferencia: {
          ...base.transferencia,
          honorario_medico: addCents(
            base.transferencia.honorario_medico,
            delta,
          ),
          subtotal: addCents(base.transferencia.subtotal, delta),
        },
        total_formatted: addCents(base.total_formatted, delta),
      };

  const common = buildCommonData(props, overrides);
  return {
    ...common,
    budget: { ...common.budget, total_formatted: breakdown.total_formatted },
    phases: { transferencia: breakdown.transferencia },
  };
}

/**
 * DUO STIM — dos estimulaciones ováricas completas + transferencia:
 * TRES líneas de honorarios. El reparto proporcional evita que todo
 * el ajuste caiga en la 1.ª estimulación (dos procedimientos casi
 * idénticos con honorarios muy distintos delatarían el sobreprecio
 * dentro del propio documento). Cada incremento arrastra el subtotal
 * de su fase de aspiración Y el subtotal de su bloque de estimulación.
 */
function buildDuostimData(
  props: RenderProps,
  overrides: OrgPdfOverrides,
): Record<string, unknown> {
  const base = DUOSTIM_TIER_BREAKDOWNS[resolveTier(props)];
  const delta = honorariosDeltaCents(props);
  let breakdown = base;
  if (delta) {
    const [d1, d2, dTra] = distributeHonorarios(
      [
        centsOf(base.primera.aspiracion.honorarios_medicos),
        centsOf(base.segunda.aspiracion.honorarios_medicos),
        centsOf(base.transferencia.honorario_medico),
      ],
      delta,
    );
    breakdown = {
      primera: {
        ...base.primera,
        aspiracion: {
          ...base.primera.aspiracion,
          honorarios_medicos: addCents(
            base.primera.aspiracion.honorarios_medicos,
            d1,
          ),
          subtotal: addCents(base.primera.aspiracion.subtotal, d1),
        },
        subtotal: addCents(base.primera.subtotal, d1),
      },
      segunda: {
        ...base.segunda,
        aspiracion: {
          ...base.segunda.aspiracion,
          honorarios_medicos: addCents(
            base.segunda.aspiracion.honorarios_medicos,
            d2,
          ),
          subtotal: addCents(base.segunda.aspiracion.subtotal, d2),
        },
        subtotal: addCents(base.segunda.subtotal, d2),
      },
      transferencia: {
        ...base.transferencia,
        honorario_medico: addCents(base.transferencia.honorario_medico, dTra),
        subtotal: addCents(base.transferencia.subtotal, dTra),
      },
      total_formatted: addCents(base.total_formatted, delta),
    };
  }

  const common = buildCommonData(props, overrides);
  return {
    ...common,
    budget: { ...common.budget, total_formatted: breakdown.total_formatted },
    phases: {
      primera: breakdown.primera,
      segunda: breakdown.segunda,
      transferencia: breakdown.transferencia,
    },
    ngs: FIV_NGS_PRICES,
  };
}

/**
 * ROPA — tratamiento donante (ciclo FIV) + tratamiento receptora
 * (transferencia): DOS líneas de honorarios repartidas. El incremento
 * de la donante arrastra subtotal de aspiración + subtotal del bloque
 * donante; el de la receptora, su único subtotal.
 */
function buildRopaData(
  props: RenderProps,
  overrides: OrgPdfOverrides,
): Record<string, unknown> {
  const base = ROPA_TIER_BREAKDOWNS[resolveTier(props)];
  const delta = honorariosDeltaCents(props);
  let breakdown = base;
  if (delta) {
    const [dDon, dRec] = distributeHonorarios(
      [
        centsOf(base.donante.aspiracion.honorarios_medicos),
        centsOf(base.receptora.honorario_medico),
      ],
      delta,
    );
    breakdown = {
      donante: {
        ...base.donante,
        aspiracion: {
          ...base.donante.aspiracion,
          honorarios_medicos: addCents(
            base.donante.aspiracion.honorarios_medicos,
            dDon,
          ),
          subtotal: addCents(base.donante.aspiracion.subtotal, dDon),
        },
        subtotal: addCents(base.donante.subtotal, dDon),
      },
      receptora: {
        ...base.receptora,
        honorario_medico: addCents(base.receptora.honorario_medico, dRec),
        subtotal: addCents(base.receptora.subtotal, dRec),
      },
      total_formatted: addCents(base.total_formatted, delta),
    };
  }

  const common = buildCommonData(props, overrides);
  return {
    ...common,
    budget: { ...common.budget, total_formatted: breakdown.total_formatted },
    phases: {
      donante: breakdown.donante,
      receptora: breakdown.receptora,
    },
    ngs: FIV_NGS_PRICES,
  };
}

/**
 * OVODONACIÓN + NGS — estimulación (óvulos de donante + honorarios) +
 * FIV incluida + primera transferencia: DOS líneas de honorarios
 * repartidas (así fijó Vitra su propio tier A: +1,080 estimulación /
 * +350 transferencia sobre el docx).
 */
function buildOvodonData(
  props: RenderProps,
  overrides: OrgPdfOverrides,
): Record<string, unknown> {
  const base = OVODON_TIER_BREAKDOWNS[resolveTier(props)];
  const delta = honorariosDeltaCents(props);
  let breakdown = base;
  if (delta) {
    const [dEst, dTra] = distributeHonorarios(
      [
        centsOf(base.estimulacion.honorarios_medicos),
        centsOf(base.transferencia.honorarios_medicos),
      ],
      delta,
    );
    breakdown = {
      ...base,
      estimulacion: {
        ...base.estimulacion,
        honorarios_medicos: addCents(
          base.estimulacion.honorarios_medicos,
          dEst,
        ),
        subtotal: addCents(base.estimulacion.subtotal, dEst),
      },
      transferencia: {
        ...base.transferencia,
        honorarios_medicos: addCents(
          base.transferencia.honorarios_medicos,
          dTra,
        ),
        subtotal: addCents(base.transferencia.subtotal, dTra),
      },
      total_formatted: addCents(base.total_formatted, delta),
    };
  }

  const common = buildCommonData(props, overrides);
  return {
    ...common,
    budget: { ...common.budget, total_formatted: breakdown.total_formatted },
    phases: {
      estimulacion: breakdown.estimulacion,
      fiv: breakdown.fiv,
      transferencia: breakdown.transferencia,
    },
    ngs: FIV_NGS_PRICES,
  };
}

/**
 * Router — treatmentType → { template file, data builder }. Adding a
 * new treatment = new .hbs + new data file + one entry here (and
 * widening `applies_to.treatment_types` in the plugin registry).
 */
export const TEMPLATE_ROUTES: Record<
  string,
  {
    templateFile: string;
    buildData: (
      props: RenderProps,
      overrides: OrgPdfOverrides,
    ) => Record<string, unknown>;
  }
> = {
  FIV: { templateFile: "FIV.hbs", buildData: buildFivData },
  CRIO: { templateFile: "CRIO.hbs", buildData: buildCrioData },
  IIU: { templateFile: "IIU.hbs", buildData: buildIiuData },
  TED: { templateFile: "TED.hbs", buildData: buildTedData },
  DUOSTIM: { templateFile: "DUOSTIM.hbs", buildData: buildDuostimData },
  ROPA: { templateFile: "ROPA.hbs", buildData: buildRopaData },
  OVODONACION: { templateFile: "OVODON.hbs", buildData: buildOvodonData },
};

/**
 * Render the budget template + data into a final PDF buffer (A4),
 * routed by `props.service.treatmentType`.
 *
 * `overrides` is the plugin's resolved config (defaults merged with
 * the org's row from `org_plugins.config`). Passed by the plugin
 * `render()` wrapper in lib/plugins/registry.ts so this function
 * stays decoupled from where the data came from. The registry's
 * `applies_to.treatment_types` guard means unknown treatments never
 * reach this point in practice; we still throw a clear error.
 */
export async function renderBudgetHtmlPdf(
  props: RenderProps,
  overrides: OrgPdfOverrides,
): Promise<Buffer> {
  const route = TEMPLATE_ROUTES[props.service.treatmentType];
  if (!route) {
    throw new Error(
      `renderBudgetHtmlPdf: no template for treatment type "${props.service.treatmentType}"`,
    );
  }
  const template = await loadTemplate(route.templateFile);
  const data = route.buildData(props, overrides);
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
    // `load` waits for the Google Fonts stylesheet; the templates ship
    // no JS so there's nothing further to settle.
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

// Routing between plugins is done by the plugin resolver
// (`lib/plugins/active.ts:getActiveBudgetPdfPlugin`). Generator code
// no longer asks "is this a Vitra FIV budget?" — it asks "is there
// an installed plugin for this (org, treatment)?" and the registry
// answers; this module then routes to the treatment's template.
