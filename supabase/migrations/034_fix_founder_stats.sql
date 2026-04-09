-- ============================================================================
-- Migration 034: Fix get_founder_stats() function
-- The migration 031 broke the founder dashboard by:
--   1. Removing orgs_by_plan and orgs_by_type from the response
--   2. Renaming keys (monthly_appointments, revenue, recent_organizations)
--   3. Using wrong column name (org.type instead of org.organization_type)
--   4. Changing revenue from a simple number to an array
-- This migration restores the correct structure expected by the frontend.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_founder_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Only founders can access platform-wide stats
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_founder = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: founder access required';
  END IF;

  SELECT json_build_object(
    'total_organizations', (
      SELECT count(*) FROM organizations
      WHERE id != '00000000-0000-0000-0000-000000000001'
    ),
    'total_users', (SELECT count(*) FROM user_profiles),
    'total_patients', (SELECT count(*) FROM patients),
    'total_appointments_this_month', (
      SELECT count(*) FROM appointments
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
    ),
    'revenue_this_month', (
      SELECT COALESCE(SUM(ph.amount), 0)
      FROM payment_history ph
      WHERE ph.status = 'approved'
        AND DATE_TRUNC('month', ph.created_at) = DATE_TRUNC('month', CURRENT_DATE)
    ),
    'orgs_by_plan', (
      SELECT COALESCE(json_agg(r), '[]'::json)
      FROM (
        SELECT p.slug, p.name, count(os.id) AS org_count
        FROM plans p
        LEFT JOIN organization_subscriptions os
          ON os.plan_id = p.id AND os.status IN ('active', 'trialing')
        GROUP BY p.slug, p.name
        ORDER BY p.slug
      ) r
    ),
    'orgs_by_type', (
      SELECT COALESCE(json_agg(r), '[]'::json)
      FROM (
        SELECT organization_type, count(*) AS org_count
        FROM organizations
        WHERE id != '00000000-0000-0000-0000-000000000001'
        GROUP BY organization_type
        ORDER BY organization_type
      ) r
    ),
    'recent_orgs', (
      SELECT COALESCE(json_agg(o ORDER BY o.created_at DESC), '[]'::json)
      FROM (
        SELECT
          org.id,
          org.name,
          org.slug,
          org.organization_type,
          org.created_at,
          p.name AS plan_name,
          p.slug AS plan_slug,
          os.status AS sub_status
        FROM organizations org
        LEFT JOIN organization_subscriptions os
          ON os.organization_id = org.id
          AND os.status IN ('active', 'trialing')
        LEFT JOIN plans p ON p.id = os.plan_id
        WHERE org.id != '00000000-0000-0000-0000-000000000001'
        ORDER BY org.created_at DESC
        LIMIT 10
      ) o
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
