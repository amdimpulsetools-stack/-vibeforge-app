-- ============================================
-- Specialties table + link to organizations
-- ============================================

-- Specialties catalog
CREATE TABLE IF NOT EXISTS specialties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon TEXT, -- lucide icon name for frontend
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE specialties ENABLE ROW LEVEL SECURITY;

-- Everyone can read specialties (public catalog)
CREATE POLICY "specialties_read" ON specialties
  FOR SELECT USING (true);

-- Link organizations to specialties (many-to-many for multi-specialty clinics)
CREATE TABLE IF NOT EXISTS organization_specialties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  specialty_id UUID NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, specialty_id)
);

ALTER TABLE organization_specialties ENABLE ROW LEVEL SECURITY;

-- Members can read their org's specialties
CREATE POLICY "org_specialties_read" ON organization_specialties
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Owner/admin can manage specialties
CREATE POLICY "org_specialties_manage" ON organization_specialties
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Also add a primary_specialty_id to organizations for quick access
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS primary_specialty_id UUID REFERENCES specialties(id);

-- ============================================
-- Seed initial specialties (LATAM common)
-- ============================================
INSERT INTO specialties (name, slug, icon, description, sort_order) VALUES
  ('Medicina General', 'medicina-general', 'Stethoscope', 'Atención médica primaria y preventiva', 1),
  ('Odontología', 'odontologia', 'Smile', 'Salud bucal y dental', 2),
  ('Ginecología y Obstetricia', 'ginecologia-obstetricia', 'Baby', 'Salud femenina, embarazo y parto', 3),
  ('Pediatría', 'pediatria', 'Baby', 'Atención médica infantil', 4),
  ('Dermatología', 'dermatologia', 'Scan', 'Piel, cabello y uñas', 5),
  ('Oftalmología', 'oftalmologia', 'Eye', 'Salud visual y ocular', 6),
  ('Cardiología', 'cardiologia', 'HeartPulse', 'Corazón y sistema cardiovascular', 7),
  ('Endocrinología', 'endocrinologia', 'Activity', 'Hormonas y metabolismo', 8),
  ('Endocrinología Pediátrica', 'endocrinologia-pediatrica', 'TrendingUp', 'Crecimiento y desarrollo hormonal infantil', 9),
  ('Medicina Reproductiva', 'medicina-reproductiva', 'Heart', 'Fertilidad y reproducción asistida', 10),
  ('Nutrición', 'nutricion', 'Apple', 'Alimentación y dietética', 11),
  ('Psicología', 'psicologia', 'Brain', 'Salud mental y bienestar emocional', 12),
  ('Psiquiatría', 'psiquiatria', 'Brain', 'Trastornos mentales y tratamiento farmacológico', 13),
  ('Traumatología y Ortopedia', 'traumatologia-ortopedia', 'Bone', 'Huesos, articulaciones y sistema musculoesquelético', 14),
  ('Otorrinolaringología', 'otorrinolaringologia', 'Ear', 'Oído, nariz y garganta', 15),
  ('Urología', 'urologia', 'Stethoscope', 'Sistema urinario y reproductor masculino', 16),
  ('Neurología', 'neurologia', 'Brain', 'Sistema nervioso', 17),
  ('Gastroenterología', 'gastroenterologia', 'Stethoscope', 'Sistema digestivo', 18),
  ('Neumología', 'neumologia', 'Wind', 'Sistema respiratorio', 19),
  ('Fisioterapia', 'fisioterapia', 'Dumbbell', 'Rehabilitación física', 20),
  ('Cirugía General', 'cirugia-general', 'Scissors', 'Procedimientos quirúrgicos', 21),
  ('Cirugía Plástica', 'cirugia-plastica', 'Sparkles', 'Cirugía reconstructiva y estética', 22),
  ('Medicina Estética', 'medicina-estetica', 'Sparkles', 'Tratamientos estéticos no quirúrgicos', 23),
  ('Oncología', 'oncologia', 'Shield', 'Diagnóstico y tratamiento del cáncer', 24),
  ('Nefrología', 'nefrologia', 'Droplets', 'Riñones y sistema renal', 25),
  ('Reumatología', 'reumatologia', 'Bone', 'Enfermedades autoinmunes y articulares', 26),
  ('Medicina Interna', 'medicina-interna', 'Stethoscope', 'Enfermedades de órganos internos', 27),
  ('Otra especialidad', 'otra', 'Plus', 'Especialidad no listada', 99)
ON CONFLICT (slug) DO NOTHING;
