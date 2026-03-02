-- =============================================
-- Migration 029: Seed Organization Subscriptions
-- Creates subscriptions for organizations that don't have one.
-- Assigns plans based on existing user context:
--   - oscarfiverr@gmail.com (founder) → Clínica / Enterprise (active, no trial)
--   - amdimpulsetools@gmail.com       → Centro Médico / Professional (trial 14 days)
--   - oscarduranperu@gmail.com        → Independiente / Starter (trial 14 days)
--   - Any other org without subscription → Independiente (trial 14 days)
-- =============================================

DO $$
DECLARE
  v_independiente_id UUID;
  v_professional_id UUID;
  v_enterprise_id UUID;
  v_org RECORD;
  v_plan_id UUID;
  v_sub_status TEXT;
  v_trial_ends TIMESTAMPTZ;
  v_user_email TEXT;
BEGIN
  -- Get plan IDs by slug (handle both old and new slugs)
  SELECT id INTO v_independiente_id FROM plans WHERE slug IN ('independiente', 'starter') AND is_active = true LIMIT 1;
  SELECT id INTO v_professional_id FROM plans WHERE slug = 'professional' AND is_active = true;
  SELECT id INTO v_enterprise_id FROM plans WHERE slug = 'enterprise' AND is_active = true;

  -- Skip if no plans exist at all
  IF v_independiente_id IS NULL AND v_professional_id IS NULL AND v_enterprise_id IS NULL THEN
    RAISE NOTICE 'No plans found, skipping subscription seeding.';
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
    -- Defaults: Independiente, trial 14 days
    v_plan_id := v_independiente_id;
    v_sub_status := 'trialing';
    v_trial_ends := now() + interval '14 days';

    -- Determine plan based on owner email
    IF v_org.owner_id IS NOT NULL THEN
      SELECT email INTO v_user_email FROM auth.users WHERE id = v_org.owner_id;

      -- Founder (oscarfiverr) → Clínica, active, no trial
      IF v_user_email = 'oscarfiverr@gmail.com' THEN
        v_plan_id := COALESCE(v_enterprise_id, v_independiente_id);
        v_sub_status := 'active';
        v_trial_ends := NULL;

      -- amdimpulsetools → Centro Médico, trial 14 days
      ELSIF v_user_email = 'amdimpulsetools@gmail.com' THEN
        v_plan_id := COALESCE(v_professional_id, v_independiente_id);
        v_sub_status := 'trialing';
        v_trial_ends := now() + interval '14 days';

      -- oscarduranperu → Independiente, trial 14 days (uses defaults)
      END IF;
    END IF;

    -- Insert the subscription
    INSERT INTO organization_subscriptions (
      organization_id,
      plan_id,
      status,
      started_at,
      expires_at,
      trial_ends_at,
      payment_provider
    ) VALUES (
      v_org.org_id,
      v_plan_id,
      v_sub_status,
      now(),
      CASE WHEN v_sub_status = 'active' THEN NULL ELSE v_trial_ends END,
      v_trial_ends,
      'manual'
    );

    RAISE NOTICE 'Created % subscription for org "%" (%) → plan %',
      v_sub_status, v_org.name, v_org.org_id, v_plan_id;
  END LOOP;
END;
$$;
