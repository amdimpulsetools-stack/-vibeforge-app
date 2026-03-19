"use client";

import { useState, useRef, useEffect } from "react";
import {
  Download,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  Loader2,
} from "lucide-react";

interface ExportMenuProps {
  onExportPDF: () => Promise<void>;
  onExportExcel: () => void;
  onExportCSV?: () => void;
}

export function ExportMenu({ onExportPDF, onExportExcel, onExportCSV }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const handleExport = async (type: string, fn: (() => void) | (() => Promise<void>)) => {
    setExporting(type);
    setOpen(false);
    try {
      await fn();
    } finally {
      setExporting(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={!!exporting}
        className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-60"
      >
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {exporting === "pdf" ? "Generando PDF..." : exporting === "excel" ? "Generando Excel..." : "Exportar"}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-border bg-popover p-1 shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
          <button
            onClick={() => handleExport("pdf", onExportPDF)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-popover-foreground transition-colors hover:bg-accent"
          >
            <FileText className="h-4 w-4 text-red-500" />
            <div>
              <p className="font-semibold">Exportar PDF</p>
              <p className="text-[10px] text-muted-foreground">Con gráficos y tablas</p>
            </div>
          </button>
          <button
            onClick={() => handleExport("excel", onExportExcel)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-popover-foreground transition-colors hover:bg-accent"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
            <div>
              <p className="font-semibold">Exportar Excel</p>
              <p className="text-[10px] text-muted-foreground">Datos en hojas de cálculo</p>
            </div>
          </button>
          {onExportCSV && (
            <button
              onClick={() => handleExport("csv", onExportCSV)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-popover-foreground transition-colors hover:bg-accent"
            >
              <Download className="h-4 w-4 text-blue-500" />
              <div>
                <p className="font-semibold">Exportar CSV</p>
                <p className="text-[10px] text-muted-foreground">Datos en texto plano</p>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
