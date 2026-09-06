-- Rollback 247
DROP INDEX IF EXISTS idx_prescriptions_batch;
ALTER TABLE prescriptions
  DROP COLUMN IF EXISTS batch_id,
  DROP COLUMN IF EXISTS pharmaceutical_form,
  DROP COLUMN IF EXISTS dose_per_take;
