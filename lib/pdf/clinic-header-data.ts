import type { Database } from "@/types/database";
import type { ClinicHeaderData } from "@/lib/pdf/clinic-header";

type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];

/**
 * Re-export for backwards compatibility. The branding columns are now
 * part of the generated `OrganizationRow` (since migration 115 + 117
 * have been reflected in `types/database.ts`), so this is just an alias.
 * Existing call sites keep working without churn.
 */
export type OrganizationWithBranding = OrganizationRow;

/**
 * Adapts an `organizations` row (possibly partial / loosely typed) into the
 * `ClinicHeaderData` shape consumed by `renderClinicHeader`. Missing fields
 * are nulled out — the renderer already handles absent values gracefully.
 */
export function toClinicHeaderData(
  org: Partial<OrganizationRow> & { name?: string | null }
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
