"use client";

import { useState, useCallback, createContext, useContext } from "react";
import { useLanguage } from "@/components/language-provider";
import { usePlan } from "@/hooks/use-plan";
import { toast } from "sonner";
import {
  Sparkles,
  X,
  Copy,
  Check,
  AlertTriangle,
  Lock,
  RotateCcw,
  Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiLoader } from "@/components/ui/ai-loader";

// ── Shared state context ─────────────────────────────────────────

interface AiReportState {
  open: boolean;
  loading: boolean;
  summary: string | null;
  usage: { current: number; limit: number } | null;
  error: string | null;
  needsUpgrade: boolean;
}

interface AiReportContextValue extends AiReportState {
  generate: () => void;
  setOpen: (open: boolean) => void;
  hasAiFeature: boolean;
}

const AiReportContext = createContext<AiReportContextValue | null>(null);

interface AiReportProviderProps {
  reportType: string;
  dateFrom: string;
  dateTo: string;
  children: React.ReactNode;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  financial: "Reporte financiero",
  marketing: "Reporte de marketing",
  operational: "Reporte operativo",
  retention: "Reporte de retención",
  general: "Reporte general",
};

function formatDate(d: string): string {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Renders the markdown summary into a print-friendly HTML window. The user
 * gets the standard browser print dialog which lets them either print on
 * paper or save as PDF — same pattern used by clinical-note-print and
 * prescription-print across the project.
 */
function openPrintWindow(args: {
  summary: string;
  reportType: string;
  dateFrom: string;
  dateTo: string;
}) {
  const { summary, reportType, dateFrom, dateTo } = args;
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return;

  // Reuse the same lightweight markdown -> HTML conversion as the panel,
  // but inlined here to avoid coupling with React rendering.
  const lines = summary.split("\n");
  const htmlParts: string[] = [];
  let inList = false;
  const flushList = () => {
    if (inList) {
      htmlParts.push("</ul>");
      inList = false;
    }
  };
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("## ")) {
      flushList();
      htmlParts.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith("- ")) {
      if (!inList) {
        htmlParts.push("<ul>");
        inList = true;
      }
      htmlParts.push(`<li>${inlineMd(escapeHtml(trimmed.slice(2)))}</li>`);
    } else if (trimmed === "") {
      flushList();
    } else {
      flushList();
      htmlParts.push(`<p>${inlineMd(escapeHtml(trimmed))}</p>`);
    }
  }
  flushList();

  const reportLabel = REPORT_TYPE_LABELS[reportType] ?? "Reporte";
  const periodLabel = `${formatDate(dateFrom)} → ${formatDate(dateTo)}`;
  const generatedAt = new Date().toLocaleString("es-PE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${reportLabel} — ${periodLabel}</title>
  <style>
    @media print {
      @page { size: A4; margin: 18mm 16mm; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1a1a1a;
      max-width: 720px;
      margin: 0 auto;
      padding: 24px;
      line-height: 1.55;
      font-size: 13px;
    }
    .header {
      border-bottom: 2px solid #10b981;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 20px;
      margin: 0 0 4px;
      color: #065f46;
    }
    .header .meta {
      font-size: 11px;
      color: #6b7280;
    }
    h2 {
      font-size: 14px;
      color: #065f46;
      margin: 20px 0 8px;
      border-bottom: 1px solid #d1fae5;
      padding-bottom: 4px;
    }
    p { margin: 6px 0; }
    ul { margin: 6px 0; padding-left: 22px; }
    li { margin: 3px 0; }
    strong { color: #111827; }
    .footer {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      font-size: 10px;
      color: #9ca3af;
      text-align: center;
    }
    .print-hint {
      position: fixed;
      top: 12px;
      right: 12px;
      background: #10b981;
      color: white;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: none;
    }
    @media print { .print-hint { display: none; } }
  </style>
</head>
<body>
  <button class="print-hint" onclick="window.print()">Imprimir / Guardar PDF</button>
  <div class="header">
    <h1>${escapeHtml(reportLabel)}</h1>
    <div class="meta">
      Periodo: <strong>${escapeHtml(periodLabel)}</strong><br />
      Generado por Yenda IA · ${escapeHtml(generatedAt)}
    </div>
  </div>
  ${htmlParts.join("\n")}
  <div class="footer">
    Yenda — Resumen ejecutivo generado automáticamente. Use los datos como referencia, valide cifras críticas con sus reportes detallados.
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();},200);}</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMd(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

export function AiReportProvider({ reportType, dateFrom, dateTo, children }: AiReportProviderProps) {
  const { t } = useLanguage();
  const { plan } = usePlan();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ current: number; limit: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);

  const hasAiFeature = plan?.feature_ai_assistant ?? false;

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSummary(null);
    setNeedsUpgrade(false);

    try {
      const res = await fetch("/api/ai-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, dateFrom, dateTo }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.upgrade) setNeedsUpgrade(true);
        setError(data.error ?? t("ai_reports.error_generic"));
        return;
      }

      setSummary(data.summary);
      if (data.usage != null && data.limit != null) {
        setUsage({ current: data.usage, limit: data.limit });
      }
    } catch {
      setError(t("ai_reports.error_generic"));
    } finally {
      setLoading(false);
    }
  }, [reportType, dateFrom, dateTo, t]);

  return (
    <AiReportContext.Provider value={{ open, loading, summary, usage, error, needsUpgrade, generate, setOpen, hasAiFeature }}>
      {children}
    </AiReportContext.Provider>
  );
}

function useAiReport() {
  const ctx = useContext(AiReportContext);
  if (!ctx) throw new Error("useAiReport must be used within AiReportProvider");
  return ctx;
}

// ── Button (goes in header) ──────────────────────────────────────

export function AiSummaryButton() {
  const { t } = useLanguage();
  const { hasAiFeature, setOpen, generate, loading, summary } = useAiReport();

  const handleClick = () => {
    setOpen(true);
    if (!summary && !loading) generate();
  };

  return (
    <button
      onClick={handleClick}
      disabled={!hasAiFeature}
      className={cn(
        "group relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-300",
        hasAiFeature
          ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98]"
          : "bg-muted text-muted-foreground cursor-not-allowed"
      )}
    >
      {hasAiFeature ? (
        <Sparkles className="h-4 w-4 animate-pulse" />
      ) : (
        <Lock className="h-4 w-4" />
      )}
      {t("ai_reports.generate_btn")}
      {!hasAiFeature && (
        <span className="absolute -top-2 -right-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
          PRO
        </span>
      )}
    </button>
  );
}

// ── Panel (goes in content area) ─────────────────────────────────

interface AiSummaryPanelProps {
  /** Pass the same reportType / dateFrom / dateTo used by the provider so the
   *  print window can include them in the document header. */
  reportType: string;
  dateFrom: string;
  dateTo: string;
}

export function AiSummaryPanel({ reportType, dateFrom, dateTo }: AiSummaryPanelProps) {
  const { t } = useLanguage();
  const { open, setOpen, loading, summary, usage, error, needsUpgrade, generate } = useAiReport();
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = async () => {
    if (!summary) return;
    const plain = summary
      .replace(/#{1,3}\s?/g, "")
      .replace(/\*\*/g, "")
      .replace(/[📊📈⚠️💡]/g, "");
    await navigator.clipboard.writeText(plain);
    setCopied(true);
    toast.success(t("ai_reports.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden animate-in slide-in-from-top-2 duration-300 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-emerald-600/10 to-teal-600/10 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold">{t("ai_reports.panel_title")}</h3>
            {usage && (
              <p className="text-[10px] text-muted-foreground">
                {usage.current}/{usage.limit} {t("ai_reports.usage_label")}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {summary && (
            <>
              <button
                onClick={generate}
                disabled={loading}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title={t("ai_reports.regenerate")}
              >
                <RotateCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </button>
              <button
                onClick={handleCopy}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title={t("ai_reports.copy")}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() =>
                  openPrintWindow({ summary, reportType, dateFrom, dateTo })
                }
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Imprimir o guardar como PDF"
                aria-label="Imprimir o guardar como PDF"
              >
                <Printer className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {loading && (
          <AiLoader
            size={140}
            text={t("ai_reports.generating")}
            fullScreen={false}
          />
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <p className="text-sm text-center text-muted-foreground max-w-md">{error}</p>
            {needsUpgrade ? (
              <a
                href="/plans"
                className="mt-1 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {t("ai_reports.upgrade_btn")}
              </a>
            ) : (
              <button
                onClick={generate}
                className="mt-1 rounded-lg bg-muted px-4 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
              >
                {t("ai_reports.retry")}
              </button>
            )}
          </div>
        )}

        {summary && !loading && (
          <div className="prose prose-sm prose-invert max-w-none [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:first:mt-0 [&_ul]:space-y-1 [&_li]:text-muted-foreground [&_li]:text-[13px] [&_p]:text-[13px] [&_p]:text-muted-foreground [&_p]:leading-relaxed [&_strong]:text-foreground">
            <MarkdownRenderer content={summary} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Simple markdown renderer ─────────────────────────────────────

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc pl-4">
          {listItems.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: inlineMarkdown(item) }} />
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(<h2 key={key++} dangerouslySetInnerHTML={{ __html: inlineMarkdown(trimmed.slice(3)) }} />);
    } else if (trimmed.startsWith("- ")) {
      listItems.push(trimmed.slice(2));
    } else if (trimmed === "") {
      flushList();
    } else {
      flushList();
      elements.push(<p key={key++} dangerouslySetInnerHTML={{ __html: inlineMarkdown(trimmed) }} />);
    }
  }
  flushList();
  return <>{elements}</>;
}

function inlineMarkdown(text: string): string {
  // First strip any raw HTML tags from the source text
  const stripped = text.replace(/<[^>]*>/g, "");
  const html = stripped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-xs">$1</code>');
  // Input is already stripped of raw HTML (line above) and we only produce
  // controlled <strong>, <em>, <code> tags — no user HTML reaches output.
  return html;
}
