-- ============================================================================
-- Migration 084: Treatment Plan Templates
-- ============================================================================
-- Plantillas reutilizables de planes de tratamiento. Similar a clinical_templates
-- pero pre-llena los campos de treatment_plans al crear un nuevo plan.
--
-- Ejemplos: "Ortodoncia fase 1 (12 sesiones)", "Fisioterapia lumbar (10 sesiones)",
-- "Control prenatal (9 meses)".
--
-- Pueden ser globales (visibles para toda la org) o personales (solo del doctor).
-- ============================================================================

-- 1. treatment_plan_templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS treatment_plan_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  doctor_id       uuid REFERENCES doctors(id) ON DELETE SET NULL,

  -- Metadata
  name            text NOT NULL,
  specialty       text,
  is_global       boolean NOT NULL DEFAULT false,

  -- Pre-filled treatment plan fields
  title_template       text NOT NULL DEFAULT '',   -- pre-llena treatment_plans.title
  description          text NOT NULL DEFAULT '',
  diagnosis_code       text,
  diagnosis_label      text,
  total_sessions       int,
  session_duration_minutes int,                    -- duración típica por sesión

  internal_notes  text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT treatment_plan_templates_sessions_check
    CHECK (total_sessions IS NULL OR (total_sessions >= 1 AND total_sessions <= 100)),
  CONSTRAINT treatment_plan_templates_duration_check
    CHECK (session_duration_minutes IS NULL OR (session_duration_minutes >= 5 AND session_duration_minutes <= 600))
);

ALTER TABLE treatment_plan_templates ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies (mirrors clinical_templates) ───────────────────────────────

-- Org members can read global templates + their own personal templates
CREATE POLICY "treatment_plan_templates: org members can read"
  ON treatment_plan_templates FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND (
      is_global = true
      OR doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid())
      OR organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
      )
    )
  );

-- Doctors can create their own templates; admins can create any (incl. global)
CREATE POLICY "treatment_plan_templates: doctor insert own or admin"
  ON treatment_plan_templates FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND (
      (
        doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid())
        AND is_global = false
      )
      OR organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
      )
    )
  );

-- Doctors can update their own templates; admins can update any
CREATE POLICY "treatment_plan_templates: doctor update own or admin"
  ON treatment_plan_templates FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND (
      doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid())
      OR organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
      )
    )
  );

-- Doctors can delete their own; admins can delete any
CREATE POLICY "treatment_plan_templates: doctor delete own or admin"
  ON treatment_plan_templates FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND (
      doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid())
      OR organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
      )
    )
  );

-- ── Triggers ────────────────────────────────────────────────────────────────

CREATE TRIGGER set_updated_at_treatment_plan_templates
  BEFORE UPDATE ON treatment_plan_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_treatment_plan_templates_org ON treatment_plan_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plan_templates_doctor ON treatment_plan_templates(doctor_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plan_templates_global ON treatment_plan_templates(organization_id) WHERE is_global = true;
