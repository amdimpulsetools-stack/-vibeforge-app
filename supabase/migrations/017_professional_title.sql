-- =============================================
-- MIGRATION 017: Add professional_title to user_profiles
-- Allows users to identify as Doctor, Especialista, or Licenciada
-- All three titles share the same system privileges
-- =============================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS professional_title TEXT
  CHECK (professional_title IN ('doctor', 'especialista', 'licenciada'));

COMMENT ON COLUMN user_profiles.professional_title IS
  'Professional title: doctor, especialista, licenciada. All share same privileges.';
