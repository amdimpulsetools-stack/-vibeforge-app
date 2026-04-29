-- ============================================================================
-- Migration 117: SUNAT ubigeo on organizations
-- ============================================================================
--
-- Adds the 6-digit INEI/SUNAT ubigeo code to `organizations`. The Nubefact
-- e-invoice wizard needs this to be pre-filled from the organization profile,
-- and Peruvian tax authority docs require it on the issuer header. The
-- existing `district` column (free-form text, added in migration 115) stays
-- as-is for letterhead display purposes; the new `ubigeo` is the canonical
-- machine-readable code.
--
-- The CHECK constraint guards against typos: a ubigeo is exactly 6 ASCII
-- digits or NULL. We do NOT backfill — orgs created before this migration
-- keep ubigeo NULL until an admin picks one in Settings.
-- ============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ubigeo TEXT;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_ubigeo_format_check
    CHECK (ubigeo IS NULL OR ubigeo ~ '^[0-9]{6}$');

COMMENT ON COLUMN organizations.ubigeo IS
  'INEI/SUNAT 6-digit ubigeo code (DDPPDD: departamento + provincia + distrito). Used by the Nubefact wizard and PDF letterhead. NULL until the admin picks one.';
