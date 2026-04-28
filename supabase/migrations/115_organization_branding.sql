-- ============================================================================
-- Migration 115: organization profile fields for PDF letterhead + branding
-- ============================================================================
--
-- Adds columns to `organizations` so we can build a "membretado" PDF header
-- across all printable documents (prescription, clinical note, exam order,
-- treatment plan). Also lifts RUC + legal_name to the org level so they
-- exist independently of the e-invoice module — a clinic should be able to
-- show its RUC on PDFs without having Nubefact connected.
--
-- All columns are nullable except `print_color_primary` which defaults to
-- the system emerald. No existing query breaks: organizations that haven't
-- been touched yet just render headers with the data they do have.
--
-- After ALTER TABLE, we backfill `ruc` and `legal_name` from any matching
-- row in `einvoice_configs` so orgs that already configured Nubefact don't
-- have to retype them. The wizard will continue to read/write
-- einvoice_configs but should also keep `organizations` in sync going
-- forward (handled in app code, not this migration).
-- ============================================================================

ALTER TABLE organizations
  -- Identity / branding
  ADD COLUMN IF NOT EXISTS tagline TEXT,
  ADD COLUMN IF NOT EXISTS print_color_primary TEXT DEFAULT '#10b981',

  -- Legal data (lifted from einvoice_configs to be org-level)
  ADD COLUMN IF NOT EXISTS ruc TEXT,
  ADD COLUMN IF NOT EXISTS legal_name TEXT,

  -- Location
  ADD COLUMN IF NOT EXISTS district TEXT,

  -- Contact
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS phone_secondary TEXT,
  ADD COLUMN IF NOT EXISTS email_public TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,

  -- Social (all optional)
  ADD COLUMN IF NOT EXISTS social_facebook TEXT,
  ADD COLUMN IF NOT EXISTS social_instagram TEXT,
  ADD COLUMN IF NOT EXISTS social_tiktok TEXT,
  ADD COLUMN IF NOT EXISTS social_linkedin TEXT,
  ADD COLUMN IF NOT EXISTS social_youtube TEXT,
  ADD COLUMN IF NOT EXISTS social_whatsapp TEXT;

-- Length sanity (catch typos / paste accidents). Nullables so empty stays valid.
ALTER TABLE organizations
  ADD CONSTRAINT organizations_ruc_format_check
    CHECK (ruc IS NULL OR ruc ~ '^[0-9]{11}$');

-- Backfill RUC + legal_name from einvoice_configs for orgs that already
-- configured Nubefact. COALESCE so we don't overwrite anything an admin may
-- have already typed manually into organizations.
UPDATE organizations o
SET ruc = COALESCE(o.ruc, ec.ruc),
    legal_name = COALESCE(o.legal_name, ec.legal_name)
FROM einvoice_configs ec
WHERE ec.organization_id = o.id
  AND (ec.ruc IS NOT NULL OR ec.legal_name IS NOT NULL);

-- Sanity log so we can see the backfill in supabase migration history.
DO $$
DECLARE
  filled INT;
BEGIN
  SELECT COUNT(*) INTO filled FROM organizations WHERE ruc IS NOT NULL;
  RAISE NOTICE 'Backfill complete: % organizations with RUC populated', filled;
END $$;

COMMENT ON COLUMN organizations.tagline IS
  'Short slogan shown under the org name in PDF letterheads (e.g. "Especialistas en fertilidad").';
COMMENT ON COLUMN organizations.ruc IS
  'Tax ID (Peru). Independent of einvoice_configs — the org may show this on PDFs without Nubefact connected.';
COMMENT ON COLUMN organizations.legal_name IS
  'Razon social. Used on PDFs and pre-filled in the einvoice wizard.';
COMMENT ON COLUMN organizations.print_color_primary IS
  'Hex color for accent lines/headers in printable PDF documents. Default: emerald-500.';
