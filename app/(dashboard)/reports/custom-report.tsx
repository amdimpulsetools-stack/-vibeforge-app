"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Printer,
  RefreshCw,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { useOrgToday } from "@/hooks/use-org-today";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberPopIn } from "@/components/ui/number-pop-in";
import { cn } from "@/lib/utils";
import { formatPEN } from "@/lib/format-pen";
import {
  CUSTOM_REPORT_SECTIONS,
  type CustomReport as CustomReportPayload,
  type CustomReportAdvanceKind,
  type CustomReportAdvanceRow,
  type CustomReportPharmacyRow,
  type CustomReportRowBase,
  type CustomReportSectionKey,
} from "@/types/custom-report";

/**
 * Pestaña "Resumen de cobros" de Reportes.
 *
 * Trae el payload completo de GET /api/reports/custom (RPC get_custom_report,
 * mig 260) UNA vez por rango y filtra en cliente: los checks solo muestran u
 * ocultan secciones y recalculan el TOTAL FINAL como Σ de `sections[key].total`
 * de lo marcado — la misma suma que hace el RPC en `grand_total`. Ningún
 * monto se recalcula aquí a partir de filas: cada cifra que se pinta viene
 * tal cual del payload (regla "un número, una fórmula" de CLAUDE.md).
 *
 * El PDF con membrete sale de /api/pdf/custom-report con el mismo rango y la
 * lista de secciones marcadas, abierto en pestaña nueva como la receta
 * (scheduler/prescription-print.tsx). Diseño: docs/spec-reporte-personalizado.md
 * §2–§5 y docs/reporte-personalizado/anexo-ux.md, anexo-ui.md.
 */

interface CustomReportProps {
  dateFrom: string;
  dateTo: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

class ReportHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Orden de impresión de los subgrupos de "Adelantos y pagos a cuenta". */
const ADVANCE_KINDS: readonly CustomReportAdvanceKind[] = [
  "appointment_future",
  "appointment_past",
  "plan",
  "direct",
] as const;

/** Cabecera de la columna Cantidad: cuenta cosas distintas en cada sección. */
const QTY_HEADER_KEY: Record<CustomReportSectionKey, string> = {
  services: "reports.custom_qty_appointments",
  advances: "reports.custom_qty_payments",
  pharmacy: "reports.custom_qty_units",
  treatments: "reports.custom_qty_payments",
};

const MONTHS: Record<"es" | "en", readonly string[]> = {
  // "setiembre", no "septiembre": es la grafía que usa la clínica en Perú.
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

// ─── Helpers de presentación (sin fórmulas de dinero) ────────────────────

/** Sustituye `{name}` en una traducción del diccionario plano. */
function fill(text: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.split(`{${k}}`).join(String(v)),
    text,
  );
}

function parseIso(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

/**
 * Etiqueta del rango para el título y el estado vacío.
 *  - title:  "Hoy, 11 de setiembre" · "11 de setiembre de 2026" ·
 *            "Del 1 al 10 de setiembre de 2026" · "Del 28 de agosto al 4 de
 *            setiembre de 2026" · "Del 28 de diciembre de 2025 al 4 de enero de 2026"
 *  - phrase: la misma idea en minúscula para "Sin cobros {phrase}".
 */
function rangeLabel(
  from: string,
  to: string,
  today: string,
  lang: "es" | "en",
  t: (key: string) => string,
): { title: string; phrase: string; isToday: boolean } {
  const a = parseIso(from);
  const b = parseIso(to);
  const M = MONTHS[lang];
  const isToday = from === to && from === today;

  if (lang === "en") {
    const dm = (x: typeof a) => `${M[x.m - 1]} ${x.d}`;
    if (from === to) {
      const single = `${dm(a)}, ${a.y}`;
      return {
        isToday,
        title: isToday ? `${t("reports.custom_today")}, ${dm(a)}` : single,
        phrase: `on ${single}`,
      };
    }
    let span: string;
    if (a.y === b.y && a.m === b.m) span = `${M[a.m - 1]} ${a.d}–${b.d}, ${a.y}`;
    else if (a.y === b.y) span = `${dm(a)} – ${dm(b)}, ${a.y}`;
    else span = `${dm(a)}, ${a.y} – ${dm(b)}, ${b.y}`;
    return { isToday, title: span, phrase: `from ${span}` };
  }

  const dm = (x: typeof a) => `${x.d} de ${M[x.m - 1]}`;
  if (from === to) {
    const single = `${dm(a)} de ${a.y}`;
    return {
      isToday,
      title: isToday ? `${t("reports.custom_today")}, ${dm(a)}` : single,
      phrase: `el ${single}`,
    };
  }
  let span: string;
  if (a.y === b.y && a.m === b.m) span = `del ${a.d} al ${b.d} de ${M[a.m - 1]} de ${a.y}`;
  else if (a.y === b.y) span = `del ${dm(a)} al ${dm(b)} de ${a.y}`;
  else span = `del ${dm(a)} de ${a.y} al ${dm(b)} de ${b.y}`;
  return {
    isToday,
    title: span.charAt(0).toUpperCase() + span.slice(1),
    phrase: span,
  };
}

/** Unidades de farmacia traen hasta 3 decimales; el resto son enteros. */
function formatQty(n: number): string {
  return Number(n || 0).toLocaleString("es-PE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

/**
 * Texto de la celda Precio — ÚNICA implementación en pantalla.
 *  - precio único      → "S/ 200.00"
 *  - precios distintos → "varios (S/ 180.00 – 200.00)"
 *  - sin precio        → "—"
 */
function priceCell(row: CustomReportRowBase, variousLabel: string): string {
  if (row.price != null) return formatPEN(row.price);
  if (row.price_min != null && row.price_max != null && row.price_min !== row.price_max) {
    const max = Number(row.price_max).toLocaleString("es-PE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${variousLabel} (${formatPEN(row.price_min)} – ${max})`;
  }
  return "—";
}

/** Suma a dos decimales: los totales son numeric(10,2) y la comparación es a tolerancia cero. */
function sumCents(values: number[]): number {
  return values.reduce((acc, v) => acc + Math.round(Number(v || 0) * 100), 0) / 100;
}

// ─── Fetch ────────────────────────────────────────────────────────────────

async function fetchCustomReport(
  orgId: string,
  from: string,
  to: string,
): Promise<CustomReportPayload> {
  const qs = new URLSearchParams({ org_id: orgId, from, to });
  const res = await fetch(`/api/reports/custom?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ReportHttpError(res.status, body.error ?? `Error ${res.status}`);
  }
  return (await res.json()) as CustomReportPayload;
}

// ─── Componente ───────────────────────────────────────────────────────────

export function CustomReport({ dateFrom, dateTo }: CustomReportProps) {
  const { t, language } = useLanguage();
  const lang: "es" | "en" = language === "en" ? "en" : "es";
  const { organizationId } = useOrganization();
  const { today } = useOrgToday();

  const rangeValid = ISO_DATE.test(dateFrom) && ISO_DATE.test(dateTo) && dateFrom <= dateTo;

  const query = useQuery({
    queryKey: ["custom-report", organizationId, dateFrom, dateTo],
    enabled: !!organizationId && rangeValid,
    staleTime: 5 * 60 * 1000,
    // Un 401/403/400 no se arregla reintentando.
    retry: (count, err) =>
      !(err instanceof ReportHttpError && err.status < 500) && count < 1,
    queryFn: () => fetchCustomReport(organizationId as string, dateFrom, dateTo),
  });
  const { data, error, isPending, isFetching, refetch } = query;

  // Checks: todo marcado por defecto; no se persisten (decisión UX §0).
  const [enabled, setEnabled] = useState<Record<CustomReportSectionKey, boolean>>({
    services: true,
    advances: true,
    pharmacy: true,
    treatments: true,
  });

  // Solo las secciones que el RPC declara aplicables (módulo activo o monto > 0).
  const available = useMemo<CustomReportSectionKey[]>(
    () =>
      data
        ? CUSTOM_REPORT_SECTIONS.filter(
            (k) => data.sections_available[k] === true && data.sections[k] != null,
          )
        : [],
    [data],
  );
  const checked = useMemo(() => available.filter((k) => enabled[k]), [available, enabled]);
  const excluded = useMemo(() => available.filter((k) => !enabled[k]), [available, enabled]);

  const sectionTitle = (k: CustomReportSectionKey) => t(`reports.custom_section_${k}`);
  const rowsOf = (k: CustomReportSectionKey): number => data?.sections[k]?.rows.length ?? 0;

  // Σ de lo marcado, sobre `sections[key].total` del payload (nunca sobre filas).
  const grandTotal = useMemo(
    () => (data ? sumCents(checked.map((k) => Number(data.sections[k]?.total ?? 0))) : 0),
    [data, checked],
  );
  const totalRows = checked.reduce((acc, k) => acc + rowsOf(k), 0);
  const allChecked = available.length > 0 && excluded.length === 0;
  const expected = Number(data?.reconciliation.expected_grand_total ?? 0);
  const reconciles = Math.abs(grandTotal - expected) < 0.005;
  const refunds = Number(data?.reconciliation.refunds_in_range ?? 0);

  // Rango sin ningún cobro en ninguna sección aplicable.
  const rangeEmpty =
    !!data &&
    available.length > 0 &&
    available.every((k) => rowsOf(k) === 0 && Number(data.sections[k]?.total ?? 0) === 0);

  const label = rangeLabel(dateFrom, dateTo, today(), lang, t);

  const pdfDisabled = !data || !rangeValid || checked.length === 0;
  const openPdf = () => {
    if (pdfDisabled || !organizationId) return;
    const qs = new URLSearchParams({
      org_id: organizationId,
      from: dateFrom,
      to: dateTo,
      sections: checked.join(","),
    });
    // window.open síncrono dentro del handler del clic: si se hiciera
    // fetch → blob → open, iOS lo bloquearía como pop-up. El endpoint
    // responde `Content-Disposition: inline`, así que el navegador abre el
    // PDF en pestaña nueva con vista previa + imprimir/descargar.
    const win = window.open(`/api/pdf/custom-report?${qs.toString()}`, "_blank", "noopener");
    if (win) toast.info(t("reports.custom_pdf_opening"));
    else toast.error(t("reports.custom_pdf_blocked"));
  };

  const forbidden = error instanceof ReportHttpError && error.status === 403;

  return (
    <div className="space-y-6">
      {/* ── Barra sticky: título, checks y el único botón ───────────────
          Sticky dentro del scroller de Reportes (page.tsx, overflow-y-auto);
          los márgenes negativos cancelan el padding del scroller para que la
          barra sangre hasta los bordes. `print:hidden`: un Ctrl+P accidental
          imprime solo el documento. */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:-mt-6 md:px-6 print:hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2">
            <h2 className="text-sm font-semibold leading-tight">
              {t("reports.custom_title")}
              <span className="font-normal text-muted-foreground"> · {label.title}</span>
            </h2>

            {available.length > 0 && (
              <fieldset className="min-w-0">
                <legend className="sr-only">{t("reports.custom_sections_legend")}</legend>
                <div className="flex flex-wrap gap-2">
                  {available.map((k) => {
                    const id = `custom-chk-${k}`;
                    const count = rowsOf(k);
                    return (
                      <label
                        key={k}
                        htmlFor={id}
                        className={cn(
                          "inline-flex min-h-11 cursor-pointer select-none items-center gap-2.5 rounded-lg border border-border bg-card px-3 text-sm font-medium transition-colors md:min-h-9",
                          "hover:bg-accent has-[:checked]:border-primary/40 has-[:checked]:bg-primary/10 has-[:checked]:text-foreground",
                          "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
                          "max-sm:w-full max-sm:justify-between",
                        )}
                      >
                        <span className="inline-flex items-center gap-2.5">
                          <Checkbox
                            id={id}
                            checked={enabled[k]}
                            onCheckedChange={(v) => setEnabled((prev) => ({ ...prev, [k]: v }))}
                          />
                          {sectionTitle(k)}
                        </span>
                        {/* <span>, no <Badge> (un <div>): dentro de <label>
                            solo cabe contenido de frase. */}
                        <span
                          className={cn(
                            badgeVariants({ variant: "secondary" }),
                            "rounded-full px-1.5 py-0 text-[10px] tabular-nums",
                            count === 0 && "text-muted-foreground",
                          )}
                        >
                          {count}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {/* Resumen vivo de lo marcado: lo anuncia el lector de pantalla al
                marcar/desmarcar. */}
            <p aria-live="polite" className="text-xs tabular-nums text-muted-foreground">
              {data ? (
                <>
                  {checked.length}{" "}
                  {checked.length === 1 ? t("reports.custom_section_one") : t("reports.custom_section_many")}
                  {" · "}
                  {totalRows}{" "}
                  {totalRows === 1 ? t("reports.custom_row_one") : t("reports.custom_row_many")}
                  {" · "}
                  <b className="font-semibold text-foreground">{formatPEN(grandTotal)}</b>
                </>
              ) : (
                " "
              )}
            </p>
          </div>

          <Button
            type="button"
            onClick={openPdf}
            disabled={pdfDisabled}
            className="h-11 w-full shrink-0 px-4 md:h-9 lg:w-auto"
          >
            <Printer className="h-4 w-4" />
            {t("reports.custom_print")}
          </Button>
        </div>
      </div>

      {/* ── Cuerpo ───────────────────────────────────────────────────── */}
      {!rangeValid ? (
        <EmptyCard icon={AlertTriangle} title={t("reports.custom_invalid_range")} />
      ) : error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-600 dark:text-rose-400">
          <p className="font-semibold">
            {forbidden ? t("reports.custom_forbidden") : t("reports.custom_error")}
          </p>
          {!forbidden && error.message && (
            <p className="mt-1 text-xs opacity-80">{error.message}</p>
          )}
          {!forbidden && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 h-11 md:h-8"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              {t("reports.custom_retry")}
            </Button>
          )}
        </div>
      ) : isPending || !data ? (
        <ReportSkeleton />
      ) : available.length === 0 || rangeEmpty ? (
        <EmptyCard
          icon={ListChecks}
          title={
            label.isToday
              ? t("reports.custom_empty_today")
              : fill(t("reports.custom_empty_range"), { range: label.phrase })
          }
          hint={t("reports.custom_empty_hint")}
        />
      ) : checked.length === 0 ? (
        <EmptyCard icon={ListChecks} title={t("reports.custom_none_checked")} />
      ) : (
        <>
          {checked.map((k) => (
            <SectionCard
              key={k}
              sectionKey={k}
              title={sectionTitle(k)}
              qtyHeader={t(QTY_HEADER_KEY[k])}
              includes={t(`reports.custom_includes_${k}`)}
              total={Number(data.sections[k]?.total ?? 0)}
              groups={groupsFor(k, data, t)}
              t={t}
            />
          ))}

          {/* ── TOTAL FINAL ──────────────────────────────────────────── */}
          <section
            aria-labelledby="custom-grand-title"
            className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-4 md:px-5"
          >
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div className="min-w-0">
                <h3
                  id="custom-grand-title"
                  className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary"
                >
                  {t("reports.custom_grand_total")}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {allChecked
                    ? t("reports.custom_grand_all")
                    : fill(t("reports.custom_grand_marked"), {
                        list: excluded.map(sectionTitle).join(", "),
                      })}
                </p>
              </div>
              <p className="text-3xl font-extrabold tracking-tight tabular-nums max-sm:text-2xl">
                <NumberPopIn key={grandTotal} value={formatPEN(grandTotal)} />
              </p>
            </div>

            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-primary/20 pt-3 text-xs text-muted-foreground">
              {checked.map((k) => (
                <div key={k} className="contents">
                  <dt className="min-w-0">{sectionTitle(k)}</dt>
                  <dd className="text-right font-medium tabular-nums text-foreground">
                    {formatPEN(Number(data.sections[k]?.total ?? 0))}
                  </dd>
                </div>
              ))}
            </dl>

            {/* Línea de cuadre, con los datos del MISMO payload (nunca una
                segunda llamada a get_reports_overview). Solo se afirma el
                cuadre cuando están marcadas todas las secciones aplicables. */}
            {allChecked && (
              <p className="mt-3 flex items-start gap-2 text-xs">
                {reconciles ? (
                  <>
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-600 dark:text-success-400" />
                    <span>
                      {available.includes("treatments")
                        ? t("reports.custom_matches_full")
                        : t("reports.custom_matches_collected")}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="text-amber-700 dark:text-amber-300">
                      {fill(t("reports.custom_mismatch"), {
                        amount: formatPEN(Math.abs(grandTotal - expected)),
                      })}
                    </span>
                  </>
                )}
              </p>
            )}

            {refunds !== 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {fill(t("reports.custom_refunds"), {
                  amount: `−${formatPEN(Math.abs(refunds))}`,
                })}
              </p>
            )}

            <p className="mt-2 text-[11px] text-muted-foreground">{t("reports.custom_note")}</p>
          </section>
        </>
      )}
    </div>
  );
}

// ─── Subgrupos por sección ────────────────────────────────────────────────

interface RowGroup {
  /** Subtítulo del subgrupo (Adelantos por `kind`, Farmacia "Ventas anuladas"). */
  label?: string;
  hint?: string;
  muted?: boolean;
  rows: CustomReportRowBase[];
}

function groupsFor(
  key: CustomReportSectionKey,
  data: CustomReportPayload,
  t: (key: string) => string,
): RowGroup[] {
  if (key === "advances") {
    const rows = (data.sections.advances?.rows ?? []) as CustomReportAdvanceRow[];
    return ADVANCE_KINDS.map((kind) => ({
      label: t(`reports.custom_kind_${kind}`),
      rows: rows.filter((r) => r.kind === kind),
    })).filter((g) => g.rows.length > 0);
  }
  if (key === "pharmacy") {
    const rows = (data.sections.pharmacy?.rows ?? []) as CustomReportPharmacyRow[];
    const live = rows.filter((r) => !r.voided);
    const voided = rows.filter((r) => r.voided);
    const groups: RowGroup[] = [{ rows: live }];
    if (voided.length > 0) {
      groups.push({
        label: t("reports.custom_voided_group"),
        hint: t("reports.custom_voided_hint"),
        muted: true,
        rows: voided,
      });
    }
    return groups;
  }
  return [{ rows: data.sections[key]?.rows ?? [] }];
}

// ─── Tarjeta de sección ───────────────────────────────────────────────────

interface SectionCardProps {
  sectionKey: CustomReportSectionKey;
  title: string;
  qtyHeader: string;
  includes: string;
  total: number;
  groups: RowGroup[];
  t: (key: string) => string;
}

function SectionCard({ sectionKey, title, qtyHeader, includes, total, groups, t }: SectionCardProps) {
  const rowCount = groups.reduce((acc, g) => acc + g.rows.length, 0);
  const isEmpty = rowCount === 0;
  const titleId = `custom-sec-${sectionKey}-title`;
  const th = "px-4 py-2.5 text-xs font-semibold text-muted-foreground";
  const various = t("reports.custom_price_various");

  return (
    <section
      id={`custom-sec-${sectionKey}`}
      aria-labelledby={titleId}
      className="rounded-xl border border-border bg-card"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 md:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={titleId} className="text-sm font-semibold">
            {title}
          </h3>
          <span
            className={cn(
              badgeVariants({ variant: "secondary" }),
              "rounded-full px-2 py-0 text-[11px] font-medium tabular-nums",
            )}
          >
            {rowCount}
          </span>
        </div>
        <p className="ml-auto flex items-baseline gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("reports.custom_total_section")}
          </span>
          <span className={cn("text-sm font-bold tabular-nums", isEmpty && "text-muted-foreground")}>
            {formatPEN(total)}
          </span>
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <caption className="sr-only">{title}</caption>
          <colgroup>
            <col />
            <col className="w-24" />
            <col className="w-48" />
            <col className="w-36" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th scope="col" className={cn(th, "text-left")}>{t("reports.custom_col_description")}</th>
              <th scope="col" className={cn(th, "text-right whitespace-nowrap")}>{qtyHeader}</th>
              <th scope="col" className={cn(th, "text-right")}>{t("reports.custom_col_price")}</th>
              <th scope="col" className={cn(th, "text-right")}>{t("reports.custom_col_total")}</th>
            </tr>
          </thead>
          <tbody>
            {isEmpty ? (
              // Sección aplicable pero sin cobros: se pinta igual, con una
              // fila "Sin cobros" (omitirla haría preguntar a la contadora).
              <tr className="border-b border-border/50 text-muted-foreground">
                <td className="px-4 py-2.5 italic">{t("reports.custom_empty_row")}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">—</td>
                <td className="px-4 py-2.5 text-right tabular-nums">—</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                  {formatPEN(0)}
                </td>
              </tr>
            ) : (
              groups.map((g, gi) => (
                <GroupRows key={gi} group={g} various={various} />
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-bold">
              <td colSpan={3} className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("reports.custom_total_prefix")} {title}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{formatPEN(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="border-t border-border/50 px-4 py-2 text-xs text-muted-foreground md:px-5">{includes}</p>
    </section>
  );
}

function GroupRows({ group, various }: { group: RowGroup; various: string }) {
  return (
    <>
      {group.label && (
        <tr className="border-b border-border/50 bg-muted/20">
          <td colSpan={4} className="px-4 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
            {group.hint && <span className="ml-2 font-normal normal-case tracking-normal">· {group.hint}</span>}
          </td>
        </tr>
      )}
      {group.rows.map((row, i) => (
        <tr
          key={`${row.description}-${i}`}
          className={cn(
            "border-b border-border/50 transition-colors hover:bg-muted/30",
            group.muted && "text-muted-foreground",
          )}
        >
          <td className="min-w-0 px-4 py-2.5">
            <p className="break-words font-medium">{row.description}</p>
          </td>
          <td className="px-4 py-2.5 text-right tabular-nums">{formatQty(row.quantity)}</td>
          <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{priceCell(row, various)}</td>
          <td className="px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
            {formatPEN(row.total)}
          </td>
        </tr>
      ))}
    </>
  );
}

// ─── Estados ──────────────────────────────────────────────────────────────

function EmptyCard({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof ListChecks;
  title: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-12 text-center">
      <Icon className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Esqueleto por sección (mismo lenguaje que reports/loading.tsx). */
function ReportSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 md:px-5">
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-4 w-24 rounded bg-muted" />
          </div>
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="h-4 rounded bg-muted" style={{ width: `${88 - j * 9}%` }} />
            ))}
          </div>
        </div>
      ))}
      <div className="h-24 rounded-xl border border-primary/20 bg-primary/5" />
    </div>
  );
}
