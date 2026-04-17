-- ============================================
-- Migration 092 — Pediatric growth curves addon
-- Adds patient.sex, patient_anthropometry table,
-- and a dedicated "growth_curves" addon for
-- pediatric endocrinology and pediatrics.
-- ============================================

-- 1. Patient biological sex (required for WHO percentile lookup)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS sex TEXT
  CHECK (sex IN ('male', 'female'));

-- 2. Anthropometric measurements (longitudinal)
CREATE TABLE IF NOT EXISTS patient_anthropometry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  measurement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg NUMERIC(5,2),
  height_cm NUMERIC(5,2),
  head_circumference_cm NUMERIC(5,2),
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    weight_kg IS NOT NULL
    OR height_cm IS NOT NULL
    OR head_circumference_cm IS NOT NULL
  )
);

ALTER TABLE patient_anthropometry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anthro_select" ON patient_anthropometry
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "anthro_insert" ON patient_anthropometry
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "anthro_update" ON patient_anthropometry
  FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "anthro_delete" ON patient_anthropometry
  FOR DELETE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'doctor')
  ));

CREATE INDEX IF NOT EXISTS idx_anthro_patient_date
  ON patient_anthropometry (patient_id, measurement_date DESC);
CREATE INDEX IF NOT EXISTS idx_anthro_org
  ON patient_anthropometry (organization_id);

CREATE TRIGGER set_updated_at_patient_anthropometry
  BEFORE UPDATE ON patient_anthropometry
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Register the growth curves addon in the catalog
INSERT INTO addons (key, name, description, category, specialties, icon, is_premium, min_plan, sort_order)
VALUES (
  'growth_curves',
  'Curvas de Crecimiento (OMS)',
  'Seguimiento antropométrico con gráficos de percentiles OMS para peso, talla, IMC y perímetro cefálico en pacientes pediátricos.',
  'clinical',
  '{endocrinologia-pediatrica,pediatria}',
  'TrendingUp',
  false,
  'starter',
  11
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  specialties = EXCLUDED.specialties,
  icon = EXCLUDED.icon;

-- 4. Auto-activate for orgs that already have the matching specialties
INSERT INTO organization_addons (organization_id, addon_key, enabled, activated_at)
SELECT DISTINCT o.id, 'growth_curves', true, now()
FROM organizations o
JOIN organization_specialties os ON os.organization_id = o.id
JOIN specialties s ON s.id = os.specialty_id
WHERE s.slug IN ('endocrinologia-pediatrica', 'pediatria')
ON CONFLICT (organization_id, addon_key) DO NOTHING;
