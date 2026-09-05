/**
 * Vista previa local de una plantilla del motor HTML de documentos.
 *
 *   CHROME_PATH=/ruta/a/chrome npx tsx scripts/pdf-preview.ts <plantilla.hbs> <fixture.json> <salida-sin-ext>
 *
 * Genera <salida>.html, <salida>.pdf y <salida>.png (captura de la
 * primera hoja) para revisar el diseño sin levantar la app. Los fixtures
 * de ejemplo viven en scripts/pdf-fixtures/. No se usa en producción.
 */

import fs from "fs/promises";
import path from "path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { renderDocumentHtml } from "../lib/pdf/html/render";

async function main() {
  const [templateFile, fixturePath, outBase] = process.argv.slice(2);
  if (!templateFile || !fixturePath || !outBase) {
    console.error(
      "uso: npx tsx scripts/pdf-preview.ts <plantilla.hbs> <fixture.json> <salida-sin-ext>",
    );
    process.exit(1);
  }
  const data = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  const html = await renderDocumentHtml(templateFile, data);
  await fs.mkdir(path.dirname(outBase), { recursive: true });
  await fs.writeFile(`${outBase}.html`, html, "utf8");

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
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await fs.writeFile(`${outBase}.pdf`, pdf);
    await page.setViewport({ width: 900, height: 1280, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    await page.screenshot({ path: `${outBase}.png`, fullPage: true });
    console.log(`ok → ${outBase}.{html,pdf,png}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
