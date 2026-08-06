/**
 * Config resolution for the `budget_pdf_patricia` plugin.
 *
 * Same three-step chain as `data/vitra-overrides.ts` — deliberately a
 * separate module so the two clinics can diverge (Patricia's shape has
 * `doctor_license`, Vitra's has `advisor_phone_fallback` semantics of
 * its own) without either one's edits touching the other's render:
 *
 *   1. `org_plugins.config` JSONB — explicit per-org override, editable
 *      from the founder panel without a deploy.
 *   2. Real organization data (organizations.address / phone /
 *      phone_secondary / email_public / website / print_color_primary)
 *      — the fields the clinic edits in Ajustes, already used by every
 *      other printed document.
 *   3. Empty string.
 *
 * NOTHING about REPROFERTILIDAD EIRL is seeded here. The .docx
 * originals carry a letterhead image and no machine-readable contact
 * block, so there is nothing to lift even if we wanted to: address,
 * phones, email, website and logo all come from the org row, and the
 * PDF simply omits the line when the field is empty (founder decision
 * 2026-08-06 — "todo desde los datos de la org").
 */

/** Contact fields sourced from the `organizations` row (camelCase = BudgetPdfProps.org). */
export interface PatriciaContactSource {
  address?: string | null;
  phone?: string | null;
  phoneSecondary?: string | null;
  emailPublic?: string | null;
  website?: string | null;
  printColorPrimary?: string | null;
}

export interface PatriciaPdfOverrides {
  brand_color: string;
  // Header (esquina superior derecha de página 1)
  address: string;
  phones: string;
  email: string;
  website: string;
  // Footer (centrado, repetido en cada hoja). HTML raw — usa triple-stache.
  footer_html: string;
  // Última línea del documento — si la asesora asignada no tiene celular
  // en su perfil.
  advisor_phone_fallback: string;
  /**
   * Colegiatura de la médico (CMP / RNE), impresa bajo su nombre en el
   * bloque de firmas.
   *
   * Se buscó en los 13 .docx de `docs/Budgets/NUEVOS PRESUPUESTOS PARA
   * IMPRIMIR/` y NINGUNO la trae (los originales solo dicen "MEDICO:
   * DRA PATRICIA QUISPE ALMANDOZ"). El founder autorizó hardcodearla
   * *si aparecía en los documentos*; como no aparece, queda vacía y la
   * plantilla omite la línea. Para activarla basta escribir
   * `{"doctor_license": "CMP 12345"}` en `org_plugins.config` desde el
   * panel de founder — sin deploy.
   */
  doctor_license: string;
}

// Shape reference for the founder panel's config editor. Values are
// intentionally empty except the brand color fallback: real data lives
// in the org's Ajustes (mig 115) and this JSONB only overrides
// field-by-field.
export const PATRICIA_DEFAULT_CONFIG: PatriciaPdfOverrides = {
  // Emerald del producto (CLAUDE.md · acento primario). Si la org fija
  // `print_color_primary` en Ajustes, ese gana. Se eligió el acento
  // neutro de Yenda y no un color de marca inventado: la clínica aún no
  // ha subido su identidad visual.
  brand_color: "#0f766e",
  address: "",
  phones: "",
  email: "",
  website: "",
  footer_html: "",
  advisor_phone_fallback: "",
  doctor_license: "",
};

/** "https://ejemplo.com.pe/" → "ejemplo.com.pe" — print-friendly website. */
function displayWebsite(w: string): string {
  return w.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Default footer built from the org's real contact data — only the
 * lines that actually have data, so an org with Ajustes a medio llenar
 * imprime menos líneas, nunca las de otra clínica.
 */
function buildFooterFromOrg(org: PatriciaContactSource): string {
  const phones = [org.phone, org.phoneSecondary].filter(Boolean).join(" / ");
  const emailWeb = [
    org.emailPublic,
    org.website ? displayWebsite(org.website) : null,
  ]
    .filter(Boolean)
    .map((v) => escapeHtml(v as string))
    .join("&nbsp;&nbsp;|&nbsp;&nbsp;");
  const lines = [
    org.address ? `<p>${escapeHtml(org.address)}</p>` : "",
    phones
      ? `<p>teléf.: <span class="loc">${escapeHtml(phones)}</span></p>`
      : "",
    emailWeb ? `<p>${emailWeb}</p>` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Resolve the effective PDF config: explicit JSONB override → real org
 * data → empty. Field by field, so the clinic can override just
 * `footer_html` while the header contact keeps tracking Ajustes.
 */
export function resolvePatriciaConfig(
  rowConfig: Record<string, unknown>,
  org: PatriciaContactSource,
): PatriciaPdfOverrides {
  const explicit = (key: keyof PatriciaPdfOverrides): string | null => {
    const v = rowConfig[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  const phones = [org.phone, org.phoneSecondary].filter(Boolean).join(" / ");
  return {
    brand_color:
      explicit("brand_color") ??
      org.printColorPrimary ??
      PATRICIA_DEFAULT_CONFIG.brand_color,
    address: explicit("address") ?? org.address ?? "",
    phones: explicit("phones") ?? phones,
    email: explicit("email") ?? org.emailPublic ?? "",
    website:
      explicit("website") ?? (org.website ? displayWebsite(org.website) : ""),
    footer_html: explicit("footer_html") ?? buildFooterFromOrg(org),
    advisor_phone_fallback:
      explicit("advisor_phone_fallback") ?? org.phone ?? "",
    doctor_license: explicit("doctor_license") ?? "",
  };
}
