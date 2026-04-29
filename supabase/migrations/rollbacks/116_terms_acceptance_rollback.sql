-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK for 116_terms_acceptance.sql
-- Drops the 4 columns added to user_profiles. The audit data is lost.
-- Run only if you are reverting the consent flow entirely.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS accepted_terms_at,
  DROP COLUMN IF EXISTS accepted_terms_version,
  DROP COLUMN IF EXISTS accepted_privacy_at,
  DROP COLUMN IF EXISTS accepted_privacy_version;
