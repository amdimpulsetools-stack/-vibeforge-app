-- ═══════════════════════════════════════════════════════════════════
-- AI Query Quotas — per-plan limits for AI assistant queries
-- Plans: starter=50, professional=120, enterprise=250
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add max_ai_queries column to plans table
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_ai_queries int DEFAULT 50;

-- Set per-plan defaults
UPDATE plans SET max_ai_queries = 50  WHERE slug = 'starter' OR slug = 'independiente';
UPDATE plans SET max_ai_queries = 120 WHERE slug = 'professional';
UPDATE plans SET max_ai_queries = 250 WHERE slug = 'enterprise';

-- 2. Track individual AI assistant query usage
CREATE TABLE IF NOT EXISTS ai_query_usage (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tokens_used     int DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_ai_query_usage_org_month
  ON ai_query_usage (organization_id, created_at);

ALTER TABLE ai_query_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view AI query usage"
  ON ai_query_usage FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Org members can insert AI query usage"
  ON ai_query_usage FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

-- 3. RPC: Count AI queries used this month for an organization
CREATE OR REPLACE FUNCTION get_ai_query_usage_this_month(org_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(COUNT(*)::int, 0)
  FROM ai_query_usage
  WHERE organization_id = org_id
    AND created_at >= date_trunc('month', now())
    AND created_at < date_trunc('month', now()) + interval '1 month';
$$;

-- 4. Update get_org_plan RPC to include max_ai_queries
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
    'max_ai_queries', p.max_ai_queries,
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
