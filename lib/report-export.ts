/**
 * Report Export Utilities — PDF & Excel
 * Uses dynamic imports so heavy libs (jsPDF, xlsx, html2canvas) only load
 * on demand in the browser, avoiding Next.js server-side resolution issues.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface ReportKPI {
  label: string;
  value: string;
}

export interface ReportTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  /** Column alignments: 'left' | 'center' | 'right' */
  columnAligns?: ("left" | "center" | "right")[];
}

export interface ReportExportConfig {
  title: string;
  subtitle?: string;
  dateRange: { from: string; to: string };
  kpis: ReportKPI[];
  tables: ReportTable[];
  /** DOM elements containing charts to capture as images */
  chartRefs?: (HTMLElement | null)[];
  filename: string;
}

// ── PDF Export ─────────────────────────────────────────────────────

export async function exportReportPDF(config: ReportExportConfig) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { default: html2canvas } = await import("html2canvas");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ── Header bar ──
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.rect(0, 0, pageWidth, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(config.title, margin, 12);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    config.subtitle ?? `Período: ${config.dateRange.from} — ${config.dateRange.to}`,
    margin,
    19
  );

  const dateStr = `Generado: ${new Date().toLocaleDateString("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
  doc.setFontSize(8);
  doc.text(dateStr, pageWidth - margin, 19, { align: "right" });

  y = 34;

  // ── KPI Cards ──
  if (config.kpis.length > 0) {
    const kpiCount = Math.min(config.kpis.length, 6);
    const kpiWidth = (contentWidth - (kpiCount - 1) * 3) / kpiCount;

    config.kpis.slice(0, 6).forEach((kpi, i) => {
      const x = margin + i * (kpiWidth + 3);

      // Card background
      doc.setFillColor(245, 245, 245);
      doc.setDrawColor(220, 220, 220);
      doc.roundedRect(x, y, kpiWidth, 18, 2, 2, "FD");

      // Label
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(kpi.label, x + kpiWidth / 2, y + 6, { align: "center" });

      // Value
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(kpi.value, x + kpiWidth / 2, y + 14, { align: "center" });
    });

    y += 24;
  }

  // ── Charts (captured as images) ──
  if (config.chartRefs?.length) {
    for (const chartEl of config.chartRefs) {
      if (!chartEl) continue;

      try {
        const canvas = await html2canvas(chartEl, {
          backgroundColor: "#ffffff",
          scale: 2,
          logging: false,
          useCORS: true,
        });

        const imgData = canvas.toDataURL("image/png");
        const imgRatio = canvas.width / canvas.height;
        const imgWidth = contentWidth;
        const imgHeight = imgWidth / imgRatio;

        // Check if chart fits on current page
        if (y + imgHeight > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage();
          y = margin;
        }

        doc.addImage(imgData, "PNG", margin, y, imgWidth, imgHeight);
        y += imgHeight + 6;
      } catch {
        // If chart capture fails, skip silently
      }
    }
  }

  // ── Tables ──
  for (const table of config.tables) {
    // Check if we need a new page
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = margin;
    }

    // Table title
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(table.title, margin, y + 4);
    y += 8;

    // Build column styles
    const columnStyles: Record<number, { halign: "left" | "center" | "right" }> = {};
    if (table.columnAligns) {
      table.columnAligns.forEach((align, i) => {
        columnStyles[i] = { halign: align };
      });
    }

    autoTable(doc, {
      startY: y,
      head: [table.headers],
      body: table.rows.map((row) => row.map((cell) => String(cell))),
      margin: { left: margin, right: margin },
      theme: "grid",
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
        halign: "center",
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [50, 50, 50],
        cellPadding: 2.5,
      },
      alternateRowStyles: {
        fillColor: [248, 248, 248],
      },
      columnStyles,
      didDrawPage: () => {
        // Footer on each page
        const pageH = doc.internal.pageSize.getHeight();
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 160);
        doc.text(
          `VibeForge — ${config.title}`,
          margin,
          pageH - 8
        );
        doc.text(
          `Página ${doc.getNumberOfPages()}`,
          pageWidth - margin,
          pageH - 8,
          { align: "right" }
        );
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable?.finalY;
    y = finalY != null ? finalY + 8 : y + 30;
  }

  // ── Footer on first page ──
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`VibeForge — ${config.title}`, margin, pageH - 8);
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - margin, pageH - 8, {
      align: "right",
    });
  }

  doc.save(`${config.filename}.pdf`);
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

    // Column widths
    ws["!cols"] = [{ wch: 30 }, { wch: 20 }];

    XLSX.utils.book_append_sheet(wb, ws, "Resumen");
  }

  // Data sheets for each table
  config.tables.forEach((table) => {
    const sheetData = [
      table.headers,
      ...table.rows.map((row) => row.map((cell) => (typeof cell === "string" && !isNaN(Number(cell)) ? Number(cell) : cell))),
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Auto-size columns
    ws["!cols"] = table.headers.map((h, i) => {
      const maxLen = Math.max(
        h.length,
        ...table.rows.map((r) => String(r[i] ?? "").length)
      );
      return { wch: Math.min(maxLen + 4, 40) };
    });

    // Truncate sheet name to 31 chars (Excel limit)
    const sheetName = table.title.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, `${config.filename}.xlsx`);
}
