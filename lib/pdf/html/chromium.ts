/**
 * Motor único de PDF de Yenda: HTML → Chromium headless → PDF (A4).
 *
 * Es el mismo pipeline que ya corre en producción para los plugins de
 * presupuestos (`lib/budget-pdf/render-html.ts`, `patricia/render.ts`),
 * extraído para que TODOS los documentos base (receta, orden de examen,
 * presupuesto genérico, …) impriman con el mismo lanzador. Los plugins
 * de Vitra y Patricia no se tocan: siguen con su copia local hasta que
 * se decida migrarlos.
 *
 * Vercel: `@sparticuz/chromium` provee el binario (linux x86_64). En dev
 * local (Mac, o este sandbox) `CHROME_PATH` apunta a un Chrome instalado.
 */

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export interface HtmlToPdfOptions {
  /** Tiempo máximo esperando `load` (fuentes de Google). Default 15 s. */
  loadTimeoutMs?: number;
}

export async function htmlToPdfBuffer(
  html: string,
  opts: HtmlToPdfOptions = {},
): Promise<Buffer> {
  // Debe fijarse ANTES de executablePath(): con el default (true) el
  // arranque en frío extrae swiftshader a /tmp y falla en serverless.
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
    // `load` espera la hoja de Google Fonts; si la red la bloquea, el
    // evento igual dispara (con fallback de fuente) o vence el timeout.
    await page.setContent(html, {
      waitUntil: "load",
      timeout: opts.loadTimeoutMs ?? 15_000,
    });
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
