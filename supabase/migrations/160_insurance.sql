-- ============================================
-- Migration 160: Insurance Carriers
-- Per-org insurance configuration: carriers, per-service coverage,
-- patient affiliation, and appointment-level payment split (particular
-- vs insurance). Gated behind feature_insurance plan flag (professional
-- + enterprise).
--
-- Design notes:
--   - insurance_carriers is a global catalog (seeded with common Peru
--     insurers). Orgs activate the ones they work with via
--     organization_insurance_carriers, with their own coverage % override.
--   - Orgs can also add custom (non-catalog) carriers via the same table
--     using custom_name + custom_ruc instead of carrier_id.
--   - insurance_covered_services answers "which services does this
--     org-carrier pair cover?" — both the bulk modal on /admin/seguros
--     and the per-service toggle write here.
--   - Appointment fields use payment_mode + insurance_carrier_id (which
--     points to the org-level carrier row, not the global catalog) so
--     the split is recoverable even if the carrier % later changes.
-- ============================================

-- 1. Plan flag
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS feature_insurance BOOLEAN NOT NULL DEFAULT false;

UPDATE plans
  SET feature_insurance = true
  WHERE slug IN ('professional', 'enterprise');

-- 2. Global catalog of insurance carriers
CREATE TABLE IF NOT EXISTS insurance_carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  default_ruc TEXT,
  logo_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE insurance_carriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insurance_carriers_read" ON insurance_carriers
  FOR SELECT USING (true);

-- 3. Per-org global setting (single row per org)
CREATE TABLE IF NOT EXISTS organization_insurance_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE organization_insurance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_insurance_settings_select" ON organization_insurance_settings
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_insurance_settings_upsert" ON organization_insurance_settings
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "org_insurance_settings_update" ON organization_insurance_settings
  FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE TRIGGER set_updated_at_org_insurance_settings
  BEFORE UPDATE ON organization_insurance_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 4. Per-org activated carriers (catalog + custom)
CREATE TABLE IF NOT EXISTS organization_insurance_carriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  carrier_id UUID REFERENCES insurance_carriers(id) ON DELETE SET NULL,
  custom_name TEXT,
  custom_ruc TEXT,
  coverage_percent NUMERIC(5, 2) NOT NULL DEFAULT 0
    CHECK (coverage_percent >= 0 AND coverage_percent <= 100),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (carrier_id IS NOT NULL OR custom_name IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS org_insurance_carriers_unique_catalog
  ON organization_insurance_carriers (organization_id, carrier_id)
  WHERE carrier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS org_insurance_carriers_org_idx
  ON organization_insurance_carriers (organization_id, enabled);

ALTER TABLE organization_insurance_carriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_insurance_carriers_select" ON organization_insurance_carriers
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_insurance_carriers_insert" ON organization_insurance_carriers
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "org_insurance_carriers_update" ON organization_insurance_carriers
  FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "org_insurance_carriers_delete" ON organization_insurance_carriers
  FOR DELETE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE TRIGGER set_updated_at_org_insurance_carriers
  BEFORE UPDATE ON organization_insurance_carriers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 5. Service-level coverage per org-carrier
CREATE TABLE IF NOT EXISTS insurance_covered_services (
  organization_insurance_carrier_id UUID NOT NULL
    REFERENCES organization_insurance_carriers(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_insurance_carrier_id, service_id)
);

CREATE INDEX IF NOT EXISTS insurance_covered_services_service_idx
  ON insurance_covered_services (service_id);

ALTER TABLE insurance_covered_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insurance_covered_services_select" ON insurance_covered_services
  FOR SELECT TO authenticated
  USING (organization_insurance_carrier_id IN (
    SELECT oic.id
    FROM organization_insurance_carriers oic
    JOIN organization_members om ON om.organization_id = oic.organization_id
    WHERE om.user_id = auth.uid()
  ));

CREATE POLICY "insurance_covered_services_insert" ON insurance_covered_services
  FOR INSERT TO authenticated
  WITH CHECK (organization_insurance_carrier_id IN (
    SELECT oic.id
    FROM organization_insurance_carriers oic
    JOIN organization_members om ON om.organization_id = oic.organization_id
    WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
  ));

CREATE POLICY "insurance_covered_services_delete" ON insurance_covered_services
  FOR DELETE TO authenticated
  USING (organization_insurance_carrier_id IN (
    SELECT oic.id
    FROM organization_insurance_carriers oic
    JOIN organization_members om ON om.organization_id = oic.organization_id
    WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
  ));

-- 6. Patient ↔ insurance link
CREATE TABLE IF NOT EXISTS patient_insurances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  organization_insurance_carrier_id UUID NOT NULL
    REFERENCES organization_insurance_carriers(id) ON DELETE CASCADE,
  affiliate_number TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patient_id, organization_insurance_carrier_id)
);

CREATE INDEX IF NOT EXISTS patient_insurances_patient_idx
  ON patient_insurances (patient_id, active);

ALTER TABLE patient_insurances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_insurances_select" ON patient_insurances
  FOR SELECT TO authenticated
  USING (patient_id IN (
    SELECT p.id
    FROM patients p
    JOIN organization_members om ON om.organization_id = p.organization_id
    WHERE om.user_id = auth.uid()
  ));

CREATE POLICY "patient_insurances_insert" ON patient_insurances
  FOR INSERT TO authenticated
  WITH CHECK (patient_id IN (
    SELECT p.id
    FROM patients p
    JOIN organization_members om ON om.organization_id = p.organization_id
    WHERE om.user_id = auth.uid()
  ));

CREATE POLICY "patient_insurances_update" ON patient_insurances
  FOR UPDATE TO authenticated
  USING (patient_id IN (
    SELECT p.id
    FROM patients p
    JOIN organization_members om ON om.organization_id = p.organization_id
    WHERE om.user_id = auth.uid()
  ))
  WITH CHECK (patient_id IN (
    SELECT p.id
    FROM patients p
    JOIN organization_members om ON om.organization_id = p.organization_id
    WHERE om.user_id = auth.uid()
  ));

CREATE POLICY "patient_insurances_delete" ON patient_insurances
  FOR DELETE TO authenticated
  USING (patient_id IN (
    SELECT p.id
    FROM patients p
    JOIN organization_members om ON om.organization_id = p.organization_id
    WHERE om.user_id = auth.uid()
  ));

CREATE TRIGGER set_updated_at_patient_insurances
  BEFORE UPDATE ON patient_insurances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 7. Appointment-level payment split fields
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'particular'
    CHECK (payment_mode IN ('particular', 'insurance'));

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS insurance_carrier_id UUID
    REFERENCES organization_insurance_carriers(id) ON DELETE SET NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS insurance_coverage_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_copay NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- 8. Seed Peru insurance carriers
INSERT INTO insurance_carriers (slug, name, default_ruc, sort_order) VALUES
  ('rimac', 'Rimac Seguros', '20100049181', 1),
  ('pacifico', 'Pacífico Seguros', '20305011045', 2),
  ('mapfre', 'Mapfre', '20202380011', 3),
  ('la_positiva', 'La Positiva', '20100210909', 4),
  ('sanitas', 'Sanitas', '20512315010', 5),
  ('oncosalud', 'Oncosalud', '20308128820', 6)
ON CONFLICT (slug) DO NOTHING;

-- 9. Refresh get_org_plan RPC to surface feature_insurance
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
    'feature_insurance', p.feature_insurance,
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
