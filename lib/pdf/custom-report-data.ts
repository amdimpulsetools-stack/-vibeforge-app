/**
 * Datos del PDF "Resumen de cobros del periodo" (reporte personalizado).
 *
 *   /api/pdf/custom-report?org_id&from&to&sections   → custom-report.hbs
 *
 * Puro (sin Supabase): la ruta carga el JSON del RPC `get_custom_report`
 * (types/custom-report.ts) y la fila de `organizations`; aquí solo se
 * ORDENA y se REDACTA. Un número, una fórmula (CLAUDE.md): ningún monto se
 * recalcula. Los totales de sección, `grand_total` y
 * `expected_grand_total` se imprimen tal cual llegan; la única operación
 * aritmética es la comparación estricta de cuadre y la diferencia que se
 * muestra SOLO cuando no cuadra (aviso, no cifra contable).
 *
 * Moneda: el helper `{{money}}` de render.ts pinta cada cifra en la
 * plantilla; el texto de la celda Precio ("varios (S/ 180.00 – 200.00)")
 * usa el MISMO `formatMoney` exportado, no otra copia del formato.
 */

import { buildOrgDocBlock, type OrgDocBlock } from "@/lib/pdf/html/org";
import { formatMoney } from "@/lib/pdf/html/render";
import { resolveOrgTimezone, todayInTz } from "@/lib/org-time";
import { generatedFooterNote, type OrgDocRow } from "@/lib/pdf/prescription-data";
import {
  CUSTOM_REPORT_SECTIONS,
  type CustomReport,
  type CustomReportAdvanceKind,
  type CustomReportAdvanceRow,
  type CustomReportPharmacyRow,
  type CustomReportRowBase,
  type CustomReportSectionKey,
} from "@/types/custom-report";

// ── Vocabulario fijo (spec §2) ────────────────────────────────────

interface SectionMeta {
  title: string;
  /** "Qué incluye", línea llana para la doctora (spec §2). */
  includes: string;
  /** Cabecera de la columna Cantidad: cada sección cuenta cosas distintas. */
  qty_label: string;
  /** Singular / plural para el chip "3 servicios". */
  unit: [string, string];
}

export const CUSTOM_REPORT_SECTION_META: Record<CustomReportSectionKey, SectionMeta> = {
  services: {
    title: "Servicios",
    includes: "Lo cobrado en el periodo sobre citas del periodo",
    qty_label: "Citas",
    unit: ["servicio", "servicios"],
  },
  advances: {
    title: "Adelantos y pagos a cuenta",
    includes: "Pagos del periodo por citas de otras fechas, anticipos a planes y abonos sin cita",
    qty_label: "Pagos",
    unit: ["concepto", "conceptos"],
  },
  pharmacy: {
    title: "Farmacia",
    includes: "Ventas de mostrador (productos y servicios vendidos en POS)",
    qty_label: "Unid.",
    unit: ["producto", "productos"],
  },
  treatments: {
    title: "Cobros por tratamientos",
    includes: "Pagos de tratamientos por concepto",
    qty_label: "Pagos",
    unit: ["concepto", "conceptos"],
  },
};

/** Sub-grupos de Adelantos, en el orden en que se imprimen. */
const ADVANCE_KINDS: ReadonlyArray<{ kind: CustomReportAdvanceKind; label: string }> = [
  { kind: "appointment_future", label: "Cita futura" },
  { kind: "appointment_past", label: "Cita anterior" },
  { kind: "plan", label: "Anticipo a plan" },
  { kind: "direct", label: "Abono directo" },
];

const PHARMACY_VOIDED_LABEL = "Ventas anuladas (siguen contadas en Cobrado total)";

export const CUSTOM_REPORT_FOOTNOTE =
  "Montos brutos con IGV, por fecha de cobro. Cantidad × Precio puede no coincidir con Total por cobros parciales y descuentos.";

// ── Redacción de celdas ───────────────────────────────────────────

/**
 * Texto de la columna Precio (spec §9.2): el precio real si es único;
 * "varios (min – max)" si difiere; "—" si la fila no tiene precio unitario
 * (abono directo, ventas anuladas…). Nunca un promedio.
 */
export function priceCell(row: CustomReportRowBase): string {
  if (row.price !== null && row.price !== undefined) return formatMoney(row.price);
  if (
    row.price_min !== null &&
    row.price_min !== undefined &&
    row.price_max !== null &&
    row.price_max !== undefined
  ) {
    if (row.price_min === row.price_max) return formatMoney(row.price_min);
    return `varios (${formatMoney(row.price_min)} – ${formatMoney(row.price_max)})`;
  }
  return "—";
}

/**
 * Cantidad: enteros en servicios/adelantos/tratamientos; farmacia puede
 * traer hasta 3 decimales (SUM(quantity) numeric). Mismo criterio que
 * `fmtQty` de Almacén (sin ceros de relleno).
 */
export function quantityCell(n: number): string {
  const r = Math.round((Number(n) || 0) * 1000) / 1000;
  return r.toLocaleString("es-PE", { maximumFractionDigits: 3 });
}

// ── Fechas (texto, sin Date de negocio) ───────────────────────────

/** Meses en el español del Perú: "setiembre", no "septiembre". */
const MONTHS_PE = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

function ymd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

/**
 * "Del 1 al 10 de setiembre de 2026" · "Del 28 de agosto al 4 de setiembre
 * de 2026" · "Del 28 de diciembre de 2025 al 4 de enero de 2026" ·
 * "Hoy, 11 de setiembre de 2026" (un solo día y es hoy en la org) ·
 * "El 5 de setiembre de 2026" (un solo día pasado).
 */
export function formatRangeLabel(from: string, to: string, today?: string): string {
  const a = ymd(from);
  const b = ymd(to);
  const mon = (m: number) => MONTHS_PE[m - 1] ?? "";
  if (from === to) {
    const day = `${a.d} de ${mon(a.m)} de ${a.y}`;
    return from === today ? `Hoy, ${day}` : `El ${day}`;
  }
  if (a.y === b.y && a.m === b.m) return `Del ${a.d} al ${b.d} de ${mon(a.m)} de ${a.y}`;
  if (a.y === b.y) return `Del ${a.d} de ${mon(a.m)} al ${b.d} de ${mon(b.m)} de ${a.y}`;
  return `Del ${a.d} de ${mon(a.m)} de ${a.y} al ${b.d} de ${mon(b.m)} de ${b.y}`;
}

/** "11/09/2026 14:32" con el reloj de pared de la org. */
function stampInTz(timezone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("es-PE", {
    timeZone: resolveOrgTimezone(timezone),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

// ── Contexto de la plantilla ──────────────────────────────────────

export interface CustomReportDocRow {
  description: string;
  quantity_text: string;
  price_text: string;
  /** Se imprime con `{{money total}}`. */
  total: number;
  /** Fila atenuada (venta anulada). */
  muted: boolean;
}

export interface CustomReportDocGroup {
  /** Subtítulo del grupo (Adelantos por `kind`, "Ventas anuladas…"); null = sin subtítulo. */
  label: string | null;
  rows: CustomReportDocRow[];
}

export interface CustomReportDocSection {
  key: CustomReportSectionKey;
  title: string;
  includes: string;
  qty_label: string;
  /** "3 servicios" (cuenta FILAS, no la columna Cantidad). */
  count_label: string;
  groups: CustomReportDocGroup[];
  total: number;
  /** Sección disponible pero sin cobros: la plantilla imprime "Sin cobros · S/ 0.00". */
  empty: boolean;
}

export interface CustomReportDocData extends Record<string, unknown> {
  doc: {
    title: string;
    subtitle: string;
    eyebrow: string;
    range_label: string;
    generated_at: string;
    generated_by: string;
    issued_label: string;
    footer_note: string;
  };
  org: OrgDocBlock;
  meta: Array<{ label: string; value: string; wide?: boolean }>;
  metaCols: number;
  sections: CustomReportDocSection[];
  grand: {
    total: number;
    expected_total: number;
    /** `grand_total === expected_grand_total` (comparación estricta, spec §3). */
    reconciles: boolean;
    /** grand_total − expected_grand_total; solo se muestra cuando no cuadra. */
    difference: number;
    /** Títulos de las secciones impresas, "Servicios · Farmacia". */
    included_label: string;
    parts: Array<{ title: string; total: number }>;
    /** Secciones disponibles que NO se pidieron (por nombre, sin montos). */
    excluded: string[];
    /** Texto de la línea de cuadre. */
    recon_label: string;
    recon_state: "ok" | "partial" | "diff";
    /** Devoluciones de Caja en el rango, solo si ≠ 0 (informativo, fuera del total). */
    refunds_abs: number | null;
    refunds_negative: boolean;
  };
  footnote: string;
}

function toDocRow(row: CustomReportRowBase, muted = false): CustomReportDocRow {
  return {
    description: (row.description ?? "").trim() || "—",
    quantity_text: quantityCell(row.quantity),
    price_text: priceCell(row),
    total: Number(row.total ?? 0),
    muted,
  };
}

function groupsFor(
  key: CustomReportSectionKey,
  rows: CustomReportRowBase[],
): CustomReportDocGroup[] {
  if (key === "advances") {
    const byKind = rows as CustomReportAdvanceRow[];
    return ADVANCE_KINDS.map(({ kind, label }) => ({
      label,
      rows: byKind.filter((r) => r.kind === kind).map((r) => toDocRow(r)),
    })).filter((g) => g.rows.length > 0);
  }
  if (key === "pharmacy") {
    const ph = rows as CustomReportPharmacyRow[];
    const live = ph.filter((r) => !r.voided).map((r) => toDocRow(r));
    const voided = ph.filter((r) => r.voided).map((r) => toDocRow(r, true));
    const groups: CustomReportDocGroup[] = [];
    if (live.length) groups.push({ label: null, rows: live });
    if (voided.length) groups.push({ label: PHARMACY_VOIDED_LABEL, rows: voided });
    return groups;
  }
  return rows.length ? [{ label: null, rows: rows.map((r) => toDocRow(r)) }] : [];
}

export interface BuildCustomReportDocOptions {
  /** Instante de generación (default: ahora). Inyectable para pruebas. */
  now?: Date;
}

/**
 * JSON del RPC + fila de la org + nombre de quien imprime → contexto de
 * `custom-report.hbs`. Solo entran las secciones PRESENTES (no null) y
 * DISPONIBLES (`sections_available`), en el orden canónico.
 */
export function buildCustomReportDocData(
  report: CustomReport,
  orgRow: OrgDocRow,
  generatedBy: string,
  opts: BuildCustomReportDocOptions = {},
): CustomReportDocData {
  const now = opts.now ?? new Date();
  const org = buildOrgDocBlock(orgRow);
  const tz = resolveOrgTimezone(report.range?.timezone ?? orgRow.timezone);
  const today = todayInTz(tz, now);

  const sections: CustomReportDocSection[] = [];
  const excluded: string[] = [];
  for (const key of CUSTOM_REPORT_SECTIONS) {
    if (!report.sections_available?.[key]) continue; // no aplica: no existe en el papel
    const meta = CUSTOM_REPORT_SECTION_META[key];
    const data = report.sections?.[key];
    if (!data) {
      excluded.push(meta.title); // disponible pero no marcada
      continue;
    }
    const rows = (data.rows ?? []) as CustomReportRowBase[];
    const n = rows.length;
    sections.push({
      key,
      title: meta.title,
      includes: meta.includes,
      qty_label: meta.qty_label,
      count_label: `${n} ${n === 1 ? meta.unit[0] : meta.unit[1]}`,
      groups: groupsFor(key, rows),
      total: Number(data.total ?? 0),
      empty: n === 0,
    });
  }

  const grandTotal = Number(report.grand_total ?? 0);
  const expected = Number(report.reconciliation?.expected_grand_total ?? 0);
  const reconciles = grandTotal === expected;
  const includesTreatments = sections.some((s) => s.key === "treatments");

  let recon_state: "ok" | "partial" | "diff";
  let recon_label: string;
  if (!reconciles) {
    recon_state = "diff";
    const diff = grandTotal - expected;
    // Signo tipográfico delante del símbolo ("−S/ 320.00"), no "S/ -320.00".
    const diffText = `${diff < 0 ? "−" : "+"}${formatMoney(Math.abs(diff))}`;
    recon_label =
      `No cuadra con el Financiero: se esperaba ${formatMoney(expected)} ` +
      `(diferencia ${diffText}). Revisa ventas anuladas o cobros sin detalle.`;
  } else if (excluded.length === 0) {
    recon_state = "ok";
    recon_label = includesTreatments
      ? "Coincide con «Cobrado total» + «Cobros por tratamientos» del Financiero."
      : "Coincide con «Cobrado total» del Financiero.";
  } else {
    recon_state = "partial";
    recon_label = `Total de lo marcado; excluye: ${excluded.join(", ")}.`;
  }

  const refunds = Number(report.reconciliation?.refunds_in_range ?? 0);
  const rangeLabel = formatRangeLabel(report.range.from, report.range.to, today);
  const generatedAt = stampInTz(tz, now);
  const by = (generatedBy ?? "").trim() || "—";
  const includedLabel = sections.map((s) => s.title).join(" · ");

  return {
    doc: {
      title: "Resumen de cobros del periodo",
      subtitle: "Lo que entró, por concepto · bruto con IGV · por fecha de cobro",
      eyebrow: "Reportes",
      range_label: rangeLabel,
      generated_at: generatedAt,
      generated_by: by,
      issued_label: `Generado el ${generatedAt}`,
      footer_note: `${generatedFooterNote(tz, now)} · por ${by}`,
    },
    org,
    meta: [
      { label: "Periodo", value: rangeLabel },
      { label: "Secciones", value: includedLabel || "—" },
      // "Generado el" ya va en la fila del título (doc.issued_label): no se repite.
      { label: "Generado por", value: by },
    ],
    metaCols: 3,
    sections,
    grand: {
      total: grandTotal,
      expected_total: expected,
      reconciles,
      difference: grandTotal - expected,
      included_label: includedLabel,
      parts: sections.map((s) => ({ title: s.title, total: s.total })),
      excluded,
      recon_label,
      recon_state,
      refunds_abs: refunds !== 0 ? Math.abs(refunds) : null,
      refunds_negative: refunds < 0,
    },
    footnote: CUSTOM_REPORT_FOOTNOTE,
  };
}
