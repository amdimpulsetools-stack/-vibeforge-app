-- =============================================
-- Migration 029: Seed Organization Subscriptions
-- Creates trial subscriptions for organizations that don't have one.
-- Assigns plans based on existing user context:
--   - oscarfiverr@gmail.com  → Independiente (trial 14 days)
--   - amdimpulsetools@gmail.com → Centro Médico / Professional
--   - oscarduranperu@gmail.com → Independiente (trial 14 days)
--   - Any other org without subscription → Independiente (trial 14 days)
-- =============================================

DO $$
DECLARE
  v_independiente_id UUID;
  v_professional_id UUID;
  v_enterprise_id UUID;
  v_org RECORD;
  v_plan_id UUID;
  v_user_email TEXT;
  v_trial_days INT;
BEGIN
  -- Get plan IDs by slug
  SELECT id INTO v_independiente_id FROM plans WHERE slug = 'independiente' AND is_active = true;
  SELECT id INTO v_professional_id FROM plans WHERE slug = 'professional' AND is_active = true;
  SELECT id INTO v_enterprise_id FROM plans WHERE slug = 'enterprise' AND is_active = true;

  -- Fallback: if 'independiente' doesn't exist, try 'starter'
  IF v_independiente_id IS NULL THEN
    SELECT id INTO v_independiente_id FROM plans WHERE slug = 'starter' AND is_active = true;
  END IF;

  -- Skip if no plans exist
  IF v_independiente_id IS NULL THEN
    RAISE NOTICE 'No default plan found, skipping subscription seeding.';
    RETURN;
  END IF;

  -- Loop through all organizations that do NOT have an active/trialing subscription
  FOR v_org IN
    SELECT o.id AS org_id, o.name, o.owner_id
    FROM organizations o
    WHERE o.id != '00000000-0000-0000-0000-000000000001' -- skip default org
      AND NOT EXISTS (
        SELECT 1 FROM organization_subscriptions os
        WHERE os.organization_id = o.id
          AND os.status IN ('active', 'trialing')
      )
  LOOP
    -- Determine plan based on owner email
    v_plan_id := v_independiente_id; -- default
    v_trial_days := 14; -- default trial

    IF v_org.owner_id IS NOT NULL THEN
      SELECT email INTO v_user_email FROM auth.users WHERE id = v_org.owner_id;

      IF v_user_email = 'amdimpulsetools@gmail.com' THEN
        v_plan_id := COALESCE(v_professional_id, v_independiente_id);
        v_trial_days := 14;
      END IF;
      -- oscarfiverr and oscarduranperu get independiente (default)
    END IF;

    -- Insert the subscription
    INSERT INTO organization_subscriptions (
      organization_id,
      plan_id,
      status,
      started_at,
      trial_ends_at,
      payment_provider
    ) VALUES (
      v_org.org_id,
      v_plan_id,
      'trialing',
      now(),
      now() + (v_trial_days || ' days')::interval,
      'manual'
    );

    RAISE NOTICE 'Created subscription for org % (%) with plan %', v_org.name, v_org.org_id, v_plan_id;
  END LOOP;
END;
$$;
