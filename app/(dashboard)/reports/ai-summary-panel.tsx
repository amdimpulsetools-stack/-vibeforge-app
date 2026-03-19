"use client";

import { useState, useCallback, createContext, useContext } from "react";
import { useLanguage } from "@/components/language-provider";
import { usePlan } from "@/hooks/use-plan";
import { toast } from "sonner";
import {
  Sparkles,
  X,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  Lock,
  RotateCcw,
} from "lucide-react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

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

export function AiSummaryPanel() {
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
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <div className="relative">
              <div className="h-10 w-10 rounded-full border-2 border-emerald-500/30" />
              <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin text-emerald-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">{t("ai_reports.generating")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("ai_reports.generating_sub")}</p>
            </div>
          </div>
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
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ["strong", "em", "code"], ALLOWED_ATTR: ["class"] });
}
