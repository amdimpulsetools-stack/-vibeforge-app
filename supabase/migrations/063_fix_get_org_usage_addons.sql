-- Fix get_org_usage: migration 031 lost role-specific counts and addon breakdown.
-- Restore admins, receptionists, doctor_members, extra_offices, extra_members
-- while keeping the security check from 031.

CREATE OR REPLACE FUNCTION get_org_usage(org_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Verify caller is a member of this org
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND organization_id = org_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'members', (SELECT count(*) FROM organization_members WHERE organization_id = org_id AND is_active = true),
    'doctors', (SELECT count(*) FROM doctors WHERE organization_id = org_id AND is_active = true),
    'offices', (SELECT count(*) FROM offices WHERE organization_id = org_id AND is_active = true),
    'patients', (SELECT count(*) FROM patients WHERE organization_id = org_id),
    'monthly_appointments', (
      SELECT count(*) FROM appointments
      WHERE organization_id = org_id
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
    ),
    'admins', (SELECT count(*) FROM organization_members WHERE organization_id = org_id AND role = 'admin' AND is_active = true),
    'receptionists', (SELECT count(*) FROM organization_members WHERE organization_id = org_id AND role = 'receptionist' AND is_active = true),
    'doctor_members', (SELECT count(*) FROM organization_members WHERE organization_id = org_id AND role = 'doctor' AND is_active = true),
    'extra_offices', (
      SELECT COALESCE(SUM(quantity), 0) FROM plan_addons
      WHERE organization_id = org_id AND addon_type = 'extra_office' AND is_active = true
    ),
    'extra_members', (
      SELECT COALESCE(SUM(quantity), 0) FROM plan_addons
      WHERE organization_id = org_id AND addon_type = 'extra_member' AND is_active = true
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
