import type { Database } from "@/types/database";
import type { ClinicHeaderData } from "@/lib/pdf/clinic-header";

type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];

/**
 * Branding fields added in migration 115. The generated `Database` type has
 * not been re-synced yet, so we widen the org row shape with the columns
 * that may not appear in TypeScript yet. All optional / nullable.
 */
export interface OrganizationBrandingFields {
  tagline?: string | null;
  legal_name?: string | null;
  ruc?: string | null;
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

export type OrganizationWithBranding = OrganizationRow & OrganizationBrandingFields;

/**
 * Adapts an `organizations` row (possibly partial / loosely typed) into the
 * `ClinicHeaderData` shape consumed by `renderClinicHeader`. Missing fields
 * are nulled out — the renderer already handles absent values gracefully.
 */
export function toClinicHeaderData(
  org: Partial<OrganizationWithBranding> & { name?: string | null }
): ClinicHeaderData {
  return {
    name: org.name ?? "",
    tagline: org.tagline ?? null,
    logo_url: org.logo_url ?? null,
    legal_name: org.legal_name ?? null,
    ruc: org.ruc ?? null,
    address: org.address ?? null,
    district: org.district ?? null,
    phone: org.phone ?? null,
    phone_secondary: org.phone_secondary ?? null,
    email_public: org.email_public ?? null,
    website: org.website ?? null,
    social_facebook: org.social_facebook ?? null,
    social_instagram: org.social_instagram ?? null,
    social_tiktok: org.social_tiktok ?? null,
    social_linkedin: org.social_linkedin ?? null,
    social_youtube: org.social_youtube ?? null,
    social_whatsapp: org.social_whatsapp ?? null,
    print_color_primary: org.print_color_primary ?? null,
  };
}

/**
 * Fallback header used when no organization context is available (e.g. a
 * print invoked from a place where the org is still loading). Renders a
 * minimal, centered name banner so the document never goes out unbranded.
 */
export function fallbackClinicHeader(name: string | null | undefined): ClinicHeaderData {
  return {
    name: (name && name.trim()) || "",
  };
}
