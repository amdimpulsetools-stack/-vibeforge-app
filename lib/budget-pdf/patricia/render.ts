/**
 * Render HTML → PDF del plugin `budget_pdf_patricia`
 * (REPROFERTILIDAD EIRL · Dra. Patricia Quispe).
 *
 * Mismo pipeline que el de Vitra — Handlebars → HTML → Puppeteer
 * headless chromium → Buffer — pero en un módulo aparte por tres
 * diferencias de fondo:
 *
 *   1. **Precio único, no tiers.** La org corre con
 *      `pricing_mode = 'single'` (mig 181): un precio cerrado por
 *      tratamiento. No hay tier A/B/C que resolver ni ajuste manual de
 *      honorarios que repartir, así que este render IGNORA
 *      `props.tier` y `props.honorariosAdjustment` (ver más abajo).
 *   2. **Routing por nombre de servicio.** 12 plantillas sobre 7
 *      tipos de tratamiento — `../routing.ts` explica por qué.
 *   3. **Partials.** Las plantillas de Patricia comparten cabecera,
 *      estilos, términos, firmas, tarifario NGS, etc. vía partials
 *      (`templates/patricia/partials/`). Las de Vitra no usan partials
 *      —cada .hbs lleva su CSS inline— así que registrarlos en el
 *      Handlebars global contaminaría su entorno. Aquí se crea un
 *      entorno AISLADO con `Handlebars.create()`: el render de Vitra
 *      queda bit a bit idéntico.
 *
 * El binario de chromium sale de `@sparticuz/chromium` igual que en
 * `../render-html.ts`; en dev local apunta `CHROME_PATH` a un Chrome
 * instalado.
 */

import fs from "fs/promises";
import path from "path";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Handlebars from "handlebars";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import type { BudgetPdfProps } from "../document";
import type { PatriciaPdfOverrides } from "./overrides";
import { resolvePatriciaRoute, type PatriciaRoute } from "./routing";
import {
  FIV_NGS_PRICES,
  SEMEN_DONADO,
  CONTROL_ECOGRAFICO_SUELTO,
  MANTENIMIENTO_MENSUAL,
  IIU_MEDICACION_OPCIONAL,
} from "./data/shared";
import { FIV } from "./data/fiv";
import { FIV_SEMEN_DONADO } from "./data/fiv-semen-donado";
import { FIV_MIXTO } from "./data/fiv-mixto";
import { OVODON } from "./data/ovodon";
import { OVODON_DONANTE_CONOCIDA } from "./data/ovodon-donante-conocida";
import { OVODON_SEMEN_DONADO } from "./data/ovodon-semen-donado";
import { DUOSTIM } from "./data/duostim";
import { CRIO } from "./data/crio";
import { TED } from "./data/ted";
import { IIU } from "./data/iiu";
import { IIU_SEMEN_DONADO } from "./data/iiu-semen-donado";
import { ROPA } from "./data/ropa";
import type { PatriciaRouteKey } from "./routing";

type RenderProps = BudgetPdfProps & { budgetId: string };

const TEMPLATES_DIR = "lib/budget-pdf/templates/patricia";
const PARTIALS_DIR = `${TEMPLATES_DIR}/partials`;

/** Partials compartidos por las 12 plantillas. El nombre = el del archivo. */
const PARTIAL_NAMES = [
  "styles",
  "head",
  "docEnd",
  "pageFooter",
  "sheetHead",
  "runHead",
  "titleRow",
  "meta",
  "total",
  "semenDonado",
  "ngs",
  "consideracionesEmbriones",
  "evaluaciones",
  "terminos",
  "firmas",
] as const;

/**
 * Entorno Handlebars propio del plugin. Aislarlo del singleton que usa
 * `../render-html.ts` es lo que garantiza cero regresión en Vitra: los
 * partials de Patricia no existen fuera de aquí.
 */
const hbs = Handlebars.create();

/** Plantillas compiladas, cacheadas mientras la instancia siga caliente. */
const cachedTemplates = new Map<string, HandlebarsTemplateDelegate>();
let partialsLoaded = false;

async function loadPartialsOnce(): Promise<void> {
  if (partialsLoaded) return;
  await Promise.all(
    PARTIAL_NAMES.map(async (name) => {
      const source = await fs.readFile(
        path.join(process.cwd(), PARTIALS_DIR, `${name}.hbs`),
        "utf8",
      );
      hbs.registerPartial(name, source);
    }),
  );
  partialsLoaded = true;
}

async function loadTemplate(
  templateFile: string,
): Promise<HandlebarsTemplateDelegate> {
  await loadPartialsOnce();
  const cached = cachedTemplates.get(templateFile);
  if (cached) return cached;
  const source = await fs.readFile(
    path.join(process.cwd(), TEMPLATES_DIR, templateFile),
    "utf8",
  );
  const compiled = hbs.compile(source, { noEscape: false });
  cachedTemplates.set(templateFile, compiled);
  return compiled;
}

/**
 * Código legible del presupuesto. La BD todavía no guarda uno, así que
 * se sintetiza a partir del año + la cola del UUID — estable entre
 * renders del mismo presupuesto. Mismo formato que el de Vitra
 * (`../render-html.ts:synthBudgetCode`), reimplementado aquí para no
 * tocar aquel archivo.
 */
function synthBudgetCode(budgetId: string, issuedAt: Date): string {
  const year = issuedAt.getFullYear();
  const tail = budgetId.replace(/-/g, "").slice(-4).toUpperCase();
  return `P-${year}-${tail}`;
}

/**
 * Desglose por plantilla. `phases` es lo único que cambia entre
 * presupuestos; el resto del contexto es común.
 *
 * NO se aplica `props.honorariosAdjustment` (mig 174) a propósito: son
 * precios fijos cerrados, la UI de esta org no ofrece ajuste manual de
 * honorarios y sumarlo aquí descuadraría el total impreso respecto a
 * los subtotales de fase — justo lo que el reparto proporcional de
 * Vitra (`../honorarios-fold.ts`) existe para evitar. Si la clínica
 * pide algún día honorarios ajustables, el camino es replicar ese
 * reparto por plantilla, no sumar el delta al total a secas.
 */
const BREAKDOWNS: Record<
  PatriciaRouteKey,
  { phases: Record<string, unknown>; total_formatted: string }
> = {
  FIV: {
    phases: { fiv: FIV.fiv, transferencia: FIV.transferencia },
    total_formatted: FIV.total_formatted,
  },
  FIV_SEMEN_DONADO: {
    phases: {
      fiv: FIV_SEMEN_DONADO.fiv,
      transferencia: FIV_SEMEN_DONADO.transferencia,
    },
    total_formatted: FIV_SEMEN_DONADO.total_formatted,
  },
  FIV_MIXTO: {
    phases: {
      donante: FIV_MIXTO.donante,
      paciente: FIV_MIXTO.paciente,
      fiv: FIV_MIXTO.fiv,
      transferencia: FIV_MIXTO.transferencia,
    },
    total_formatted: FIV_MIXTO.total_formatted,
  },
  OVODON: {
    phases: { fiv: OVODON.fiv, transferencia: OVODON.transferencia },
    total_formatted: OVODON.total_formatted,
  },
  OVODON_DONANTE_CONOCIDA: {
    phases: {
      fiv: OVODON_DONANTE_CONOCIDA.fiv,
      transferencia: OVODON_DONANTE_CONOCIDA.transferencia,
    },
    total_formatted: OVODON_DONANTE_CONOCIDA.total_formatted,
  },
  OVODON_SEMEN_DONADO: {
    phases: {
      fiv: OVODON_SEMEN_DONADO.fiv,
      transferencia: OVODON_SEMEN_DONADO.transferencia,
    },
    total_formatted: OVODON_SEMEN_DONADO.total_formatted,
  },
  DUOSTIM: {
    phases: {
      primera: DUOSTIM.primera,
      segunda: DUOSTIM.segunda,
      transferencia: DUOSTIM.transferencia,
    },
    total_formatted: DUOSTIM.total_formatted,
  },
  CRIO: {
    phases: { fase: CRIO.fase },
    total_formatted: CRIO.total_formatted,
  },
  TED: {
    phases: { transferencia: TED.transferencia },
    total_formatted: TED.total_formatted,
  },
  IIU: {
    // Paquete cerrado: sin ítems valorizados, la plantilla imprime la
    // lista de lo incluido y el total.
    phases: {},
    total_formatted: IIU.total_formatted,
  },
  IIU_SEMEN_DONADO: {
    phases: {},
    total_formatted: IIU_SEMEN_DONADO.total_formatted,
  },
  ROPA: {
    phases: { donante: ROPA.donante, receptora: ROPA.receptora },
    total_formatted: ROPA.total_formatted,
  },
};

/**
 * Contexto Handlebars completo. El bloque `org` sale íntegro de los
 * datos reales de la organización (resueltos en `./overrides.ts`) y el
 * de paciente/médico/asesora, del presupuesto real del sistema — nunca
 * de los .docx, que traían pacientes reales escritos a mano.
 */
function buildData(
  props: RenderProps,
  overrides: PatriciaPdfOverrides,
  route: PatriciaRoute,
): Record<string, unknown> {
  const issuedAt = props.fecha;
  const validUntil = new Date(issuedAt);
  validUntil.setDate(validUntil.getDate() + props.vigenciaDays);

  const patientName =
    [props.patient.firstName, props.patient.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || "—";
  const documentLabel = props.patient.documentNumber
    ? `DNI ${props.patient.documentNumber}`
    : "—";

  const breakdown = BREAKDOWNS[route.key];

  return {
    doc: { title: route.title },
    org: {
      legal_name: props.org.name,
      tax_id: props.org.ruc ?? "",
      logo_url: props.org.logoDataUrl ?? "",
      brand_color: overrides.brand_color,
      address: overrides.address,
      // "teléfonos · email" pre-unido para que la plantilla no imprima
      // un separador colgante cuando falta uno de los dos.
      contact_line: [overrides.phones, overrides.email]
        .filter(Boolean)
        .join(" · "),
      website: overrides.website,
      footer_html: overrides.footer_html,
    },
    patient: { full_name: patientName, document_label: documentLabel },
    doctor: {
      full_name: props.doctor.fullName,
      license: overrides.doctor_license,
    },
    advisor: {
      full_name: props.asesora?.fullName ?? "—",
      phone: props.asesora?.phone || overrides.advisor_phone_fallback,
    },
    budget: {
      code: synthBudgetCode(props.budgetId, issuedAt),
      issued_at_short: format(issuedAt, "dd/MM/yyyy", { locale: es }),
      valid_until_short: format(validUntil, "dd/MM/yyyy", { locale: es }),
      // Siempre el total del desglose: las líneas impresas y el total
      // tienen que cuadrar exactamente, aunque `budget_records.amount`
      // se haya quedado atrás respecto a esta revisión de tarifario.
      total_formatted: breakdown.total_formatted,
    },
    phases: breakdown.phases,
    ngs: FIV_NGS_PRICES,
    semen: SEMEN_DONADO,
    extras: {
      control_ecografico: CONTROL_ECOGRAFICO_SUELTO,
      mantenimiento_mensual: MANTENIMIENTO_MENSUAL,
      iiu_medicacion: IIU_MEDICACION_OPCIONAL,
    },
  };
}

/** Compila la plantilla y devuelve el HTML — útil para tests sin chromium. */
export async function renderPatriciaBudgetHtml(
  props: RenderProps,
  overrides: PatriciaPdfOverrides,
): Promise<string> {
  const route = resolvePatriciaRoute(
    props.service.treatmentType,
    props.service.name,
  );
  if (!route) {
    throw new Error(
      `renderPatriciaBudgetPdf: no hay plantilla para el servicio ` +
        `"${props.service.name}" (tipo "${props.service.treatmentType}"). ` +
        `Si es "Banking de ovocitos", está pendiente de confirmación del ` +
        `founder — ver lib/budget-pdf/patricia/routing.ts.`,
    );
  }
  const template = await loadTemplate(route.templateFile);
  return template(buildData(props, overrides, route));
}

/**
 * Renderiza el presupuesto a PDF (A4). `overrides` es la config
 * resuelta del plugin (defaults + `org_plugins.config` + datos reales
 * de la org), que inyecta el wrapper `render()` del registry.
 */
export async function renderPatriciaBudgetPdf(
  props: RenderProps,
  overrides: PatriciaPdfOverrides,
): Promise<Buffer> {
  const html = await renderPatriciaBudgetHtml(props, overrides);

  // setGraphicsMode debe fijarse ANTES de executablePath(): sparticuz lo
  // lee al resolver el binario. Con el default (true) el arranque en
  // frío extrae las libs de swiftshader a /tmp y falla a menudo en
  // serverless; el PDF no necesita WebGL.
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
    // `load` espera la hoja de Google Fonts; las plantillas no traen JS.
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
