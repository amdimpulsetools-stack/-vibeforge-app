-- =============================================
-- MÓDULO 3: LA MEMORIA (CRM & PACIENTES)
-- Tablas: patients, patient_tags, patient_payments
-- Altera: appointments (añade patient_id)
-- =============================================

-- 1. TABLA: patients (Directorio Maestro)
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dni TEXT UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  origin TEXT,
  adicional_1 TEXT,
  adicional_2 TEXT,
  viene_desde TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view patients"
  ON patients FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert patients"
  ON patients FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update patients"
  ON patients FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete patients"
  ON patients FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER set_updated_at_patients
  BEFORE UPDATE ON patients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_patients_dni ON patients(dni);
CREATE INDEX idx_patients_name ON patients(last_name, first_name);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_status ON patients(status);

-- 2. TABLA: patient_tags (Etiquetas/Badges)
CREATE TABLE IF NOT EXISTS patient_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE patient_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view patient_tags"
  ON patient_tags FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert patient_tags"
  ON patient_tags FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete patient_tags"
  ON patient_tags FOR DELETE
  USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_patient_tags_patient ON patient_tags(patient_id);

-- 3. TABLA: patient_payments (Pagos/Finanzas)
CREATE TABLE IF NOT EXISTS patient_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  notes TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE patient_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view patient_payments"
  ON patient_payments FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert patient_payments"
  ON patient_payments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update patient_payments"
  ON patient_payments FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete patient_payments"
  ON patient_payments FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX idx_patient_payments_patient ON patient_payments(patient_id);
CREATE INDEX idx_patient_payments_appointment ON patient_payments(appointment_id);

-- 4. ALTER: appointments - añadir patient_id
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
