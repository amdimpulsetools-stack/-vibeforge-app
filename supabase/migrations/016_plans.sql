-- =============================================
-- Migration 016: Plans & Subscriptions
-- Creates configurable plans with feature limits
-- and organization_subscriptions to track active plans.
-- =============================================

-- 1. Plans catalog (editable names, prices, features)
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,             -- 'starter', 'professional', 'enterprise'
  name TEXT NOT NULL,                     -- Display name (editable)
  description TEXT,                       -- Short description
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly NUMERIC(10,2),            -- Optional annual price
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false, -- Auto-assigned to new orgs
  display_order INT NOT NULL DEFAULT 0,
  -- Feature limits (null = unlimited)
  max_members INT,
  max_doctors INT,
  max_offices INT,
  max_patients INT,
  max_appointments_per_month INT,
  max_storage_mb INT,
  -- Feature flags
  feature_reports BOOLEAN NOT NULL DEFAULT true,
  feature_export BOOLEAN NOT NULL DEFAULT false,
  feature_custom_roles BOOLEAN NOT NULL DEFAULT false,
  feature_api_access BOOLEAN NOT NULL DEFAULT false,
  feature_priority_support BOOLEAN NOT NULL DEFAULT false,
  --
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_plans
  BEFORE UPDATE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 2. Organization subscriptions (which plan each org has)
CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,                -- null = no expiry (lifetime/manual)
  trial_ends_at TIMESTAMPTZ,             -- For trial plans
  cancelled_at TIMESTAMPTZ,
  -- Payment gateway fields (for future Stripe/MP integration)
  external_id TEXT,                       -- stripe_subscription_id, etc.
  payment_provider TEXT,                  -- 'stripe', 'mercadopago', 'manual'
  --
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_subs_org ON organization_subscriptions(organization_id);
CREATE INDEX idx_org_subs_plan ON organization_subscriptions(plan_id);
CREATE INDEX idx_org_subs_status ON organization_subscriptions(status);

CREATE TRIGGER set_updated_at_org_subs
  BEFORE UPDATE ON organization_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 3. RLS policies
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Plans are readable by all authenticated users (public catalog)
CREATE POLICY "plans_select" ON plans FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only super-admins can modify plans (via service role / direct DB)
-- No insert/update/delete policies for regular users

ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;

-- Org members can see their own subscription
CREATE POLICY "org_subs_select" ON organization_subscriptions FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

-- Only org admins can manage subscriptions
CREATE POLICY "org_subs_insert" ON organization_subscriptions FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "org_subs_update" ON organization_subscriptions FOR UPDATE
  USING (is_org_admin(organization_id));

-- 4. Seed the 3 default plans
INSERT INTO plans (slug, name, description, price_monthly, price_yearly, is_default, display_order,
  max_members, max_doctors, max_offices, max_patients, max_appointments_per_month, max_storage_mb,
  feature_reports, feature_export, feature_custom_roles, feature_api_access, feature_priority_support)
VALUES
  ('starter', 'Starter', 'Ideal para consultorios pequeños que inician', 0, NULL, true, 1,
   2, 2, 1, 100, 50, 100,
   true, false, false, false, false),
  ('professional', 'Professional', 'Para clínicas en crecimiento con múltiples doctores', 29, 290, false, 2,
   10, 10, 3, 1000, 500, 1024,
   true, true, false, false, false),
  ('enterprise', 'Enterprise', 'Solución completa para clínicas grandes', 99, 990, false, 3,
   NULL, NULL, NULL, NULL, NULL, 10240,
   true, true, true, true, true);

-- 5. Migrate existing organizations: assign default plan (starter)
-- Create a subscription for every org that doesn't have one
INSERT INTO organization_subscriptions (organization_id, plan_id, status, started_at)
SELECT o.id, p.id, 'active', now()
FROM organizations o
CROSS JOIN plans p
WHERE p.is_default = true
  AND NOT EXISTS (
    SELECT 1 FROM organization_subscriptions os WHERE os.organization_id = o.id
  );

-- 6. RPC: Get current org plan with limits (for the usePlan hook)
CREATE OR REPLACE FUNCTION get_org_plan(org_id UUID)
RETURNS JSON AS $$
  SELECT json_build_object(
    'plan', json_build_object(
      'id', p.id,
      'slug', p.slug,
      'name', p.name,
      'description', p.description,
      'price_monthly', p.price_monthly,
      'max_members', p.max_members,
      'max_doctors', p.max_doctors,
      'max_offices', p.max_offices,
      'max_patients', p.max_patients,
      'max_appointments_per_month', p.max_appointments_per_month,
      'max_storage_mb', p.max_storage_mb,
      'feature_reports', p.feature_reports,
      'feature_export', p.feature_export,
      'feature_custom_roles', p.feature_custom_roles,
      'feature_api_access', p.feature_api_access,
      'feature_priority_support', p.feature_priority_support
    ),
    'subscription', json_build_object(
      'id', os.id,
      'status', os.status,
      'started_at', os.started_at,
      'expires_at', os.expires_at,
      'trial_ends_at', os.trial_ends_at
    )
  )
  FROM organization_subscriptions os
  JOIN plans p ON p.id = os.plan_id
  WHERE os.organization_id = org_id
    AND os.status IN ('active', 'trialing')
  ORDER BY os.created_at DESC
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 7. RPC: Get org usage counts (for soft limit checks)
CREATE OR REPLACE FUNCTION get_org_usage(org_id UUID)
RETURNS JSON AS $$
  SELECT json_build_object(
    'members', (SELECT count(*) FROM organization_members WHERE organization_id = org_id),
    'doctors', (SELECT count(*) FROM doctors WHERE organization_id = org_id),
    'offices', (SELECT count(*) FROM offices WHERE organization_id = org_id),
    'patients', (SELECT count(*) FROM patients WHERE organization_id = org_id),
    'appointments_this_month', (
      SELECT count(*) FROM appointments
      WHERE organization_id = org_id
        AND date >= date_trunc('month', now())
        AND date < date_trunc('month', now()) + interval '1 month'
    )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
