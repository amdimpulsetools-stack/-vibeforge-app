-- =============================================
-- Agrega campo phone a user_profiles
-- Ejecuta esto en Supabase SQL Editor
-- =============================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;
