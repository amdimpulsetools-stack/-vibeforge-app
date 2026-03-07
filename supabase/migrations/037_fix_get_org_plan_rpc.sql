-- =============================================
-- Migration 037: Fix get_org_plan RPC
-- The version in 031 references p.features (a non-existent column)
-- and is missing many fields the client expects.
-- This version returns all plan + subscription fields needed by use-plan.ts
-- =============================================

CREATE OR REPLACE FUNCTION get_org_plan(org_id UUID)
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
    -- Plan info
    'plan_id', p.id,
    'plan_name', p.name,
    'plan_slug', p.slug,
    'description', p.description,
    'price_monthly', p.price_monthly,
    'price_yearly', p.price_yearly,
    -- Limits
    'max_members', p.max_members,
    'max_doctors', p.max_doctors,
    'max_offices', p.max_offices,
    'max_patients', p.max_patients,
    'max_appointments_per_month', p.max_appointments_per_month,
    'max_storage_mb', p.max_storage_mb,
    'max_admins', p.max_admins,
    'max_receptionists', p.max_receptionists,
    'max_doctor_members', p.max_doctor_members,
    -- Addon pricing
    'addon_price_per_office', p.addon_price_per_office,
    'addon_price_per_member', p.addon_price_per_member,
    -- Target audience
    'target_audience', p.target_audience,
    -- Feature flags
    'feature_reports', p.feature_reports,
    'feature_export', p.feature_export,
    'feature_custom_roles', p.feature_custom_roles,
    'feature_api_access', p.feature_api_access,
    'feature_priority_support', p.feature_priority_support,
    'feature_ai_assistant', p.feature_ai_assistant,
    -- Subscription info
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
