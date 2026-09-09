-- Rollback 256. Las citas vuelven a deducir "virtual" por meeting_url.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_modality_chk;
ALTER TABLE appointments DROP COLUMN IF EXISTS modality;
