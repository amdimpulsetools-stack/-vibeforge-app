-- =============================================
-- MIGRATION 109: Fix — add missing connected_at column
-- =============================================
-- Migration 108 referenced `connected_at` in routes/* and the React hook
-- but forgot to declare the column on einvoice_configs. The SELECT in
-- /api/einvoices/status fails silently (Postgres errors out, Supabase
-- client returns null), so the Settings → Integraciones card stays as
-- "Disponible" even after a successful connect.
--
-- Fix: add the column nullable, backfill from created_at for existing
-- rows, then make it NOT NULL.

ALTER TABLE einvoice_configs
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;

-- Backfill: existing rows get their original creation timestamp.
UPDATE einvoice_configs
SET connected_at = created_at
WHERE connected_at IS NULL;

ALTER TABLE einvoice_configs
  ALTER COLUMN connected_at SET NOT NULL,
  ALTER COLUMN connected_at SET DEFAULT now();

COMMENT ON COLUMN einvoice_configs.connected_at IS
  'When the org most-recently connected (or reconnected) the e-invoice provider. Different from created_at when the row was edited later — kept stable on edits unless explicitly bumped on reconnect.';
