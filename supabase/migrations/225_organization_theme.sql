-- ═══════════════════════════════════════════════════════════════════
-- 225: Org-wide theme — the owner's choice applies to every member.
--
-- Founder decision (19-ago): the theme the OWNER picks is the theme
-- all members of the organization get. NULL = the owner never chose,
-- members keep their personal user_profiles.theme (previous behavior).
--
-- Written by the ThemeProvider when an owner toggles; read by every
-- member on session start. Members' personal toggle is disabled while
-- an org theme is set.
--
-- Additive + idempotent — safe on a live database.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS theme text
  CHECK (theme IN ('light', 'dark'));

COMMENT ON COLUMN organizations.theme IS
  'Org-wide UI theme chosen by the owner. NULL = members use their personal user_profiles.theme.';
