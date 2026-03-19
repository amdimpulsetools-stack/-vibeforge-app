-- =============================================
-- MIGRACIÓN: Edición de citas + Histórico con precio snapshot
-- Añade campos de auditoría y precio capturado
-- =============================================

-- 1. Campos de auditoría para edición
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS edited_by_name TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- 2. Snapshot del precio del servicio al momento de la cita
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS price_snapshot NUMERIC(10,2);

-- 3. Índice para consultas del histórico por fecha
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
