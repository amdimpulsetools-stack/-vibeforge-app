-- ============================================
-- Migration 159: Custom Fields
-- Per-org definitions of custom fields for appointments and patients.
-- Gated behind feature_custom_fields plan flag (professional + enterprise).
-- Legacy patients.custom_field_1 / custom_field_2 are left untouched.
-- ============================================

-- 1. Plan flag
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS feature_custom_fields BOOLEAN NOT NULL DEFAULT false;

UPDATE plans
  SET feature_custom_fields = true
  WHERE slug IN ('professional', 'enterprise');

-- 2. Definitions table
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('appointment', 'patient')),
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (
    field_type IN ('text', 'textarea', 'number', 'date', 'select', 'checkbox')
  ),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  placeholder TEXT,
  help_text TEXT,
  required BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, entity_type, field_key)
);

CREATE INDEX IF NOT EXISTS custom_field_definitions_org_entity_idx
  ON custom_field_definitions (organization_id, entity_type, active, position);

ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_field_definitions_select" ON custom_field_definitions
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "custom_field_definitions_insert" ON custom_field_definitions
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "custom_field_definitions_update" ON custom_field_definitions
  FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "custom_field_definitions_delete" ON custom_field_definitions
  FOR DELETE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE TRIGGER set_updated_at_custom_field_definitions
  BEFORE UPDATE ON custom_field_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 3. Data columns on appointments and patients
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 4. Refresh get_org_plan RPC to surface feature_custom_fields
CREATE OR REPLACE FUNCTION get_org_plan(org_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND organization_id = org_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'plan_id', p.id,
    'plan_name', p.name,
    'plan_slug', p.slug,
    'description', p.description,
    'price_monthly', p.price_monthly,
    'price_yearly', p.price_yearly,
    'max_members', p.max_members,
    'max_doctors', p.max_doctors,
    'max_offices', p.max_offices,
    'max_patients', p.max_patients,
    'max_appointments_per_month', p.max_appointments_per_month,
    'max_storage_mb', p.max_storage_mb,
    'max_admins', p.max_admins,
    'max_receptionists', p.max_receptionists,
    'max_doctor_members', p.max_doctor_members,
    'max_ai_queries', p.max_ai_queries,
    'addon_price_per_office', p.addon_price_per_office,
    'addon_price_per_member', p.addon_price_per_member,
    'target_audience', p.target_audience,
    'feature_reports', p.feature_reports,
    'feature_export', p.feature_export,
    'feature_custom_roles', p.feature_custom_roles,
    'feature_api_access', p.feature_api_access,
    'feature_priority_support', p.feature_priority_support,
    'feature_ai_assistant', p.feature_ai_assistant,
    'feature_custom_fields', p.feature_custom_fields,
    'subscription_id', os.id,
    'subscription_status', os.status,
    'started_at', os.started_at,
    'expires_at', os.expires_at,
    'trial_ends_at', os.trial_ends_at
  ) INTO result
  FROM organization_subscriptions os
  JOIN plans p ON p.id = os.plan_id
  WHERE os.organization_id = org_id
    AND os.status IN ('active', 'trialing', 'past_due')
  ORDER BY os.created_at DESC
  LIMIT 1;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
