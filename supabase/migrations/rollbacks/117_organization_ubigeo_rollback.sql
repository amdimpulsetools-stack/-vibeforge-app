-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK for 117_organization_ubigeo.sql
-- Drops the ubigeo column and its CHECK constraint. Data is lost.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_ubigeo_format_check;
ALTER TABLE organizations DROP COLUMN IF EXISTS ubigeo;
