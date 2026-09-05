-- Rollback de la mig 242. Orden inverso. Los pagos con treatment_id quedan
-- con la columna eliminada (el dinero NO se borra: patient_payments es
-- contable). Restaura el CHECK de source_type de la mig 184.

DROP TRIGGER IF EXISTS trg_treatments_close_followups ON treatments;
DROP FUNCTION IF EXISTS close_followups_on_treatment_close();

ALTER TABLE clinical_followups DROP CONSTRAINT IF EXISTS clinical_followups_source_type_check;
ALTER TABLE clinical_followups ADD CONSTRAINT clinical_followups_source_type_check
  CHECK (
    source_type IS NULL
    OR source_type IN (
      'appointment','clinical_note','treatment_plan','treatment_session',
      'budget_record','manual'
    )
  );

DROP TABLE IF EXISTS treatment_external_payments;

DROP TRIGGER IF EXISTS trg_patient_payments_treatment_stamp ON patient_payments;
DROP FUNCTION IF EXISTS treatments_stamp_payment();

ALTER TABLE patient_payments DROP CONSTRAINT IF EXISTS patient_payments_treatment_concept_chk;
ALTER TABLE patient_payments DROP CONSTRAINT IF EXISTS patient_payments_single_container_chk;
DROP INDEX IF EXISTS idx_payments_treatment;
ALTER TABLE patient_payments
  DROP COLUMN IF EXISTS external_receipt_ref,
  DROP COLUMN IF EXISTS revenue_bucket,
  DROP COLUMN IF EXISTS treatment_concept_id,
  DROP COLUMN IF EXISTS treatment_id;

DROP FUNCTION IF EXISTS seed_treatment_payment_concepts(UUID);
DROP TABLE IF EXISTS treatment_payment_concepts;

DROP TRIGGER IF EXISTS set_updated_at_treatments ON treatments;
DROP TABLE IF EXISTS treatments;
