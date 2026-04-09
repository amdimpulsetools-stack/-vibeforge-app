-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK for 057_composite_indexes.sql
-- Removes the composite indexes. Tables and data are NOT affected.
-- ═══════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_appointments_org_date;
DROP INDEX IF EXISTS idx_appointments_org_date_status;
DROP INDEX IF EXISTS idx_patients_org_created;
DROP INDEX IF EXISTS idx_patient_payments_org_date;
DROP INDEX IF EXISTS idx_org_subs_payer_email_status;
