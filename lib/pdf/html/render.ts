/**
 * Plantillas Handlebars de los documentos base de Yenda.
 *
 *   lib/pdf/html/partials/*.hbs   partials compartidos (estilos, membrete,
 *                                 metadatos, firma, pie, cierre)
 *   lib/pdf/html/templates/*.hbs  un documento por archivo
 *
 * Entorno Handlebars AISLADO (`Handlebars.create()`), igual que el
 * plugin de Patricia: registrar partials/helpers en el global
 * contaminaría los templates de Vitra, que llevan su CSS inline.
 *
 * Uso típico desde una ruta:
 *   const html = await renderDocumentHtml("prescription.hbs", data);
 *   const pdf  = await htmlToPdfBuffer(html);
 */

import fs from "fs/promises";
import path from "path";
import Handlebars from "handlebars";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const PARTIALS_DIR = path.join(process.cwd(), "lib/pdf/html/partials");
const TEMPLATES_DIR = path.join(process.cwd(), "lib/pdf/html/templates");

let envPromise: Promise<typeof Handlebars> | null = null;
const compiled = new Map<string, HandlebarsTemplateDelegate>();

function formatMoney(value: unknown, currency: unknown): string {
  const n = Number(value ?? 0);
  const cur = currency === "USD" ? "US$" : "S/";
  return `${cur} ${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "2026-09-05" | Date → "5 de septiembre de 2026". */
export function formatLongDate(value: unknown): string {
  if (!value) return "";
  const d =
    value instanceof Date
      ? value
      : new Date(
          typeof value === "string" && !value.includes("T")
            ? `${value}T12:00:00`
            : String(value),
        );
  if (Number.isNaN(d.getTime())) return String(value);
  return format(d, "d 'de' MMMM 'de' yyyy", { locale: es });
}

/** "2026-09-05" | Date → "05/09/2026". */
export function formatShortDate(value: unknown): string {
  if (!value) return "";
  const d =
    value instanceof Date
      ? value
      : new Date(
          typeof value === "string" && !value.includes("T")
            ? `${value}T12:00:00`
            : String(value),
        );
  if (Number.isNaN(d.getTime())) return String(value);
  return format(d, "dd/MM/yyyy");
}

async function buildEnv(): Promise<typeof Handlebars> {
  const hb = Handlebars.create();

  hb.registerHelper("eq", (a: unknown, b: unknown) => a === b);
  hb.registerHelper("inc", (n: unknown) => Number(n) + 1);
  hb.registerHelper("money", (v: unknown, cur?: unknown) =>
    formatMoney(v, typeof cur === "string" ? cur : "PEN"),
  );
  hb.registerHelper("longDate", (v: unknown) => formatLongDate(v));
  hb.registerHelper("shortDate", (v: unknown) => formatShortDate(v));
  // Texto libre con saltos de línea → <br>, escapando el resto.
  hb.registerHelper("nl2br", (v: unknown) => {
    const escaped = hb.Utils.escapeExpression(String(v ?? ""));
    return new hb.SafeString(escaped.replace(/\r?\n/g, "<br>"));
  });
  hb.registerHelper("join", (arr: unknown, sep: unknown) =>
    Array.isArray(arr)
      ? arr.filter(Boolean).join(typeof sep === "string" ? sep : " · ")
      : "",
  );

  const files = await fs.readdir(PARTIALS_DIR);
  await Promise.all(
    files
      .filter((f) => f.endsWith(".hbs"))
      .map(async (f) => {
        const src = await fs.readFile(path.join(PARTIALS_DIR, f), "utf8");
        hb.registerPartial(f.replace(/\.hbs$/, ""), src);
      }),
  );
  return hb;
}

async function getEnv(): Promise<typeof Handlebars> {
  if (!envPromise) envPromise = buildEnv();
  return envPromise;
}

/**
 * Compila (y cachea por instancia serverless caliente) una plantilla de
 * `lib/pdf/html/templates/` y la renderiza con `data`.
 */
export async function renderDocumentHtml(
  templateFile: string,
  data: Record<string, unknown>,
): Promise<string> {
  const hb = await getEnv();
  let tpl = compiled.get(templateFile);
  if (!tpl) {
    const src = await fs.readFile(path.join(TEMPLATES_DIR, templateFile), "utf8");
    tpl = hb.compile(src, { noEscape: false });
    compiled.set(templateFile, tpl);
  }
  return tpl(data);
}
