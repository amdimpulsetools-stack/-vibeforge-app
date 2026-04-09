-- =============================================
-- MIGRACIÓN 019: Mejoras a pacientes y citas
-- - Nuevo estado 'no_show' en citas
-- - Campos adicionales en pacientes: document_type,
--   birth_date, departamento, distrito, is_foreigner, nationality
-- =============================================

-- 1. Agregar 'no_show' al CHECK constraint de appointments.status
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'));

-- 2. Nuevos campos en patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'DNI'
  CHECK (document_type IN ('DNI', 'CE', 'Pasaporte'));

ALTER TABLE patients ADD COLUMN IF NOT EXISTS birth_date DATE;

ALTER TABLE patients ADD COLUMN IF NOT EXISTS departamento TEXT;

ALTER TABLE patients ADD COLUMN IF NOT EXISTS distrito TEXT;

ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_foreigner BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE patients ADD COLUMN IF NOT EXISTS nationality TEXT;
