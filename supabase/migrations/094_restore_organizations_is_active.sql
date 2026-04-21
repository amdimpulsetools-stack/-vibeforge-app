-- =============================================
-- MIGRATION 094: Restore organizations.is_active
-- =============================================
-- Migration 013 (multi_tenant) declared `is_active BOOLEAN NOT NULL DEFAULT true`
-- inside a `CREATE TABLE IF NOT EXISTS organizations (...)`. Because migration 004
-- had already created the table without that column, the IF NOT EXISTS guard
-- skipped creation in production and the column was never added.
--
-- Application code across the portal, public booking, and founder panel assumes
-- the column exists and filters by `.eq("is_active", true)`. PostgREST returns
-- 400 on those queries, which .single() surfaces as `data: null` — breaking the
-- portal magic-link email flow (no token is ever created).
--
-- This restores the intended column with DEFAULT true so every existing org
-- becomes active and all code paths start working again with no behavior change.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
