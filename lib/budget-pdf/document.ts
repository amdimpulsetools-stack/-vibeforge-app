/**
 * `BudgetPdfProps` — contrato de datos de TODO presupuesto en PDF.
 *
 * Lo arma `generate.ts` a partir del `budget_records` real (paciente,
 * médico, asesora, servicio, tier, monto, moneda, vigencia, términos de
 * `org_budget_pdf_settings`) y lo consumen:
 *   - los plugins Capa 2 (`render-html.ts` Vitra, `patricia/render.ts`)
 *     vía `lib/plugins/registry.ts`;
 *   - el presupuesto genérico Capa 1 (`render-base.ts`, motor HTML de
 *     `lib/pdf/html/`).
 *
 * Histórico: este archivo era `document.tsx` y traía el componente
 * `<BudgetPdfDocument>` de `@react-pdf/renderer`. Ese render se retiró
 * cuando el presupuesto genérico pasó al motor HTML → Chromium (misma
 * estética que los plugins); solo queda el tipo, con la misma ruta de
 * import para no tocar a los plugins.
 */

export interface BudgetPdfProps {
  org: {
    name: string;
    ruc?: string | null;
    logoDataUrl?: string | null;
    // Contacto real de la organización (mig 115, editable en Ajustes).
    // Los templates Capa 2 lo imprimen en header/footer en lugar de
    // datos seedeados; el genérico lo toma de `orgRow` vía
    // `buildOrgDocBlock` (lib/pdf/html/org.ts).
    address?: string | null;
    phone?: string | null;
    phoneSecondary?: string | null;
    emailPublic?: string | null;
    website?: string | null;
    printColorPrimary?: string | null;
  };
  patient: {
    firstName: string;
    lastName: string;
    documentNumber?: string | null;
  };
  doctor: { fullName: string };
  asesora: { fullName: string; phone?: string | null } | null;
  service: { name: string; treatmentType: string };
  tier: "A" | "B" | "C" | null;
  amount: number;
  // Sobreprecio de honorarios médicos (mig 174). Ya está incluido en
  // `amount`; se expone por separado para las plantillas que itemizan
  // honorarios (Vitra FIV) y necesitan integrarlo en esa línea + total.
  // Ausente/0 = sin ajuste.
  honorariosAdjustment?: number;
  currency: "PEN" | "USD";
  includesText: string | null;
  fecha: Date;
  // Per-org customization (Capa 1). The generator always supplies
  // these — pulled from `org_budget_pdf_settings` with a hardcoded
  // fallback for the rare case the row is missing.
  vigenciaDays: number;
  terms: string[];
  footerText: string;
  // mig 181 — pricing_mode='single': la org maneja un precio único por
  // tratamiento (tier='A' interno). El PDF omite la fila "Tier" y el
  // rótulo "PAQUETE X" para no insinuar paquetes que no se ofrecen.
  singlePricing?: boolean;
}
