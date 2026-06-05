/**
 * Hardcoded data for NATURVITRA S.A.C. that the template needs but
 * doesn't yet live in DB (brand color, address, phones, footer HTML,
 * advisor phone, etc.).
 *
 * Detection: matched by `organizations.legal_name` containing
 * "NATURVITRA" (case-insensitive). See `generate.tsx` switch.
 *
 * Next step (post-test): migrate these to `org_budget_pdf_settings`
 * so every org can self-configure.
 *
 * TODO confirmar con Vitra: header address/phones/email/website.
 * Footer está copiado tal cual del .docx original.
 */

export interface OrgPdfOverrides {
  brand_color: string;        // "#d2644f"
  // Header (esquina superior derecha de página 1)
  address: string;
  phones: string;
  email: string;
  website: string;
  // Footer (centrado, repetido en cada hoja). HTML raw — usa triple-stache.
  footer_html: string;
  // Línea final de página 3
  advisor_phone_fallback: string;
}

export const VITRA_OVERRIDES: OrgPdfOverrides = {
  brand_color: "#d2644f",
  address: "Av. Javier Prado Este 1010 · Clínica Ricardo Palma, San Isidro — Lima",
  phones: "+51 977 597 501 / +51 936 094 214",
  email: "consultas@reproduccionperu.com",
  website: "www.reproduccionperu.com",
  footer_html: `<p>Av. Javier Prado Este 1010 (Torre B, 2.<sup>do</sup> Piso) · Consultorio 204 · Clínica Ricardo Palma</p>
<p><span class="loc">San Isidro</span> · teléf.: (01) 281 3329 · <span class="loc">cel. 977 597 501</span></p>
<p>Av. Primavera 517 oficina 202 · <span class="loc">San Borja</span> · teléf.: (01) 717 8412 · <span class="loc">cel. 936 094 214</span></p>
<p>consultas@reproduccionperu.com&nbsp;&nbsp;|&nbsp;&nbsp;<span class="loc">www.reproduccionperu.com</span></p>`,
  advisor_phone_fallback: "+51 987 654 321",
};

const VITRA_LEGAL_NAME_NEEDLE = "naturvitra";

/**
 * Returns the per-org overrides bundle for a given org legal_name, or
 * `null` if the org is not yet onboarded to the HTML template pipeline.
 *
 * Today only NATURVITRA is wired. Add more clinics here as they sign on.
 */
export function getOrgPdfOverrides(
  legalName: string | null,
): OrgPdfOverrides | null {
  if (!legalName) return null;
  const needle = legalName.toLowerCase();
  if (needle.includes(VITRA_LEGAL_NAME_NEEDLE)) return VITRA_OVERRIDES;
  return null;
}
