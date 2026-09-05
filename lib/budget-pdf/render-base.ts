/**
 * Presupuesto GENÉRICO (Capa 1: orgs sin plugin de presupuesto) sobre el
 * motor único de documentos: Handlebars → HTML → Chromium headless.
 *
 *   plantilla  lib/pdf/html/templates/budget.hbs
 *   partials   lib/pdf/html/partials/*  (styles, sheetHead, meta, …)
 *   org        lib/pdf/html/org.ts      (branding real de Ajustes)
 *
 * Reemplaza al antiguo `<BudgetPdfDocument>` de @react-pdf/renderer para
 * que una clínica sin plugin imprima con la misma estética que los
 * plugins de Vitra y Patricia (que NO se tocan: siguen en su pipeline).
 *
 * Reglas de dinero: el monto impreso es `props.amount` tal cual —
 * ya trae el ajuste de honorarios (mig 174) sumado por `generate.ts`;
 * aquí no se recalcula ni se desglosa nada. La moneda sale de
 * `props.currency` (tier del servicio) y se formatea con el helper
 * `money` del motor.
 */

import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Database } from "@/types/database";
import { htmlToPdfBuffer } from "@/lib/pdf/html/chromium";
import { buildOrgDocBlock } from "@/lib/pdf/html/org";
import { renderDocumentHtml } from "@/lib/pdf/html/render";
import { resolveOrgTimezone, zonedNow } from "@/lib/org-time";
import type { BudgetPdfProps } from "./document";

type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];

export type BaseBudgetRenderProps = BudgetPdfProps & {
  budgetId: string;
  /** Fila (parcial) de `organizations`: alimenta `buildOrgDocBlock`. */
  orgRow: Partial<OrganizationRow> & { name?: string | null };
};

const TEMPLATE_FILE = "budget.hbs";

/**
 * Código legible del presupuesto. La BD todavía no guarda uno, así que
 * se sintetiza a partir del año + la cola del UUID — estable entre
 * renders del mismo presupuesto. MISMO criterio que Vitra
 * (`render-html.ts:synthBudgetCode`) y Patricia (`patricia/render.ts`),
 * para que el código no cambie si una org instala o retira un plugin.
 */
function synthBudgetCode(budgetId: string, issuedAt: Date): string {
  const year = issuedAt.getFullYear();
  const tail = budgetId.replace(/-/g, "").slice(-4).toUpperCase();
  return `P-${year}-${tail}`;
}

/**
 * "Qué incluye" → ítems. El texto del tier es libre (textarea en
 * /admin/services): una línea por ítem, con o sin viñeta ("•", "-",
 * "*", "·"). Líneas vacías se descartan; sin texto → lista vacía y la
 * plantilla omite la sección (nada inventado por tratamiento).
 */
export function splitIncludesText(includesText: string | null | undefined): string[] {
  if (!includesText) return [];
  return includesText
    .split(/\r?\n+/)
    .flatMap((line) => line.split(/\s+•\s+/))
    .map((line) => line.replace(/^\s*[•\-*·]\s*/, "").trim())
    .filter((line) => line.length > 0);
}

const TIER_LABEL: Record<"A" | "B" | "C", string> = {
  A: "Paquete A",
  B: "Paquete B",
  C: "Paquete C",
};

/** Contexto Handlebars de `budget.hbs`. Exportado para pruebas. */
export function buildBaseBudgetData(
  props: BaseBudgetRenderProps,
): Record<string, unknown> {
  const tz = resolveOrgTimezone(props.orgRow.timezone);

  // `props.fecha` es el instante de envío/asignación; su día civil se
  // lee en la zona de la org (Vercel corre en UTC — regla CLAUDE.md).
  const issuedAt = zonedNow(tz, props.fecha);
  const safeVigenciaDays =
    Number.isFinite(props.vigenciaDays) && props.vigenciaDays > 0
      ? props.vigenciaDays
      : 30;
  const validUntil = new Date(issuedAt);
  validUntil.setDate(validUntil.getDate() + safeVigenciaDays);

  const issuedShort = format(issuedAt, "dd/MM/yyyy", { locale: es });
  const validUntilShort = format(validUntil, "dd/MM/yyyy", { locale: es });

  const patientName =
    [props.patient.firstName, props.patient.lastName]
      .map((v) => (v ?? "").trim())
      .filter(Boolean)
      .join(" ") || "—";
  const documentLabel = props.patient.documentNumber
    ? `DNI ${props.patient.documentNumber}`
    : "—";
  const doctorName = (props.doctor.fullName ?? "").trim() || "—";
  const advisor = props.asesora
    ? {
        full_name: props.asesora.fullName,
        phone: (props.asesora.phone ?? "").trim(),
      }
    : null;

  const code = synthBudgetCode(props.budgetId, issuedAt);
  const org = buildOrgDocBlock(props.orgRow);

  // mig 181 — precio único: sin rótulo de paquete.
  const tierLabel =
    !props.singlePricing && props.tier ? TIER_LABEL[props.tier] : "";

  const terms = (props.terms ?? [])
    .map((t) => (t ?? "").trim())
    .filter(Boolean);

  const meta: Array<{ label: string; value: string; num?: boolean }> = [
    { label: "Paciente", value: patientName },
    { label: "Documento", value: documentLabel, num: true },
    { label: "Fecha de emisión", value: issuedShort, num: true },
    { label: "Médico tratante", value: doctorName },
  ];
  if (advisor) {
    meta.push({ label: "Asesora de fertilidad", value: advisor.full_name });
  }
  meta.push({ label: "Vigencia", value: `hasta ${validUntilShort}`, num: true });

  return {
    doc: {
      title: props.service.name,
      eyebrow: "Presupuesto de tratamiento",
      code,
      issued_label: `Emitido ${issuedShort}`,
      // "Hoy" civil de la org (no `new Date()` a secas: Vercel corre en UTC).
      footer_note: `Presupuesto ${code} · generado el ${format(zonedNow(tz), "dd/MM/yyyy")}`,
    },
    org,
    meta,
    // 3 columnas: con asesora son 6 celdas (2 filas llenas); sin ella,
    // 5 celdas y la última fila queda con dos.
    metaCols: 3,
    patient: { full_name: patientName },
    doctor: { full_name: doctorName },
    advisor,
    budget: {
      amount: props.amount,
      currency: props.currency,
      currency_label:
        props.currency === "USD" ? "dólares americanos" : "soles",
      tier_label: tierLabel,
      valid_until_short: validUntilShort,
      vigencia_days: safeVigenciaDays,
    },
    includes: splitIncludesText(props.includesText),
    terms,
    footer_text: (props.footerText ?? "").trim(),
  };
}

/** Solo el HTML — para pruebas sin Chromium. */
export async function renderBaseBudgetHtml(
  props: BaseBudgetRenderProps,
): Promise<string> {
  return renderDocumentHtml(TEMPLATE_FILE, buildBaseBudgetData(props));
}

/** Presupuesto genérico → PDF A4 (Buffer). */
export async function renderBaseBudgetPdf(
  props: BaseBudgetRenderProps,
): Promise<Buffer> {
  const html = await renderBaseBudgetHtml(props);
  return htmlToPdfBuffer(html);
}
