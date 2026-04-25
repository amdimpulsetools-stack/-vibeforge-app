"use client";

// Dialog para emitir una nota de crédito (doc_type=3) que anula o
// modifica un comprobante existente.
//
// Mucho más simple que el emit-dialog: cliente, items y totales se
// heredan del comprobante original, el user solo elige motivo (SUNAT
// Catálogo 9) y opcionalmente edita la descripción del item.
//
// Backend reutiliza /api/einvoices/emit con doc_type=3 +
// referenced_einvoice_id + credit_note_reason_code.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Ban,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

interface OriginalInvoice {
  id: string;
  doc_type: number;
  series: string;
  number: number;
  customer_doc_type: string;
  customer_doc_number: string;
  customer_name: string;
  customer_address: string | null;
  customer_email: string | null;
  currency: "PEN" | "USD";
  igv_percent: number;
  total: number;
  appointment_id: string | null;
}

interface OriginalLineItem {
  service_id: string | null;
  position: number;
  description: string;
  quantity: number;
  unit_price: number;
  igv_affectation: number;
  unit_of_measure: string | null;
  sunat_product_code: string | null;
  internal_code: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  einvoiceId: string;
  /** Called after successful credit-note emission. */
  onEmitted?: (info: { invoiceId: string; series: string; number: number }) => void;
}

// SUNAT Catálogo 9 — motivos de NC. Ordenados por frecuencia clínica.
const REASON_OPTIONS: Array<{ code: string; label: string; hint: string }> = [
  {
    code: "01",
    label: "Anulación de la operación",
    hint: "El servicio no se realizó / paciente desistió. Anula el comprobante completo.",
  },
  {
    code: "06",
    label: "Devolución total",
    hint: "Reintegro al paciente del 100% del importe cobrado. Anula el comprobante.",
  },
  {
    code: "09",
    label: "Disminución en el valor",
    hint: "Ajuste a la baja del precio (descuento posterior). El comprobante original sigue válido.",
  },
  {
    code: "03",
    label: "Corrección por error en la descripción",
    hint: "Error tipográfico o de descripción del servicio. Sin cambio de monto.",
  },
  {
    code: "07",
    label: "Devolución por ítem",
    hint: "Reintegro parcial sobre uno o más ítems del comprobante.",
  },
  {
    code: "05",
    label: "Descuento por ítem",
    hint: "Aplicación de descuento posterior a un ítem específico.",
  },
  {
    code: "04",
    label: "Descuento global",
    hint: "Aplicación de descuento posterior sobre el total del comprobante.",
  },
  {
    code: "08",
    label: "Bonificación",
    hint: "Bonificación al cliente.",
  },
  {
    code: "10",
    label: "Otros conceptos",
    hint: "Cualquier otro motivo no listado.",
  },
];

export function EInvoiceCreditNoteDialog({
  open,
  onOpenChange,
  einvoiceId,
  onEmitted,
}: Props) {
  const [original, setOriginal] = useState<OriginalInvoice | null>(null);
  const [lineItems, setLineItems] = useState<OriginalLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [emitting, setEmitting] = useState(false);
  const [reason, setReason] = useState<string>("01");
  const [observations, setObservations] = useState("");
  const [result, setResult] = useState<
    | null
    | {
        ok: true;
        invoiceId: string;
        series: string;
        number: number;
        pdfUrl?: string;
      }
    | { ok: false; error: string }
  >(null);

  // Load original invoice + items when dialog opens
  useEffect(() => {
    if (!open) return;
    setResult(null);
    setReason("01");
    setObservations("");
    setLoading(true);

    const fetchAll = async () => {
      const supabase = createClient();
      const [invRes, itemsRes] = await Promise.all([
        supabase
          .from("einvoices")
          .select(
            "id, doc_type, series, number, customer_doc_type, customer_doc_number, customer_name, customer_address, customer_email, currency, igv_percent, total, appointment_id"
          )
          .eq("id", einvoiceId)
          .maybeSingle(),
        supabase
          .from("einvoice_line_items")
          .select(
            "service_id, position, description, quantity, unit_price, igv_affectation, unit_of_measure, sunat_product_code, internal_code"
          )
          .eq("einvoice_id", einvoiceId)
          .order("position"),
      ]);

      setOriginal((invRes.data as unknown as OriginalInvoice) ?? null);
      setLineItems((itemsRes.data as unknown as OriginalLineItem[]) ?? []);
      setLoading(false);
    };

    void fetchAll();
  }, [open, einvoiceId]);

  const handleEmit = async () => {
    if (!original) return;
    setEmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/einvoices/emit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointment_id: original.appointment_id,
          // Credit note inherits the same series prefix; backend auto-creates
          // the doc_type=3 series row if it doesn't exist yet.
          doc_type: 3,
          series: original.series,

          // Customer (mirror)
          customer_doc_type: original.customer_doc_type,
          customer_doc_number: original.customer_doc_number,
          customer_name: original.customer_name,
          customer_address: original.customer_address,
          customer_email: original.customer_email,

          // Items (inherit verbatim — full credit notes; partial NC could
          // edit these in a future iteration)
          items: lineItems.map((li) => ({
            service_id: li.service_id,
            description: li.description,
            quantity: li.quantity,
            unit_price: li.unit_price,
            igv_affectation: li.igv_affectation,
            unit_of_measure: li.unit_of_measure ?? "ZZ",
            sunat_product_code: li.sunat_product_code ?? undefined,
            internal_code: li.internal_code ?? undefined,
          })),

          currency: original.currency,
          igv_percent: Number(original.igv_percent),
          invoice_discount: 0,
          observations: observations.trim() || null,
          send_to_customer_email: !!original.customer_email,

          // Credit-note specific
          referenced_einvoice_id: original.id,
          credit_note_reason_code: reason,
        }),
      });
      const json = (await res.json()) as
        | {
            ok: true;
            invoice_id: string;
            doc_type: number;
            series: string;
            number: number;
            pdf_url?: string;
          }
        | { ok: false; error: string };
      if (json.ok) {
        setResult({
          ok: true,
          invoiceId: json.invoice_id,
          series: json.series,
          number: json.number,
          pdfUrl: json.pdf_url,
        });
        onEmitted?.({
          invoiceId: json.invoice_id,
          series: json.series,
          number: json.number,
        });
      } else {
        setResult({ ok: false, error: json.error });
      }
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Error de red",
      });
    } finally {
      setEmitting(false);
    }
  };

  const selectedReason = REASON_OPTIONS.find((r) => r.code === reason);
  const isAnnulment = reason === "01" || reason === "06";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-xl max-h-[92vh] overflow-hidden p-0 gap-0 flex flex-col [&>button]:hidden">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
              <Ban className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {result?.ok
                  ? "Nota de crédito emitida"
                  : "Emitir nota de crédito"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {original
                  ? `Sobre ${original.series}-${String(original.number).padStart(8, "0")}`
                  : "Cargando comprobante…"}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Cargando datos del comprobante…
            </div>
          ) : !original ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
              No se pudo cargar el comprobante.
            </div>
          ) : result?.ok ? (
            <SuccessPanel result={result} />
          ) : (
            <>
              {/* Original summary */}
              <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1.5 text-xs">
                <Row
                  label="Cliente"
                  value={`${original.customer_name} (${original.customer_doc_number || "—"})`}
                />
                <Row
                  label="Total original"
                  value={`${original.currency} ${fmt(original.total)}`}
                  emphasis
                />
                <Row label="Ítems" value={`${lineItems.length}`} />
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <label className="text-xs font-medium">
                  Motivo SUNAT (Catálogo 9) *
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  {REASON_OPTIONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code} — {r.label}
                    </option>
                  ))}
                </select>
                {selectedReason && (
                  <div className="text-[11px] text-muted-foreground italic leading-relaxed">
                    {selectedReason.hint}
                  </div>
                )}
              </div>

              {/* Annulment warning */}
              {isAnnulment && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                    Esta nota de crédito <b>anula</b> el comprobante original
                    para SUNAT. El comprobante seguirá listado en histórico
                    pero quedará marcado como Anulado y no contará en tus
                    reportes financieros.
                  </div>
                </div>
              )}

              {/* Observations */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium">
                  Observaciones (opcional)
                </label>
                <input
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Ej. Paciente reagendó para otra fecha"
                  maxLength={500}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              {/* Error */}
              {result && !result.ok && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                  <div className="flex-1 text-sm text-rose-700 dark:text-rose-300">
                    <div className="font-medium">No se pudo emitir</div>
                    <div className="text-xs mt-1">{result.error}</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3 flex items-center justify-end gap-2">
          {result?.ok ? (
            <button
              onClick={() => {
                onOpenChange(false);
                toast.success(
                  `Nota de crédito ${result.series}-${String(result.number).padStart(8, "0")} emitida.`
                );
              }}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Cerrar
            </button>
          ) : (
            <>
              <button
                onClick={() => onOpenChange(false)}
                disabled={emitting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleEmit}
                disabled={emitting || loading || !original}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {emitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Emitir nota de crédito
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function SuccessPanel({
  result,
}: {
  result: {
    ok: true;
    invoiceId: string;
    series: string;
    number: number;
    pdfUrl?: string;
  };
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold text-emerald-700 dark:text-emerald-300">
            {result.series}-{String(result.number).padStart(8, "0")}
          </div>
          <div className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">
            Nota de crédito enviada a SUNAT.
          </div>
        </div>
      </div>
      {result.pdfUrl && (
        <a
          href={result.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors w-full justify-center"
        >
          <ExternalLink className="h-4 w-4" />
          Abrir PDF de la nota de crédito
        </a>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          emphasis ? "font-bold tabular-nums" : "font-medium tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
