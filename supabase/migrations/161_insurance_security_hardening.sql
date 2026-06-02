-- ============================================
-- Migration 161: Insurance security hardening
-- Addresses two findings from the security review of migration 160:
--
--   M1 (entitlement bypass): the feature_insurance plan flag was only
--       enforced client-side. RLS let any org owner/admin (or member, for
--       patient affiliations) write insurance data regardless of plan. We
--       add a SECURITY DEFINER helper org_has_insurance_feature() and
--       require it in the WITH CHECK of every insurance WRITE policy.
--       SELECT and DELETE stay open so a downgraded org can still view and
--       clean up the data it already created.
--
--   M2 (client-computed money): insurance_coverage_amount and patient_copay
--       were computed in the browser and written verbatim — a member could
--       persist an arbitrary copay (e.g. 0). We recompute both fields
--       authoritatively in a BEFORE INSERT/UPDATE trigger on appointments,
--       so the client-sent values are advisory only. The trigger also
--       enforces that the chosen carrier belongs to the appointment's own
--       org (cross-tenant integrity).
-- ============================================

-- ── M1: plan-feature helper ─────────────────────────────────────────────
-- Mirrors the active-subscription logic used by get_org_plan (migration
-- 160): an org "has" the feature when it holds a non-expired subscription
-- on a plan whose feature_insurance flag is true.
CREATE OR REPLACE FUNCTION org_has_insurance_feature(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_subscriptions os
    JOIN plans p ON p.id = os.plan_id
    WHERE os.organization_id = org_id
      AND os.status IN ('active', 'trialing', 'past_due')
      AND p.feature_insurance = true
  );
$$;

-- ── M1: gate WRITE policies behind the plan feature ─────────────────────

-- organization_insurance_settings (insert + update)
DROP POLICY IF EXISTS "org_insurance_settings_upsert" ON organization_insurance_settings;
CREATE POLICY "org_insurance_settings_upsert" ON organization_insurance_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    org_has_insurance_feature(organization_id)
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "org_insurance_settings_update" ON organization_insurance_settings;
CREATE POLICY "org_insurance_settings_update" ON organization_insurance_settings
  FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ))
  WITH CHECK (
    org_has_insurance_feature(organization_id)
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- organization_insurance_carriers (insert + update)
DROP POLICY IF EXISTS "org_insurance_carriers_insert" ON organization_insurance_carriers;
CREATE POLICY "org_insurance_carriers_insert" ON organization_insurance_carriers
  FOR INSERT TO authenticated
  WITH CHECK (
    org_has_insurance_feature(organization_id)
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "org_insurance_carriers_update" ON organization_insurance_carriers;
CREATE POLICY "org_insurance_carriers_update" ON organization_insurance_carriers
  FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ))
  WITH CHECK (
    org_has_insurance_feature(organization_id)
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- insurance_covered_services (insert) — org derived from the carrier row
DROP POLICY IF EXISTS "insurance_covered_services_insert" ON insurance_covered_services;
CREATE POLICY "insurance_covered_services_insert" ON insurance_covered_services
  FOR INSERT TO authenticated
  WITH CHECK (organization_insurance_carrier_id IN (
    SELECT oic.id
    FROM organization_insurance_carriers oic
    JOIN organization_members om ON om.organization_id = oic.organization_id
    WHERE om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND org_has_insurance_feature(oic.organization_id)
  ));

-- patient_insurances (insert) — adding a new affiliation is "using" the
-- feature; org derived from the patient. UPDATE/DELETE stay membership-only
-- so existing affiliations remain manageable after a downgrade.
DROP POLICY IF EXISTS "patient_insurances_insert" ON patient_insurances;
CREATE POLICY "patient_insurances_insert" ON patient_insurances
  FOR INSERT TO authenticated
  WITH CHECK (patient_id IN (
    SELECT p.id
    FROM patients p
    JOIN organization_members om ON om.organization_id = p.organization_id
    WHERE om.user_id = auth.uid()
      AND org_has_insurance_feature(p.organization_id)
  ));

-- ── M2: authoritative server-side computation of insurance amounts ──────
-- The client may send insurance_coverage_amount / patient_copay for instant
-- UI feedback, but the DB is the source of truth: this trigger overwrites
-- both based on the captured price, the carrier's coverage %, and whether
-- the service is actually covered. It also rejects carriers from another org.
CREATE OR REPLACE FUNCTION compute_appointment_insurance_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_amount NUMERIC(10, 2);
  pct NUMERIC(5, 2);
  carrier_org UUID;
  is_covered BOOLEAN;
BEGIN
  -- Amount actually billed for this appointment: the captured snapshot,
  -- falling back to the live service base price.
  base_amount := COALESCE(
    NEW.price_snapshot,
    (SELECT base_price FROM services WHERE id = NEW.service_id),
    0
  );

  IF NEW.payment_mode = 'insurance' AND NEW.insurance_carrier_id IS NOT NULL THEN
    SELECT organization_id, coverage_percent
      INTO carrier_org, pct
      FROM organization_insurance_carriers
      WHERE id = NEW.insurance_carrier_id;

    -- Carrier must exist and belong to the appointment's own org.
    IF carrier_org IS NULL OR carrier_org <> NEW.organization_id THEN
      RAISE EXCEPTION
        'insurance_carrier_id % does not belong to organization %',
        NEW.insurance_carrier_id, NEW.organization_id;
    END IF;

    -- Coverage only applies when this carrier covers this service.
    is_covered := EXISTS (
      SELECT 1 FROM insurance_covered_services
      WHERE organization_insurance_carrier_id = NEW.insurance_carrier_id
        AND service_id = NEW.service_id
    );

    IF NOT is_covered THEN
      pct := 0;
    END IF;

    NEW.insurance_coverage_amount := round(base_amount * COALESCE(pct, 0) / 100, 2);
    NEW.patient_copay := round(base_amount - NEW.insurance_coverage_amount, 2);
  ELSE
    -- Particular (or carrier missing): no coverage; patient pays the
    -- post-discount total.
    NEW.payment_mode := COALESCE(NEW.payment_mode, 'particular');
    NEW.insurance_carrier_id := NULL;
    NEW.insurance_coverage_amount := 0;
    NEW.patient_copay := GREATEST(0, base_amount - COALESCE(NEW.discount_amount, 0));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_appointment_insurance ON appointments;
CREATE TRIGGER trg_compute_appointment_insurance
  BEFORE INSERT OR UPDATE OF
    payment_mode, insurance_carrier_id, price_snapshot, discount_amount, service_id
  ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION compute_appointment_insurance_amounts();
