-- Columnas que las migs 283/284 leen y que el stub base no tiene (en
-- producción existen desde las migs 011/100/242/108/273). Solo columnas.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS price_snapshot numeric(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE patient_payments
  ADD COLUMN IF NOT EXISTS treatment_id uuid,
  ADD COLUMN IF NOT EXISTS einvoice_id uuid;
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS timezone text;
