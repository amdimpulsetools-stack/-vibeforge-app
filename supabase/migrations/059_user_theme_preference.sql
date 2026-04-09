-- ═══════════════════════════════════════════════════════════════════
-- Add theme preference column to user_profiles
-- Persists dark/light mode in the database so it survives cache clears
-- Default: 'light' (primary theme)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'light'
  CHECK (theme IN ('light', 'dark'));
