-- =============================================
-- MIGRATION 018: Appointment payment deposits
-- - Make patient_id nullable in patient_payments
--   (allows linking payments to appointments
--    even when patient has no profile record)
-- =============================================

ALTER TABLE patient_payments
  ALTER COLUMN patient_id DROP NOT NULL;

COMMENT ON TABLE patient_payments IS
  'Tracks individual payment transactions. patient_id is optional to
   support appointments with no linked patient profile.';
