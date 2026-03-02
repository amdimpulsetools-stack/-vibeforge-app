-- =============================================
-- TABLA: doctors
-- Personal médico
-- =============================================
CREATE TABLE IF NOT EXISTS doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  cmp TEXT NOT NULL UNIQUE,
  photo_url TEXT,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view doctors"
  ON doctors FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert doctors"
  ON doctors FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update doctors"
  ON doctors FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete doctors"
  ON doctors FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER set_updated_at_doctors
  BEFORE UPDATE ON doctors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- TABLA: doctor_services (Matriz de Servicios)
-- Qué procedimientos realiza cada doctor
-- =============================================
CREATE TABLE IF NOT EXISTS doctor_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(doctor_id, service_id)
);

ALTER TABLE doctor_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view doctor_services"
  ON doctor_services FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert doctor_services"
  ON doctor_services FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete doctor_services"
  ON doctor_services FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- TABLA: doctor_schedules (Horarios Base)
-- Disponibilidad semanal recurrente
-- =============================================
CREATE TABLE IF NOT EXISTS doctor_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  office_id UUID REFERENCES offices(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CHECK (end_time > start_time),
  UNIQUE(doctor_id, day_of_week, start_time)
);

ALTER TABLE doctor_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view doctor_schedules"
  ON doctor_schedules FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert doctor_schedules"
  ON doctor_schedules FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update doctor_schedules"
  ON doctor_schedules FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete doctor_schedules"
  ON doctor_schedules FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER set_updated_at_doctor_schedules
  BEFORE UPDATE ON doctor_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
