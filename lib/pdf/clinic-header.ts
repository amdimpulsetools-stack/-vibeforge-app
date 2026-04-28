/**
 * Shared HTML renderer for the clinic letterhead used on every printable
 * PDF (prescription, clinical note, exam order, treatment plan, etc.).
 *
 * Single source of truth: every print template imports this helper, so any
 * change to the brand layout propagates consistently. The same renderer
 * also drives the live preview modal in /settings → Perfil de organización
 * — so what you see while configuring is exactly what will print.
 *
 * Inputs are intentionally permissive (all fields nullable) so partially-
 * configured orgs still produce a sane header. Unknown / empty fields are
 * silently skipped from the output.
 */

export interface ClinicHeaderData {
  name: string;
  tagline?: string | null;
  logo_url?: string | null;
  legal_name?: string | null;
  ruc?: string | null;
  address?: string | null;
  district?: string | null;
  phone?: string | null;
  phone_secondary?: string | null;
  email_public?: string | null;
  website?: string | null;
  social_facebook?: string | null;
  social_instagram?: string | null;
  social_tiktok?: string | null;
  social_linkedin?: string | null;
  social_youtube?: string | null;
  social_whatsapp?: string | null;
  print_color_primary?: string | null;
}

export interface ClinicHeaderOptions {
  /** Toggle the bottom border separator below the header. Default: true. */
  showSeparator?: boolean;
  /** Compact mode for documents printed on A5 (recetas). Default: false. */
  compact?: boolean;
}

const DEFAULT_COLOR = "#10b981";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Joins non-empty strings with a separator ("·"). Falsy values are skipped.
 */
function joinParts(parts: (string | null | undefined)[], sep = " · "): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).map(escapeHtml).join(sep);
}

/**
 * Returns the HTML string for the clinic letterhead. Designed to be embedded
 * inside a `<body>` of a printable document (no `<html>`/`<head>` wrapper).
 */
export function renderClinicHeader(
  org: ClinicHeaderData,
  opts: ClinicHeaderOptions = {}
): string {
  const { showSeparator = true, compact = false } = opts;
  const color = org.print_color_primary || DEFAULT_COLOR;

  const sizes = compact
    ? { name: 14, tag: 10, line: 9, logo: 36 }
    : { name: 17, tag: 12, line: 10.5, logo: 56 };

  const logoBlock = org.logo_url
    ? `<div style="flex:0 0 auto;margin-right:14px;">
         <img
           src="${escapeHtml(org.logo_url)}"
           alt="${escapeHtml(org.name)}"
           style="width:${sizes.logo}px;height:${sizes.logo}px;object-fit:contain;display:block;"
         />
       </div>`
    : "";

  // Address line: "Av. Salaverry 2585, San Isidro"
  const fullAddress = joinParts([org.address, org.district], ", ");

  // Phones line: "+51 999 999 999 / +51 996 996 996"
  const phonesLine = [org.phone, org.phone_secondary]
    .filter((p): p is string => Boolean(p && p.trim()))
    .map(escapeHtml)
    .join(" / ");

  // Web/email line. Email is a clickable mailto in PDF (Chrome respects it).
  const webEmailLine = joinParts([
    org.email_public ? `<a href="mailto:${escapeHtml(org.email_public)}" style="color:inherit;text-decoration:none;">${escapeHtml(org.email_public)}</a>` : null,
    org.website ? escapeHtml(org.website.replace(/^https?:\/\//, "")) : null,
  ]);

  // Legal line: "RUC: 20123456789 · Razon Social SAC"
  const legalLine = joinParts([
    org.ruc ? `RUC: ${escapeHtml(org.ruc)}` : null,
    org.legal_name,
  ]);

  // Body lines, stacked. Empty ones are filtered out.
  const lines: string[] = [];
  if (org.tagline) {
    lines.push(
      `<div style="font-size:${sizes.tag}px;color:#6b7280;font-style:italic;margin-top:2px;">${escapeHtml(org.tagline)}</div>`
    );
  }
  if (fullAddress) {
    lines.push(
      `<div style="font-size:${sizes.line}px;color:#374151;margin-top:6px;">${fullAddress}</div>`
    );
  }
  if (phonesLine) {
    lines.push(
      `<div style="font-size:${sizes.line}px;color:#374151;">${phonesLine}</div>`
    );
  }
  if (webEmailLine) {
    lines.push(
      `<div style="font-size:${sizes.line}px;color:#374151;">${webEmailLine}</div>`
    );
  }
  if (legalLine) {
    lines.push(
      `<div style="font-size:${sizes.line}px;color:#6b7280;margin-top:2px;">${legalLine}</div>`
    );
  }

  return `
<div style="display:flex;align-items:flex-start;${
    showSeparator ? `border-bottom:2px solid ${color};` : ""
  }padding-bottom:${compact ? 8 : 12}px;margin-bottom:${compact ? 10 : 16}px;">
  ${logoBlock}
  <div style="flex:1;min-width:0;">
    <div style="font-size:${sizes.name}px;font-weight:700;color:${color};line-height:1.2;">${escapeHtml(
    org.name
  )}</div>
    ${lines.join("\n    ")}
  </div>
</div>`.trim();
}

/**
 * Lightweight version: just the org name + RUC line, for documents where
 * a full letterhead is too much (e.g. SUNAT comprobantes already have their
 * own format). Keeps brand presence without competing for space.
 */
export function renderClinicHeaderMini(org: ClinicHeaderData): string {
  const color = org.print_color_primary || DEFAULT_COLOR;
  const ruc = org.ruc ? ` · RUC: ${escapeHtml(org.ruc)}` : "";
  return `<div style="font-size:11px;color:${color};font-weight:600;margin-bottom:8px;">${escapeHtml(
    org.name
  )}${ruc}</div>`;
}
