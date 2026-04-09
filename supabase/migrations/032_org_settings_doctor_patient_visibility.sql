-- ============================================================================
-- Migration 032: Organization settings + doctor patient visibility
--
-- Adds a JSONB `settings` column to organizations for org-level preferences.
-- First setting: `restrict_doctor_patients` (boolean, default false)
--   When true, doctors can only see patients they have had appointments with.
--   Admins, owners, and receptionists are unaffected.
--
-- Implementation: Replace the broad SELECT policy on patients with a
-- conditional one that checks the org setting + user role.
-- ============================================================================

-- ─── 1. Add settings column to organizations ─────────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

-- ─── 2. Helper: check if doctor patients are restricted for an org ──────────

CREATE OR REPLACE FUNCTION is_doctor_patients_restricted(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT (settings->>'restrict_doctor_patients')::boolean
     FROM organizations
     WHERE id = org_id),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── 3. Helper: get current user's role in an org ───────────────────────────

CREATE OR REPLACE FUNCTION get_user_org_role(org_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM organization_members
  WHERE user_id = auth.uid() AND organization_id = org_id
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── 4. Replace the patients SELECT policy ──────────────────────────────────
--
-- Logic:
-- If the org does NOT restrict doctor patients → same as before (org member sees all)
-- If the org DOES restrict AND user role is 'doctor':
--   only show patients where there exists at least one appointment
--   with that doctor's doctor record
-- Otherwise (admin, owner, receptionist) → see all org patients

DROP POLICY IF EXISTS "org_select_patients" ON patients;

CREATE POLICY "org_select_patients" ON patients FOR SELECT
  USING (
    -- Must be a member of the patient's org
    organization_id IN (SELECT get_user_org_ids())
    AND (
      -- Not restricted → everyone sees all patients
      NOT is_doctor_patients_restricted(organization_id)
      -- OR user is not a doctor → sees all patients
      OR get_user_org_role(organization_id) != 'doctor'
      -- OR user IS a doctor AND restriction is on → only their patients
      OR EXISTS (
        SELECT 1 FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        WHERE a.patient_id = patients.id
          AND a.organization_id = patients.organization_id
          AND d.user_id = auth.uid()
      )
    )
  );

-- ─── 5. Same logic for patient_tags (follows patient visibility) ────────────

DROP POLICY IF EXISTS "org_select_patient_tags" ON patient_tags;

CREATE POLICY "org_select_patient_tags" ON patient_tags FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids())
    AND (
      NOT is_doctor_patients_restricted(organization_id)
      OR get_user_org_role(organization_id) != 'doctor'
      OR EXISTS (
        SELECT 1 FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        WHERE a.patient_id = patient_tags.patient_id
          AND a.organization_id = patient_tags.organization_id
          AND d.user_id = auth.uid()
      )
    )
  );

-- ─── 6. Same logic for patient_payments (follows patient visibility) ────────

DROP POLICY IF EXISTS "org_select_patient_payments" ON patient_payments;

CREATE POLICY "org_select_patient_payments" ON patient_payments FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids())
    AND (
      NOT is_doctor_patients_restricted(organization_id)
      OR get_user_org_role(organization_id) != 'doctor'
      OR EXISTS (
        SELECT 1 FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        WHERE a.patient_id = patient_payments.patient_id
          AND a.organization_id = patient_payments.organization_id
          AND d.user_id = auth.uid()
      )
    )
  );
