"use client";

// Dashboard de comprobantes electrónicos emitidos.
//
// Vista admin-only (gated en sidebar). Lista todos los einvoices de la
// organización con filtros por período, tipo, estado y serie. KPIs en
// la parte superior, tabla con paginación, drawer al hacer click para
// detalles + links a PDF/XML/CDR.
//
// Hoy es read-only: emisión sigue ocurriendo desde el sidebar de cita.
// Las acciones de anular (NC) y reintentar viven en otros lugares —
// aquí solo se observa.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { format, startOfMonth } from "date-fns";
import {
  Receipt,
  Loader2,
  Search,
  ExternalLink,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingUp,
  Hash,
  Ban,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EInvoiceCreditNoteDialog } from "@/components/einvoice/credit-note-dialog";

// ── Types ──────────────────────────────────────────────────────────────

interface EInvoiceRow {
  id: string;
  doc_type: 1 | 2 | 3 | 4;
  series: string;
  number: number;
  status: "draft" | "sending" | "accepted" | "rejected" | "error" | "cancelled";
  customer_doc_type: string;
  customer_doc_number: string;
  customer_name: string;
  currency: "PEN" | "USD";
  total: number;
  igv_amount: number;
  issued_at: string;
  pdf_url: string | null;
  xml_url: string | null;
  cdr_url: string | null;
  provider_link: string | null;
  sunat_accepted: boolean | null;
  sunat_response_code: string | null;
  sunat_description: string | null;
  last_error: string | null;
  appointment_id: string | null;
}

const DOC_TYPE_LABELS: Record<number, string> = {
  1: "Factura",
  2: "Boleta",
  3: "Nota de crédito",
  4: "Nota de débito",
};

const DOC_TYPE_COLORS: Record<number, string> = {
  1: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  2: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  3: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  4: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
};

const STATUS_META: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  draft: {
    label: "Borrador",
    color: "bg-muted text-muted-foreground border-border",
    icon: FileText,
  },
  sending: {
    label: "Enviando",
    color: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
    icon: Loader2,
  },
  accepted: {
    label: "Aceptado",
    color:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rechazado",
    color:
      "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
    icon: XCircle,
  },
  error: {
    label: "Error",
    color:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
    icon: AlertCircle,
  },
  cancelled: {
    label: "Anulado",
    color: "bg-muted text-muted-foreground border-border",
    icon: Ban,
  },
};

const PAGE_SIZE = 50;

// ── Component ──────────────────────────────────────────────────────────

export default function FacturacionPage() {
  useLanguage(); // ensures provider mounted; copy is in-page
  const [rows, setRows] = useState<EInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EInvoiceRow | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd")
  );
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSeries, setFilterSeries] = useState<string>("all");
  const [searchText, setSearchText] = useState("");

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    let q = supabase
      .from("einvoices")
      .select(
        "id, doc_type, series, number, status, customer_doc_type, customer_doc_number, customer_name, currency, total, igv_amount, issued_at, pdf_url, xml_url, cdr_url, provider_link, sunat_accepted, sunat_response_code, sunat_description, last_error, appointment_id"
      )
      .gte("issued_at", dateFrom + "T00:00:00")
      .lte("issued_at", dateTo + "T23:59:59")
      .order("issued_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (filterType !== "all") q = q.eq("doc_type", Number(filterType));
    if (filterStatus !== "all") q = q.eq("status", filterStatus);
    if (filterSeries !== "all") q = q.eq("series", filterSeries);

    const { data, error: qErr } = await q;
    if (qErr) {
      setError(qErr.message);
      setRows([]);
    } else {
      setRows((data as unknown as EInvoiceRow[]) ?? []);
    }
    setLoading(false);
  }, [dateFrom, dateTo, filterType, filterStatus, filterSeries]);

  useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  // Derived: list of unique series in current results (for the series filter
  // dropdown — populated dynamically so users only see what they actually
  // have, not the full Nubefact catalog).
  const availableSeries = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.series))).sort();
  }, [rows]);

  // Derived: client-side text filter (server filters cover the heavy lifting;
  // search-by-name is too dynamic to round-trip).
  const filteredRows = useMemo(() => {
    if (!searchText.trim()) return rows;
    const q = searchText.toLowerCase().trim();
    return rows.filter(
      (r) =>
        r.customer_name.toLowerCase().includes(q) ||
        r.customer_doc_number.includes(q) ||
        `${r.series}-${String(r.number).padStart(8, "0")}`
          .toLowerCase()
          .includes(q) ||
        `${r.series}${r.number}`.toLowerCase().includes(q)
    );
  }, [rows, searchText]);

  // KPIs computed from the current (filtered-by-server) result set.
  const kpis = useMemo(() => {
    const totalAmount = rows
      .filter((r) => r.status === "accepted" || r.status === "sending")
      .reduce((sum, r) => sum + Number(r.total), 0);
    const totalCount = rows.filter(
      (r) => r.status === "accepted" || r.status === "sending"
    ).length;
    const pendingCount = rows.filter(
      (r) => r.status === "sending" || (r.status === "accepted" && !r.sunat_accepted)
    ).length;
    const rejectedCount = rows.filter(
      (r) => r.status === "rejected" || r.status === "error" || r.status === "cancelled"
    ).length;
    return { totalAmount, totalCount, pendingCount, rejectedCount };
  }, [rows]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            Facturación electrónica
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lista de comprobantes emitidos en la organización. Filtra por
            período, tipo, estado o serie. Haz click en cualquier fila para
            ver detalles y descargar PDF / XML / CDR.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={TrendingUp}
          label="Emitido en el período"
          value={`PEN ${kpis.totalAmount.toLocaleString("es-PE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          subtitle={`${kpis.totalCount} comprobantes`}
          tone="emerald"
        />
        <Kpi
          icon={Hash}
          label="Total emitidos"
          value={String(rows.length)}
          subtitle="en el rango filtrado"
          tone="blue"
        />
        <Kpi
          icon={Clock}
          label="Pendientes SUNAT"
          value={String(kpis.pendingCount)}
          subtitle={kpis.pendingCount > 0 ? "Esperando confirmación" : "Sin pendientes"}
          tone={kpis.pendingCount > 0 ? "amber" : "muted"}
        />
        <Kpi
          icon={XCircle}
          label="Rechazados / anulados"
          value={String(kpis.rejectedCount)}
          subtitle={kpis.rejectedCount > 0 ? "Requieren atención" : "Sin incidencias"}
          tone={kpis.rejectedCount > 0 ? "rose" : "muted"}
        />
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-3 items-end">
        <FilterField label="Desde">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputCls}
          />
        </FilterField>
        <FilterField label="Hasta">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputCls}
          />
        </FilterField>
        <FilterField label="Tipo">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={inputCls}
          >
            <option value="all">Todos</option>
            <option value="2">Boleta</option>
            <option value="1">Factura</option>
            <option value="3">Nota de crédito</option>
            <option value="4">Nota de débito</option>
          </select>
        </FilterField>
        <FilterField label="Estado">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className={inputCls}
          >
            <option value="all">Todos</option>
            <option value="accepted">Aceptado</option>
            <option value="sending">Enviando</option>
            <option value="rejected">Rechazado</option>
            <option value="error">Error</option>
            <option value="cancelled">Anulado</option>
          </select>
        </FilterField>
        <FilterField label="Serie">
          <select
            value={filterSeries}
            onChange={(e) => setFilterSeries(e.target.value)}
            className={inputCls}
          >
            <option value="all">Todas</option>
            {availableSeries.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </FilterField>
        <div className="flex-1 min-w-[180px]">
          <FilterField label="Buscar">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Cliente, RUC/DNI, número…"
                className={`${inputCls} pl-8`}
              />
            </div>
          </FilterField>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Cargando comprobantes…
          </div>
        ) : error ? (
          <div className="p-6 flex items-start gap-3 text-rose-700 dark:text-rose-300">
            <AlertCircle className="h-5 w-5 mt-0.5" />
            <div>
              <div className="font-semibold">Error al cargar</div>
              <div className="text-sm text-muted-foreground mt-0.5">{error}</div>
            </div>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Receipt className="h-10 w-10 mb-3 opacity-40" />
            <div className="font-medium">Sin comprobantes en el rango</div>
            <div className="text-xs mt-1">
              Ajusta los filtros o emite tu primer comprobante desde una cita.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <Th>Fecha</Th>
                  <Th>Tipo</Th>
                  <Th>Número</Th>
                  <Th>Cliente</Th>
                  <Th align="right">Total</Th>
                  <Th>Estado</Th>
                  <Th align="right">Acciones</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.map((r) => {
                  const status = STATUS_META[r.status] ?? STATUS_META.draft;
                  const StatusIcon = status.icon;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className="hover:bg-accent/40 cursor-pointer transition-colors"
                    >
                      <Td>
                        <div className="text-xs">
                          {format(new Date(r.issued_at), "dd/MM/yyyy")}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {format(new Date(r.issued_at), "HH:mm")}
                        </div>
                      </Td>
                      <Td>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
                            DOC_TYPE_COLORS[r.doc_type]
                          )}
                        >
                          {DOC_TYPE_LABELS[r.doc_type]}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-xs">
                          {r.series}-{String(r.number).padStart(8, "0")}
                        </span>
                      </Td>
                      <Td>
                        <div className="text-xs font-medium">{r.customer_name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {r.customer_doc_number || "—"}
                        </div>
                      </Td>
                      <Td align="right">
                        <span className="font-mono tabular-nums">
                          {r.currency} {Number(r.total).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </Td>
                      <Td>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                            status.color
                          )}
                        >
                          <StatusIcon
                            className={cn(
                              "h-3 w-3",
                              r.status === "sending" && "animate-spin"
                            )}
                          />
                          {status.label}
                        </span>
                      </Td>
                      <Td align="right" onClickStop>
                        <div className="flex items-center justify-end gap-1">
                          {r.pdf_url && (
                            <IconLink href={r.pdf_url} title="Abrir PDF">
                              <FileText className="h-3.5 w-3.5" />
                            </IconLink>
                          )}
                          {r.provider_link && (
                            <IconLink href={r.provider_link} title="Ver en Nubefact">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </IconLink>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rows.length === PAGE_SIZE && (
        <div className="text-xs text-muted-foreground text-center">
          Mostrando los primeros {PAGE_SIZE} resultados — angosta el rango de
          fechas o filtros para ver más.
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <DetailDrawer
          row={selected}
          onClose={() => setSelected(null)}
          onCreditNoteEmitted={() => {
            setSelected(null);
            void fetchInvoices();
          }}
        />
      )}
    </div>
  );
}

// ── UI helpers ──────────────────────────────────────────────────────────

const inputCls =
  "rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all w-full";

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-[140px]">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      {children}
    </label>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  subtitle,
  tone,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  subtitle: string;
  tone: "emerald" | "blue" | "amber" | "rose" | "muted";
}) {
  const TONES: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
          TONES[tone]
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </div>
        <div className="text-xl font-bold tabular-nums truncate mt-0.5">
          {value}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 font-semibold",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  onClickStop,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  onClickStop?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-4 py-2.5 align-middle",
        align === "right" ? "text-right" : "text-left"
      )}
      onClick={(e) => {
        if (onClickStop) e.stopPropagation();
      }}
    >
      {children}
    </td>
  );
}

function IconLink({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center justify-center rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      {children}
    </a>
  );
}

// ── Detail drawer ──────────────────────────────────────────────────────

function DetailDrawer({
  row,
  onClose,
  onCreditNoteEmitted,
}: {
  row: EInvoiceRow;
  onClose: () => void;
  onCreditNoteEmitted?: () => void;
}) {
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const status = STATUS_META[row.status] ?? STATUS_META.draft;
  const StatusIcon = status.icon;
  const canIssueCreditNote =
    (row.doc_type === 1 || row.doc_type === 2) && row.status === "accepted";
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer */}
      <aside className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {DOC_TYPE_LABELS[row.doc_type]}
            </div>
            <div className="font-mono text-base font-semibold">
              {row.series}-{String(row.number).padStart(8, "0")}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status */}
          <div
            className={cn(
              "rounded-xl border p-3 flex items-start gap-2",
              status.color
            )}
          >
            <StatusIcon
              className={cn(
                "h-4 w-4 mt-0.5 shrink-0",
                row.status === "sending" && "animate-spin"
              )}
            />
            <div className="flex-1">
              <div className="font-semibold text-sm">{status.label}</div>
              {row.sunat_description && (
                <div className="text-xs mt-0.5 opacity-90">
                  SUNAT: {row.sunat_description}
                  {row.sunat_response_code && (
                    <span className="font-mono ml-1">
                      ({row.sunat_response_code})
                    </span>
                  )}
                </div>
              )}
              {row.last_error && (
                <div className="text-xs mt-1 opacity-80">{row.last_error}</div>
              )}
            </div>
          </div>

          {/* Customer */}
          <Section title="Cliente">
            <Field label="Nombre / Razón social" value={row.customer_name} />
            <Field
              label="Documento"
              value={
                row.customer_doc_number
                  ? `${row.customer_doc_type === "6" ? "RUC" : row.customer_doc_type === "1" ? "DNI" : "Doc"} ${row.customer_doc_number}`
                  : "—"
              }
            />
          </Section>

          {/* Totals */}
          <Section title="Importes">
            <Field
              label="IGV"
              value={`${row.currency} ${Number(row.igv_amount).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
            <Field
              label="Total"
              value={`${row.currency} ${Number(row.total).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              emphasis
            />
          </Section>

          {/* Provider links */}
          <Section title="Documentos">
            <div className="grid grid-cols-1 gap-2">
              {row.pdf_url ? (
                <DocLink href={row.pdf_url} icon={FileText} label="PDF" />
              ) : (
                <DocPlaceholder icon={FileText} label="PDF (no disponible)" />
              )}
              {row.xml_url && (
                <DocLink href={row.xml_url} icon={FileText} label="XML SUNAT" />
              )}
              {row.cdr_url && (
                <DocLink href={row.cdr_url} icon={FileText} label="CDR SUNAT" />
              )}
              {row.provider_link && (
                <DocLink
                  href={row.provider_link}
                  icon={ExternalLink}
                  label="Ver en Nubefact"
                />
              )}
            </div>
          </Section>

          {/* Credit-note CTA — only on boleta/factura aceptadas */}
          {canIssueCreditNote && (
            <button
              onClick={() => setCreditNoteOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400 px-3 py-2 text-sm font-medium hover:bg-amber-500/15 transition-colors"
            >
              <Ban className="h-4 w-4" />
              Anular / Nota de crédito
            </button>
          )}

          <div className="text-xs text-muted-foreground">
            Emitido el{" "}
            {format(new Date(row.issued_at), "dd/MM/yyyy 'a las' HH:mm")}
          </div>
        </div>
      </aside>

      <EInvoiceCreditNoteDialog
        open={creditNoteOpen}
        onOpenChange={setCreditNoteOpen}
        einvoiceId={row.id}
        onEmitted={() => {
          setCreditNoteOpen(false);
          onCreditNoteEmitted?.();
        }}
      />
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="rounded-lg border border-border/60 divide-y divide-border/60">
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm tabular-nums text-right",
          emphasis && "font-bold text-base"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function DocLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      {label}
      <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
    </a>
  );
}

function DocPlaceholder({
  icon: Icon,
  label,
}: {
  icon: typeof FileText;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}
