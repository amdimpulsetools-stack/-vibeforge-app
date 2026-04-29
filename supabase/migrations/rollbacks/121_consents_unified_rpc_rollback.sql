-- Rollback for migration 121
DROP FUNCTION IF EXISTS get_patient_consents_unified(UUID);
