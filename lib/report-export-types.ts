/**
 * Types for report export config.
 * Separated from the export logic so webpack doesn't analyze jspdf/xlsx/html2canvas.
 */

export interface ReportKPI {
  label: string;
  value: string;
}

export interface ReportTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

export interface ReportExportConfig {
  title: string;
  dateRange: { from: string; to: string };
  kpis: ReportKPI[];
  tables: ReportTable[];
  filename: string;
}
