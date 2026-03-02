-- =============================================
-- TABLA: appointments (Citas)
-- Registro de citas médicas
-- =============================================
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name TEXT NOT NULL,
  patient_phone TEXT,
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled')),
  origin TEXT,
  payment_method TEXT,
  responsible TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CHECK (end_time > start_time)
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view appointments"
  ON appointments FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert appointments"
  ON appointments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update appointments"
  ON appointments FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete appointments"
  ON appointments FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER set_updated_at_appointments
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Índices para consultas frecuentes
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id, appointment_date);
CREATE INDEX idx_appointments_office ON appointments(office_id, appointment_date);
