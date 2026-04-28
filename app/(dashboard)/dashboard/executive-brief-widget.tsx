"use client";

import { useState } from "react";
import { Sparkles, Printer, RotateCcw, Lock, AlertTriangle, X, Calendar } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AiLoader } from "@/components/ui/ai-loader";
import { usePlan } from "@/hooks/use-plan";

/**
 * Capa 1 — Reporte IA Avanzado · Slice C
 *
 * Manual trigger of executive briefs from the admin dashboard. Owner/admin
 * picks a period (last 7d, last 30d, or custom range), the LLM generates a
 * narrative brief using Haiku 4.5 + the existing get_report_metrics_for_ai
 * RPC (which already includes previous-period comparison), and the result
 * shows up in this same modal with print/PDF support.
 *
 * No cron, no email, no historical list yet — those come in the Capa 1
 * full implementation in the next session.
 */

type Period = "week" | "month" | "custom";

interface BriefResult {
  id: string | null;
  period: Period;
  period_start: string;
  period_end: string;
  content_markdown: string;
  generated_at: string;
}

const PERIOD_LABELS: Record<Period, string> = {
  week: "Última semana (7 días)",
  month: "Último mes (30 días)",
  custom: "Rango personalizado",
};

function formatDate(d: string): string {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function ExecutiveBriefWidget() {
  const { plan } = usePlan();
  const hasAiFeature = plan?.feature_ai_assistant ?? false;
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("week");
  const [customFrom, setCustomFrom] = useState(daysAgoIso(13));
  const [customTo, setCustomTo] = useState(todayIso());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [result, setResult] = useState<BriefResult | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setNeedsUpgrade(false);
    setResult(null);

    try {
      const body: Record<string, string> = { period };
      if (period === "custom") {
        body.date_from = customFrom;
        body.date_to = customTo;
      }
      const res = await fetch("/api/ai-briefs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.upgrade) setNeedsUpgrade(true);
        setError(data.error ?? "Error al generar el brief");
        return;
      }
      setResult(data.brief);
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!result) return;
    openBriefPrintWindow(result);
  };

  const handleClose = () => {
    setOpen(false);
    // Keep result + period so reopening the modal shows the last generation.
  };

  return (
    <>
      {/* Compact pill button — sized to match the sibling controls in the
          dashboard header (period filter + "Ver reportes"). Same px-4 py-2.5
          text-sm so all three controls align on a single visual line. */}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (!result && hasAiFeature) generate();
        }}
        disabled={!hasAiFeature}
        title={hasAiFeature ? "Brief Ejecutivo IA" : "Disponible en plan Pro"}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
          hasAiFeature
            ? // Gradient emerald → violet (#7C3AED). Subtle shadow + scale
              // microinteraction matches the other primary CTAs.
              "bg-gradient-to-r from-emerald-500 to-violet-600 text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
            : "bg-muted text-muted-foreground cursor-not-allowed border border-border/60"
        )}
      >
        {hasAiFeature ? (
          <Sparkles className="h-4 w-4" />
        ) : (
          <Lock className="h-4 w-4" />
        )}
        Brief IA
        {!hasAiFeature && (
          <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
            PRO
          </span>
        )}
      </button>

      {/* Modal with the brief */}
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 [&>button]:hidden">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 backdrop-blur px-5 py-4">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-emerald-500" />
                Brief Ejecutivo IA
              </DialogTitle>
              <DialogDescription className="text-xs">
                Resumen narrativo del periodo seleccionado · powered by Haiku 4.5
              </DialogDescription>
            </div>
            <div className="flex items-center gap-1">
              {result && (
                <>
                  <button
                    onClick={generate}
                    disabled={loading}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Regenerar"
                  >
                    <RotateCcw className={cn("h-4 w-4", loading && "animate-spin")} />
                  </button>
                  <button
                    onClick={handlePrint}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Imprimir / Guardar PDF"
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                onClick={handleClose}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {/* Period selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Periodo
              </label>
              <div className="flex flex-wrap gap-2">
                {(["week", "month", "custom"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      period === p
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-border bg-card hover:bg-accent"
                    )}
                  >
                    {p === "custom" && <Calendar className="h-3.5 w-3.5" />}
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
              {period === "custom" && (
                <div className="grid grid-cols-2 gap-2 max-w-md">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Desde</label>
                    <input
                      type="date"
                      value={customFrom}
                      max={customTo}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Hasta</label>
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom}
                      max={todayIso()}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
              )}
              <button
                onClick={() => {
                  generate();
                  if (!loading) toast.success("Generando brief...");
                }}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {result ? "Regenerar con este periodo" : "Generar brief"}
              </button>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="py-8">
                <AiLoader size={140} text="Generando brief con IA..." fullScreen={false} />
              </div>
            )}

            {/* Error state */}
            {error && !loading && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 py-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
                <p className="text-sm text-center text-muted-foreground max-w-md px-4">{error}</p>
                {needsUpgrade && (
                  <a
                    href="/plans"
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Mejorar plan
                  </a>
                )}
              </div>
            )}

            {/* Result */}
            {result && !loading && (
              <div className="rounded-xl border border-border bg-card/50 p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground border-b border-border/60 pb-2">
                  <span className="font-semibold text-foreground">
                    {formatDate(result.period_start)} → {formatDate(result.period_end)}
                  </span>
                  <span>·</span>
                  <span>Generado {new Date(result.generated_at).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="prose prose-sm max-w-none [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:first:mt-0 [&_p]:text-[13px] [&_p]:leading-relaxed [&_p]:text-foreground/90 [&_li]:text-[13px] [&_li]:text-foreground/90 [&_strong]:text-foreground [&_ul]:my-2 [&_ul]:pl-5">
                  <BriefMarkdown content={result.content_markdown} />
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Lightweight markdown renderer (h2, ul, p, strong, em) ──
// Same approach as ai-summary-panel.tsx — kept inline to avoid prop drilling
// and to stay within the file boundary of the slice.
function BriefMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc">
          {listItems.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: inlineMd(escapeHtml(item)) }} />
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
      elements.push(
        <h2
          key={key++}
          dangerouslySetInnerHTML={{ __html: inlineMd(escapeHtml(trimmed.slice(3))) }}
        />
      );
    } else if (trimmed.startsWith("- ")) {
      listItems.push(trimmed.slice(2));
    } else if (trimmed === "") {
      flushList();
    } else {
      flushList();
      elements.push(
        <p key={key++} dangerouslySetInnerHTML={{ __html: inlineMd(escapeHtml(trimmed)) }} />
      );
    }
  }
  flushList();
  return <>{elements}</>;
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

// ── Print/PDF window ──
function openBriefPrintWindow(brief: BriefResult) {
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return;

  const lines = brief.content_markdown.split("\n");
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

  const periodLabel = `${formatDate(brief.period_start)} → ${formatDate(brief.period_end)}`;
  const generatedAt = new Date(brief.generated_at).toLocaleString("es-PE", {
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
  <title>Brief Ejecutivo — ${periodLabel}</title>
  <style>
    @media print { @page { size: A4; margin: 18mm 16mm; } }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1a1a1a;
      max-width: 720px;
      margin: 0 auto;
      padding: 24px;
      line-height: 1.6;
      font-size: 13px;
    }
    .header { border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 24px; }
    .header h1 { font-size: 20px; margin: 0 0 4px; color: #065f46; }
    .header .meta { font-size: 11px; color: #6b7280; }
    h2 { font-size: 14px; color: #065f46; margin: 22px 0 6px; }
    p { margin: 8px 0; }
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
      position: fixed; top: 12px; right: 12px;
      background: #10b981; color: white;
      padding: 8px 14px; border-radius: 8px;
      font-size: 12px; font-weight: 600; cursor: pointer; border: none;
    }
    @media print { .print-hint { display: none; } }
  </style>
</head>
<body>
  <button class="print-hint" onclick="window.print()">Imprimir / Guardar PDF</button>
  <div class="header">
    <h1>Brief Ejecutivo IA</h1>
    <div class="meta">
      Periodo: <strong>${escapeHtml(periodLabel)}</strong><br />
      Generado por Yenda IA · ${escapeHtml(generatedAt)}
    </div>
  </div>
  ${htmlParts.join("\n")}
  <div class="footer">
    Yenda — Brief generado por Haiku 4.5. Este resumen es referencial; valide cifras críticas con sus reportes detallados.
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();},200);}</script>
</body>
</html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
