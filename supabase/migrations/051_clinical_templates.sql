-- ============================================================================
-- Clinical Templates — Plantillas de notas clínicas reutilizables
-- ============================================================================
-- Plantillas SOAP pre-llenadas que los doctores pueden aplicar al crear
-- notas clínicas. Cada plantilla pertenece a una organización y opcionalmente
-- a un doctor específico (plantillas personales vs organizacionales).
-- ============================================================================

-- 1. clinical_templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinical_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  doctor_id       uuid REFERENCES doctors(id) ON DELETE SET NULL,

  -- Metadata
  name            text NOT NULL,
  specialty       text,                        -- ej: "Ginecología", "Medicina General"
  is_global       boolean NOT NULL DEFAULT false, -- true = visible para todos los doctores de la org

  -- SOAP template fields
  subjective      text NOT NULL DEFAULT '',
  objective       text NOT NULL DEFAULT '',
  assessment      text NOT NULL DEFAULT '',
  plan            text NOT NULL DEFAULT '',

  -- Optional defaults
  diagnosis_code  text,
  diagnosis_label text,
  internal_notes  text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clinical_templates ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies ────────────────────────────────────────────────────────────

-- Org members can read global templates + their own personal templates
CREATE POLICY "clinical_templates: org members can read"
  ON clinical_templates FOR SELECT
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

-- Doctors can create their own templates; admins can create any
CREATE POLICY "clinical_templates: doctor insert own or admin"
  ON clinical_templates FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND (
      -- Doctor creating personal template
      (
        doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid())
        AND is_global = false
      )
      -- Admin can create any template (including global)
      OR organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
      )
    )
  );

-- Doctors can update their own templates; admins can update any
CREATE POLICY "clinical_templates: doctor update own or admin"
  ON clinical_templates FOR UPDATE
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
CREATE POLICY "clinical_templates: doctor delete own or admin"
  ON clinical_templates FOR DELETE
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

CREATE TRIGGER set_updated_at_clinical_templates
  BEFORE UPDATE ON clinical_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_clinical_templates_org ON clinical_templates(organization_id);
CREATE INDEX idx_clinical_templates_doctor ON clinical_templates(doctor_id);
CREATE INDEX idx_clinical_templates_global ON clinical_templates(organization_id) WHERE is_global = true;

-- ── Seed: Common clinical templates ─────────────────────────────────────────
-- These are inserted as global templates without org/doctor, to be copied
-- via an RPC when a new org is created. For now, they serve as reference.
-- ============================================================================
