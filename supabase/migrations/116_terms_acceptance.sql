-- ============================================================================
-- Migration 116: terms + privacy acceptance audit trail on user_profiles
-- ============================================================================
--
-- Adds 4 columns to `user_profiles` so we have explicit, dated proof that
-- each user accepted Terms and Privacy at signup. Pre-existing rows stay
-- NULL on purpose: that NULL is itself the evidence that the user never
-- explicitly accepted (no implicit acceptance, no backfill).
--
-- The version is a free-form string (e.g. "2026-04-29") that mirrors the
-- date stamped on /terms and /privacy. When those documents are updated,
-- bump `TERMS_VERSION` in `lib/constants.ts` and prompt for re-acceptance
-- (UX flow handled in app code, not in this migration).
--
-- RLS: untouched. `user_profiles` already has the right policies in place
-- (users see/update their own row, admins see all). The new columns inherit
-- them automatically.
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_terms_version TEXT,
  ADD COLUMN IF NOT EXISTS accepted_privacy_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_privacy_version TEXT;

COMMENT ON COLUMN user_profiles.accepted_terms_at IS
  'Timestamp at which the user explicitly accepted the Terms. NULL means the user predates the consent flow or has not yet accepted.';
COMMENT ON COLUMN user_profiles.accepted_terms_version IS
  'Version label of the Terms accepted (free-form, typically the date string used in /terms, e.g. "2026-04-29").';
COMMENT ON COLUMN user_profiles.accepted_privacy_at IS
  'Timestamp at which the user explicitly accepted the Privacy Policy. NULL means not accepted.';
COMMENT ON COLUMN user_profiles.accepted_privacy_version IS
  'Version label of the Privacy Policy accepted. Currently mirrors `accepted_terms_version` (twin docs).';
