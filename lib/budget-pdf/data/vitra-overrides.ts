/**
 * Config resolution for the `budget_pdf_vitra` plugin (mig 169).
 *
 * Precedence per field (highest wins):
 *   1. `org_plugins.config` JSONB — explicit per-org override, editable
 *      from the founder panel without deploy. Escape hatch for copy the
 *      org tables can't express (e.g. a multi-sede footer).
 *   2. Real organization data (organizations.address / phone /
 *      email_public / website / print_color_primary) — the same fields
 *      every other printed document (recetas, notas, órdenes) already
 *      uses via renderClinicHeader. The clinic edits them in Ajustes.
 *   3. Empty string. Contact data is NEVER seeded in code — a clinic
 *      with incomplete Ajustes prints blanks, not another clinic's
 *      phone number.
 *
 * If you need to onboard a SECOND clinic with the same template,
 * install the same plugin key on that org: its PDFs come out with its
 * own Ajustes data automatically; the JSONB stays for fine-tuning.
 */

export interface OrgPdfOverrides {
  brand_color: string;
  // Header (esquina superior derecha de página 1)
  address: string;
  phones: string;
  email: string;
  website: string;
  // Footer (centrado, repetido en cada hoja). HTML raw — usa triple-stache.
  footer_html: string;
  // Línea final de página 3 — último recurso si la asesora asignada
  // no tiene celular en su perfil.
  advisor_phone_fallback: string;
}

/** Contact fields sourced from the `organizations` row (camelCase = BudgetPdfProps.org). */
export interface OrgContactSource {
  address?: string | null;
  phone?: string | null;
  phoneSecondary?: string | null;
  emailPublic?: string | null;
  website?: string | null;
  printColorPrimary?: string | null;
}

// Shape reference for the founder panel's config editor. Values are
// intentionally empty: real data lives in the org's Ajustes (mig 115),
// and this JSONB only overrides field-by-field.
export const VITRA_DEFAULT_CONFIG: OrgPdfOverrides = {
  brand_color: "#d2644f",
  address: "",
  phones: "",
  email: "",
  website: "",
  footer_html: "",
  advisor_phone_fallback: "",
};

/** "https://vitra.com.pe/" → "vitra.com.pe" — print-friendly website. */
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
 * Default footer built from the org's real contact data. Mirrors the
 * layout of the original multi-line footer (dirección / teléfonos /
 * email | web) with only the lines that have data.
 */
function buildFooterFromOrg(org: OrgContactSource): string {
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
    phones ? `<p>teléf.: <span class="loc">${escapeHtml(phones)}</span></p>` : "",
    emailWeb ? `<p>${emailWeb}</p>` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Resolve the effective PDF config: explicit JSONB override → real org
 * data → empty. Field by field, so an org can override just
 * `footer_html` (multi-sede) while header contact keeps tracking
 * Ajustes.
 */
export function resolveVitraConfig(
  rowConfig: Record<string, unknown>,
  org: OrgContactSource,
): OrgPdfOverrides {
  const explicit = (key: keyof OrgPdfOverrides): string | null => {
    const v = rowConfig[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  const phones = [org.phone, org.phoneSecondary].filter(Boolean).join(" / ");
  return {
    brand_color:
      explicit("brand_color") ??
      org.printColorPrimary ??
      VITRA_DEFAULT_CONFIG.brand_color,
    address: explicit("address") ?? org.address ?? "",
    phones: explicit("phones") ?? phones,
    email: explicit("email") ?? org.emailPublic ?? "",
    website:
      explicit("website") ?? (org.website ? displayWebsite(org.website) : ""),
    footer_html: explicit("footer_html") ?? buildFooterFromOrg(org),
    advisor_phone_fallback: explicit("advisor_phone_fallback") ?? org.phone ?? "",
  };
}
