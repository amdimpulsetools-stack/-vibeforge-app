-- ============================================
-- Addon / Module system
-- Global catalog + per-org activation
-- ============================================

-- Global addon catalog (managed by founder/system)
CREATE TABLE IF NOT EXISTS addons (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'specialty'
    CHECK (category IN ('specialty', 'workflow', 'clinical')),
  specialties TEXT[] DEFAULT '{}',
  icon TEXT,
  is_premium BOOLEAN DEFAULT false,
  min_plan TEXT DEFAULT 'starter',
  default_settings JSONB DEFAULT '{}',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "addons_read" ON addons
  FOR SELECT USING (true);

-- Per-org addon activation
CREATE TABLE IF NOT EXISTS organization_addons (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  addon_key TEXT NOT NULL REFERENCES addons(key) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  activated_at TIMESTAMPTZ DEFAULT now(),
  activated_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (organization_id, addon_key)
);

ALTER TABLE organization_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_addons_select" ON organization_addons
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_addons_insert" ON organization_addons
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "org_addons_update" ON organization_addons
  FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "org_addons_delete" ON organization_addons
  FOR DELETE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- ============================================
-- Seed addon catalog
-- ============================================
INSERT INTO addons (key, name, description, category, specialties, icon, is_premium, min_plan, sort_order) VALUES
  -- Specialty modules
  ('dermatology', 'Dermatología', 'Mapa corporal de lesiones, escala de Fitzpatrick, seguimiento fotográfico antes/después y plantillas de consentimiento.', 'specialty', '{dermatologia,medicina-estetica,cirugia-plastica}', 'Scan', false, 'starter', 1),
  ('odontology', 'Odontología', 'Odontograma digital, plan de tratamiento dental, presupuestos por pieza y seguimiento de procedimientos.', 'specialty', '{odontologia}', 'Smile', false, 'starter', 2),
  ('nutrition', 'Nutrición', 'Control antropométrico, planes de alimentación, cálculo de IMC/macros y seguimiento de medidas corporales.', 'specialty', '{nutricion}', 'Apple', false, 'starter', 3),
  ('psychology', 'Psicología', 'Notas de sesión estructuradas, escalas psicométricas (PHQ-9, GAD-7, BDI), consentimientos y seguimiento terapéutico.', 'specialty', '{psicologia,psiquiatria}', 'Brain', false, 'starter', 4),
  ('pediatrics', 'Pediatría', 'Curvas de crecimiento CDC/OMS, calendario de vacunación, percentiles y alertas de desarrollo.', 'specialty', '{pediatria,endocrinologia-pediatrica}', 'Baby', false, 'starter', 5),
  ('ophthalmology', 'Oftalmología', 'Agudeza visual, campos visuales, presión intraocular, fondo de ojo y receta de lentes.', 'specialty', '{oftalmologia}', 'Eye', false, 'starter', 6),
  ('gynecology', 'Ginecología', 'Control prenatal, Papanicolaou, ecografías obstétricas, calendario gestacional y lactancia.', 'specialty', '{ginecologia-obstetricia,medicina-reproductiva}', 'Baby', false, 'starter', 7),
  ('cardiology', 'Cardiología', 'ECG digital, riesgo cardiovascular (Framingham), control de presión arterial y seguimiento de anticoagulantes.', 'specialty', '{cardiologia}', 'HeartPulse', false, 'starter', 8),
  ('traumatology', 'Traumatología', 'Evaluación articular, escala EVA de dolor, seguimiento de fracturas y rehabilitación postoperatoria.', 'specialty', '{traumatologia-ortopedia,fisioterapia}', 'Bone', false, 'starter', 9),
  ('aesthetic', 'Medicina Estética', 'Mapa facial de inyectables, tracking de unidades de toxina, ácido hialurónico y consentimientos por zona.', 'specialty', '{medicina-estetica,cirugia-plastica,dermatologia}', 'Sparkles', true, 'professional', 10),

  -- Workflow modules
  ('telehealth', 'Telemedicina', 'Consultas por videollamada integradas, sala de espera virtual y recetas digitales.', 'workflow', '{}', 'Video', true, 'professional', 20),
  ('advanced_reports', 'Reportes Avanzados', 'Dashboards personalizables, exportación a Excel/PDF, métricas de productividad y análisis de ingresos.', 'workflow', '{}', 'BarChart3', true, 'professional', 21),
  ('inventory', 'Inventario', 'Control de insumos médicos, alertas de stock bajo, lotes con vencimiento y órdenes de compra.', 'workflow', '{}', 'Package', true, 'enterprise', 22),
  ('lab_integration', 'Laboratorio', 'Conexión con laboratorios, recepción de resultados digitales y asociación a historias clínicas.', 'workflow', '{}', 'FlaskConical', true, 'enterprise', 23)
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- Auto-activate addons for existing orgs
-- ============================================
INSERT INTO organization_addons (organization_id, addon_key, enabled, activated_at)
SELECT o.id, a.key, true, now()
FROM organizations o
JOIN organization_specialties os ON os.organization_id = o.id
JOIN specialties s ON s.id = os.specialty_id
JOIN addons a ON s.slug = ANY(a.specialties)
WHERE a.is_premium = false
ON CONFLICT (organization_id, addon_key) DO NOTHING;
