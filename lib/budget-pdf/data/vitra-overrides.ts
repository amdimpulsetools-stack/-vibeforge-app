/**
 * Default config for the `budget_pdf_vitra` plugin (mig 169).
 *
 * Lives in code as the source of truth for the shape (the TS type
 * + the baseline values). Each Vitra-onboarded org gets a row in
 * `org_plugins` whose `config` JSONB starts as `{}` (use everything
 * from defaults) and can be overridden field-by-field as the clinic
 * iterates on header copy, phones, brand color, etc. — without a
 * code deploy.
 *
 * If you need to onboard a SECOND clinic with the same template but
 * a different brand (e.g. "Reproducción Lima"), install the same
 * plugin key on that org and override the relevant fields in the
 * JSONB config. No code change needed.
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

export const VITRA_DEFAULT_CONFIG: OrgPdfOverrides = {
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

/**
 * Merge a plugin row's `config` JSONB on top of the defaults. Field
 * by field — anything missing or null in the row falls through to
 * the default. Lets an org override only the bits that differ
 * (e.g. just `brand_color`) without re-supplying every field.
 */
export function mergeVitraConfig(
  rowConfig: Record<string, unknown>,
): OrgPdfOverrides {
  const out: OrgPdfOverrides = { ...VITRA_DEFAULT_CONFIG };
  for (const key of Object.keys(out) as (keyof OrgPdfOverrides)[]) {
    const v = rowConfig[key];
    if (typeof v === "string" && v.length > 0) {
      out[key] = v;
    }
  }
  return out;
}
