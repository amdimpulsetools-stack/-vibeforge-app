/**
 * Report Export Utilities — PDF & Excel
 *
 * PDF:  Captures the visible report content as screenshot(s) → multi-page A4 PDF
 * Excel: Structured data with KPIs + tables in separate sheets
 *
 * All heavy libs loaded via dynamic import() for code-splitting.
 */

import type { ReportExportConfig } from "./report-export-types";
export type { ReportExportConfig, ReportKPI, ReportTable } from "./report-export-types";

// ── PDF: Full-page screenshot export ──────────────────────────────

/**
 * Captures an HTML element (the entire report content area) and generates
 * a multi-page A4 PDF. What you see on screen is what you get in PDF.
 */
export async function exportContentPDF(
  element: HTMLElement,
  title: string,
  dateRange: { from: string; to: string },
  filename: string
) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  // Capture the full scrollable content at 2x for quality
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    logging: false,
    useCORS: true,
    // Capture full scrollable height, not just visible viewport
    windowHeight: element.scrollHeight,
    height: element.scrollHeight,
  });

  const imgData = canvas.toDataURL("image/png");

  // A4 dimensions in mm
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const headerHeight = 22;
  const footerHeight = 12;
  const contentWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - headerHeight - footerHeight - margin;

  // Scale image to fit page width
  const imgRatio = canvas.height / canvas.width;
  const scaledImgHeight = contentWidth * imgRatio;

  // Calculate how many pages we need
  const totalPages = Math.ceil(scaledImgHeight / usableHeight);

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage();

    // ── Header ──
    pdf.setFillColor(16, 185, 129);
    pdf.rect(0, 0, pageWidth, headerHeight, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(13);
    pdf.setFont("helvetica", "bold");
    pdf.text(title, margin, 10);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Período: ${dateRange.from} — ${dateRange.to}`, margin, 17);
    pdf.text(
      new Date().toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }),
      pageWidth - margin,
      17,
      { align: "right" }
    );

    // ── Content slice ──
    // Source coordinates in the original canvas
    const srcY = page * (canvas.height / totalPages * (usableHeight / (scaledImgHeight / totalPages)));
    const sliceHeight = Math.min(
      canvas.height - (page * canvas.height * usableHeight / scaledImgHeight),
      canvas.height * usableHeight / scaledImgHeight
    );

    // Create a slice canvas for this page
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = Math.max(1, Math.round(sliceHeight));
    const ctx = sliceCanvas.getContext("2d");
    if (ctx) {
      const sourceY = Math.round(page * canvas.height * usableHeight / scaledImgHeight);
      ctx.drawImage(
        canvas,
        0, sourceY,
        canvas.width, Math.round(sliceHeight),
        0, 0,
        sliceCanvas.width, sliceCanvas.height
      );
    }

    const sliceData = sliceCanvas.toDataURL("image/png");
    const sliceImgHeight = contentWidth * (sliceCanvas.height / sliceCanvas.width);

    pdf.addImage(
      sliceData,
      "PNG",
      margin,
      headerHeight + 2,
      contentWidth,
      Math.min(sliceImgHeight, usableHeight)
    );

    // ── Footer ──
    pdf.setFontSize(7);
    pdf.setTextColor(160, 160, 160);
    pdf.text(`Yenda — ${title}`, margin, pageHeight - 6);
    pdf.text(`Página ${page + 1} de ${totalPages}`, pageWidth - margin, pageHeight - 6, {
      align: "right",
    });
  }

  pdf.save(`${filename}.pdf`);
}

// ── Excel Export ───────────────────────────────────────────────────

export async function exportReportExcel(config: ReportExportConfig) {
  const XLSX = await import("xlsx");

  const wb = XLSX.utils.book_new();

  // Summary sheet with KPIs
  if (config.kpis.length > 0) {
    const summaryData = [
      [config.title],
      [`Período: ${config.dateRange.from} — ${config.dateRange.to}`],
      [`Generado: ${new Date().toLocaleString("es")}`],
      [],
      ["Indicador", "Valor"],
      ...config.kpis.map((kpi) => [kpi.label, kpi.value]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(summaryData);
    ws["!cols"] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, "Resumen");
  }

  // Data sheets for each table
  config.tables.forEach((table) => {
    const sheetData = [
      table.headers,
      ...table.rows.map((row) =>
        row.map((cell) =>
          typeof cell === "string" && !isNaN(Number(cell)) ? Number(cell) : cell
        )
      ),
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws["!cols"] = table.headers.map((h, i) => {
      const maxLen = Math.max(h.length, ...table.rows.map((r) => String(r[i] ?? "").length));
      return { wch: Math.min(maxLen + 4, 40) };
    });

    XLSX.utils.book_append_sheet(wb, ws, table.title.slice(0, 31));
  });

  XLSX.writeFile(wb, `${config.filename}.xlsx`);
}
