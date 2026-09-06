/**
 * Bloque `org` que consumen los partials base (`sheetHead`, `runHead`,
 * `pageFooter`, `head`). Sale SIEMPRE de la fila real de `organizations`
 * (branding editable en Ajustes → General): nunca datos sembrados de
 * otra clínica. Cada línea se omite si el dato está vacío.
 *
 * `brand_color` = `print_color_primary` de la org (el color con el que
 * ya imprime su membrete) con fallback al esmeralda de Yenda. Las
 * tintas derivadas (`--brand-deep`, `--brand-tint`) las calcula el CSS
 * con `color-mix()`, así una org morada y una coral se ven igual de bien.
 */

import type { Database } from "@/types/database";

type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];

export const YENDA_BRAND_FALLBACK = "#10b981";

export interface OrgDocBlock {
  /** Nombre comercial (cabecera). */
  display_name: string;
  /** Razón social (firmas, pie); cae al nombre comercial. */
  legal_name: string;
  tagline: string;
  tax_id: string;
  logo_url: string;
  brand_color: string;
  address: string;
  contact_line: string;
  website: string;
  /** HTML ya escapado para el pie repetido en cada hoja. */
  footer_html: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function displayWebsite(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim());
}

/**
 * `logo_url` va a un `src` que carga Chromium en el servidor. Viene de
 * Storage (https), pero la columna se escribe desde el cliente con
 * PostgREST, así que solo se acepta http(s): nada de `javascript:`,
 * `file:` ni rutas internas. Sin URL válida el partial imprime el nombre.
 */
function safeHttpUrl(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return /^https?:\/\//i.test(s) ? s : "";
}

export function buildOrgDocBlock(
  org: Partial<OrganizationRow> & { name?: string | null },
): OrgDocBlock {
  const name = (org.name ?? "").trim();
  const legal = (org.legal_name ?? "").trim() || name;
  const address = [org.address, org.district]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const phones = [org.phone, org.phone_secondary]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" / ");
  const email = (org.email_public ?? "").trim();
  const website = org.website ? displayWebsite(org.website.trim()) : "";

  const footerLines = [
    address ? `<p>${escapeHtml(address)}</p>` : "",
    phones ? `<p>teléf.: <span class="loc">${escapeHtml(phones)}</span></p>` : "",
    [email, website]
      .filter(Boolean)
      .map(escapeHtml)
      .join("&nbsp;&nbsp;|&nbsp;&nbsp;")
      ? `<p>${[email, website].filter(Boolean).map(escapeHtml).join("&nbsp;&nbsp;|&nbsp;&nbsp;")}</p>`
      : "",
  ].filter(Boolean);

  return {
    display_name: name,
    legal_name: legal,
    tagline: (org.tagline ?? "").trim(),
    tax_id: (org.ruc ?? "").trim(),
    logo_url: safeHttpUrl(org.logo_url),
    brand_color: isHexColor(org.print_color_primary)
      ? org.print_color_primary.trim()
      : YENDA_BRAND_FALLBACK,
    address,
    contact_line: [phones, email].filter(Boolean).join(" · "),
    website,
    footer_html: footerLines.join("\n"),
  };
}
