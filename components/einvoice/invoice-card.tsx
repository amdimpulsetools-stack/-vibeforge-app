"use client";

// Inline card for the appointment sidebar that shows the issued invoice
// associated with the appointment. Self-contained — fetches its own
// data from /api/einvoices/[id] given an einvoice_id.
//
// Gating: caller is responsible for not rendering this if the org's
// e-invoicing module is off. We don't double-check inside (RLS would
// block the fetch anyway).

import { useEffect, useState } from "react";
import {
  Receipt,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  FileText,
  FileCode,
  FileCheck,
  Ban,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EInvoiceCreditNoteDialog } from "./credit-note-dialog";

interface Props {
  einvoiceId: string;
}

interface InvoiceRow {
  id: string;
  doc_type: number;
  series: string;
  number: number;
  status: string;
  customer_name: string;
  customer_doc_number: string;
  total: number;
  currency: string;
  pdf_url: string | null;
  xml_url: string | null;
  cdr_url: string | null;
  provider_link: string | null;
  sunat_accepted: boolean | null;
  sunat_description: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  last_error: string | null;
  issued_at: string | null;
}

const DOC_LABEL: Record<number, string> = {
  1: "Factura",
  2: "Boleta",
  3: "Nota de crédito",
  4: "Nota de débito",
};

export function InvoiceCard({ einvoiceId }: Props) {
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("einvoices")
      .select(
        "id, doc_type, series, number, status, customer_name, customer_doc_number, " +
          "total, currency, pdf_url, xml_url, cdr_url, provider_link, " +
          "sunat_accepted, sunat_description, cancelled_at, cancellation_reason, last_error, issued_at"
      )
      .eq("id", einvoiceId)
      .maybeSingle();
    setInvoice((data as unknown as InvoiceRow) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("einvoices")
        .select(
          "id, doc_type, series, number, status, customer_name, customer_doc_number, " +
            "total, currency, pdf_url, xml_url, cdr_url, provider_link, " +
            "sunat_accepted, sunat_description, cancelled_at, cancellation_reason, last_error, issued_at"
        )
        .eq("id", einvoiceId)
        .maybeSingle();
      if (!cancelled) {
        setInvoice((data as unknown as InvoiceRow) ?? null);
        setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [einvoiceId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-muted/20 p-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Cargando comprobante…
      </div>
    );
  }

  if (!invoice) {
    return null;
  }

  const display = `${invoice.series}-${String(invoice.number).padStart(8, "0")}`;
  const status = computeStatusUi(invoice);

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
            <Receipt className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              {DOC_LABEL[invoice.doc_type] ?? "Comprobante"}
            </div>
            <div className="text-base font-bold text-foreground tabular-nums">
              {display}
            </div>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.className}`}
        >
          <status.Icon className="h-2.5 w-2.5" />
          {status.label}
        </span>
      </div>

      <div className="text-xs space-y-1">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Cliente:</span>
          <span className="font-medium text-right truncate">{invoice.customer_name}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Documento:</span>
          <span className="font-mono">{invoice.customer_doc_number}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Total:</span>
          <span className="font-semibold tabular-nums">
            {invoice.currency} {fmt(invoice.total)}
          </span>
        </div>
      </div>

      {/* SUNAT message */}
      {invoice.sunat_description && (
        <div className="text-[11px] text-muted-foreground italic leading-relaxed">
          {invoice.sunat_description}
        </div>
      )}

      {/* Errors / cancellation note */}
      {invoice.status === "rejected" && invoice.last_error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-700 dark:text-rose-400 leading-relaxed">
          {invoice.last_error}
        </div>
      )}
      {invoice.status === "cancelled" && invoice.cancellation_reason && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
          Anulado: {invoice.cancellation_reason}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        {invoice.pdf_url && (
          <LinkButton href={invoice.pdf_url} icon={FileText}>
            PDF
          </LinkButton>
        )}
        {invoice.xml_url && (
          <LinkButton href={invoice.xml_url} icon={FileCode}>
            XML
          </LinkButton>
        )}
        {invoice.cdr_url && (
          <LinkButton href={invoice.cdr_url} icon={FileCheck}>
            CDR
          </LinkButton>
        )}
        {invoice.provider_link && !invoice.pdf_url && (
          <LinkButton href={invoice.provider_link} icon={ExternalLink}>
            Abrir
          </LinkButton>
        )}

        {/* Credit note (only on boleta/factura, accepted, not already cancelled) */}
        {(invoice.doc_type === 1 || invoice.doc_type === 2) &&
          invoice.status === "accepted" &&
          !invoice.cancelled_at && (
            <button
              onClick={() => setCreditNoteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400 px-3 py-1.5 text-xs font-medium hover:bg-amber-500/15 transition-colors"
            >
              <Ban className="h-3.5 w-3.5" />
              Anular / Nota de crédito
            </button>
          )}
      </div>

      <EInvoiceCreditNoteDialog
        open={creditNoteOpen}
        onOpenChange={setCreditNoteOpen}
        einvoiceId={invoice.id}
        onEmitted={() => {
          // Refresh invoice state — if reason was anulación/devolución
          // total, the original is now status=cancelled.
          void load();
        }}
      />
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function LinkButton({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </a>
  );
}

function computeStatusUi(invoice: InvoiceRow): {
  label: string;
  className: string;
  Icon: typeof CheckCircle2;
} {
  if (invoice.status === "cancelled") {
    return {
      label: "Anulado",
      className:
        "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
      Icon: XCircle,
    };
  }
  if (invoice.status === "cancelling") {
    return {
      label: "Anulando…",
      className:
        "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      Icon: Clock,
    };
  }
  if (invoice.status === "rejected") {
    return {
      label: "Rechazado",
      className:
        "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
      Icon: XCircle,
    };
  }
  if (invoice.status === "error") {
    return {
      label: "Reintentable",
      className:
        "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      Icon: AlertTriangle,
    };
  }
  if (invoice.status === "sending") {
    return {
      label: "Enviando…",
      className:
        "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
      Icon: Loader2,
    };
  }
  // accepted
  if (invoice.sunat_accepted) {
    return {
      label: "Aceptado SUNAT",
      className:
        "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      Icon: CheckCircle2,
    };
  }
  return {
    label: "Emitido",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    Icon: CheckCircle2,
  };
}

function fmt(n: number): string {
  return n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
