-- =============================================
-- Agregar dirección a organizations
-- =============================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS address TEXT;

COMMENT ON COLUMN organizations.address IS 'Dirección física de la organización';
