-- ============================================================================
-- Migration 031: Security Audit Fixes
-- Date: 2026-03-03
--
-- Fixes identified during security audit:
-- 1. CRITICAL: organization_invitations USING(true) SELECT policy
-- 2. CRITICAL: user_profiles UPDATE allows is_founder self-escalation
-- 3. HIGH: get_founder_stats() no auth check
-- 4. HIGH: get_doctor_personal_stats() no auth check
-- 5. MEDIUM: get_org_plan() / get_org_usage() no caller validation
-- 6. MEDIUM: find_user_by_email() no auth check
-- 7. MEDIUM: schedule_blocks DELETE not admin-only
-- 8. MEDIUM: seed_email_templates() callable by any user
-- 9. MEDIUM: ai_readonly_query() hardened forbidden patterns
-- ============================================================================

-- ============================================================================
-- FIX 1: Remove overly permissive SELECT on organization_invitations
-- Replace with RPC function for token lookup
-- ============================================================================

DROP POLICY IF EXISTS "anyone_can_read_by_token" ON organization_invitations;

-- Add a restricted policy: only org admins can list invitations for their org
-- (the "org_admins_manage_invitations" FOR ALL policy already covers this)
-- For token-based lookup, use the RPC function below:

CREATE OR REPLACE FUNCTION get_invitation_by_token(invite_token UUID)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'id', id,
    'organization_id', organization_id,
    'email', email,
    'role', role,
    'professional_title', professional_title,
    'status', status,
    'expires_at', expires_at
  )
  FROM organization_invitations
  WHERE token = invite_token
    AND status = 'pending'
    AND expires_at > now()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Allow anyone (including anon for registration flow) to call this
GRANT EXECUTE ON FUNCTION get_invitation_by_token(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_invitation_by_token(UUID) TO authenticated;

-- ============================================================================
-- FIX 2: Prevent is_founder / role self-escalation on user_profiles
-- The UPDATE policy must ensure protected columns cannot be changed by users
-- ============================================================================

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

CREATE POLICY "Users can update own profile (safe columns)"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Prevent changing protected columns: is_founder must remain the same
    AND is_founder = (SELECT up.is_founder FROM user_profiles up WHERE up.id = auth.uid())
  );

-- ============================================================================
-- FIX 3: Add founder check to get_founder_stats()
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
    'total_organizations', (SELECT count(*) FROM organizations WHERE id != '00000000-0000-0000-0000-000000000001'),
    'total_users', (SELECT count(*) FROM user_profiles),
    'total_patients', (SELECT count(*) FROM patients),
    'monthly_appointments', (
      SELECT count(*) FROM appointments
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
    ),
    'revenue', (
      SELECT COALESCE(json_agg(r), '[]'::json)
      FROM (
        SELECT
          TO_CHAR(DATE_TRUNC('month', ph.created_at), 'YYYY-MM') AS month,
          SUM(ph.amount) AS total
        FROM payment_history ph
        WHERE ph.status = 'approved'
        GROUP BY DATE_TRUNC('month', ph.created_at)
        ORDER BY month DESC
        LIMIT 6
      ) r
    ),
    'recent_organizations', (
      SELECT COALESCE(json_agg(o ORDER BY o.created_at DESC), '[]'::json)
      FROM (
        SELECT
          org.id,
          org.name,
          org.type,
          org.created_at,
          p.name AS plan_name,
          os.status AS subscription_status
        FROM organizations org
        LEFT JOIN organization_subscriptions os ON os.organization_id = org.id
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

-- ============================================================================
-- FIX 4: Add auth check to get_doctor_personal_stats()
-- ============================================================================

CREATE OR REPLACE FUNCTION get_doctor_personal_stats(p_user_id UUID, org_id UUID)
RETURNS JSON AS $$
DECLARE
  doctor_record_id UUID;
  stats JSON;
BEGIN
  -- Authorization: only the user themselves or an org admin can call this
  IF p_user_id != auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid() AND organization_id = org_id AND role IN ('owner', 'admin')
    ) THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
  END IF;

  -- Verify caller is a member of this org
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND organization_id = org_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Find existing doctor record for this user in this org
  SELECT id INTO doctor_record_id
  FROM doctors
  WHERE user_id = p_user_id AND organization_id = org_id AND is_active = true
  LIMIT 1;

  -- If no doctor record, try to auto-link or auto-create
  IF doctor_record_id IS NULL THEN
    -- Check if the user is a doctor role member
    IF EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = p_user_id AND organization_id = org_id AND role = 'doctor'
    ) THEN
      -- Try to find unlinked doctor by name
      DECLARE
        user_name TEXT;
      BEGIN
        SELECT full_name INTO user_name FROM user_profiles WHERE id = p_user_id;

        IF user_name IS NOT NULL THEN
          SELECT id INTO doctor_record_id
          FROM doctors
          WHERE user_id IS NULL
            AND organization_id = org_id
            AND is_active = true
            AND LOWER(TRIM(full_name)) = LOWER(TRIM(user_name))
          LIMIT 1;

          IF doctor_record_id IS NOT NULL THEN
            UPDATE doctors SET user_id = p_user_id WHERE id = doctor_record_id;
          ELSE
            INSERT INTO doctors (full_name, cmp, organization_id, user_id, is_active)
            VALUES (user_name, 'PEND-' || LEFT(gen_random_uuid()::text, 8), org_id, p_user_id, true)
            RETURNING id INTO doctor_record_id;
          END IF;
        END IF;
      END;
    END IF;
  END IF;

  IF doctor_record_id IS NULL THEN
    RETURN json_build_object(
      'has_doctor_record', false,
      'doctor_id', NULL,
      'stats', NULL
    );
  END IF;

  SELECT json_build_object(
    'has_doctor_record', true,
    'doctor_id', doctor_record_id,
    'stats', json_build_object(
      'today_appointments', (
        SELECT count(*) FROM appointments
        WHERE doctor_id = doctor_record_id
          AND appointment_date = CURRENT_DATE
          AND status IN ('scheduled', 'confirmed')
      ),
      'week_appointments', (
        SELECT count(*) FROM appointments
        WHERE doctor_id = doctor_record_id
          AND appointment_date >= DATE_TRUNC('week', CURRENT_DATE)
          AND appointment_date < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days'
          AND status IN ('scheduled', 'confirmed', 'completed')
      ),
      'month_completed', (
        SELECT count(*) FROM appointments
        WHERE doctor_id = doctor_record_id
          AND DATE_TRUNC('month', appointment_date) = DATE_TRUNC('month', CURRENT_DATE)
          AND status = 'completed'
      ),
      'total_patients', (
        SELECT count(DISTINCT patient_id) FROM appointments
        WHERE doctor_id = doctor_record_id
          AND patient_id IS NOT NULL
      ),
      'month_revenue', (
        SELECT COALESCE(SUM(pp.amount), 0)
        FROM patient_payments pp
        JOIN appointments a ON pp.appointment_id = a.id
        WHERE a.doctor_id = doctor_record_id
          AND DATE_TRUNC('month', pp.payment_date) = DATE_TRUNC('month', CURRENT_DATE)
      ),
      'upcoming_appointments', (
        SELECT COALESCE(json_agg(ua ORDER BY ua.appointment_date, ua.start_time), '[]'::json)
        FROM (
          SELECT
            a.id,
            a.patient_name,
            a.appointment_date,
            a.start_time,
            a.end_time,
            a.status,
            s.name AS service_name,
            o.name AS office_name
          FROM appointments a
          LEFT JOIN services s ON a.service_id = s.id
          LEFT JOIN offices o ON a.office_id = o.id
          WHERE a.doctor_id = doctor_record_id
            AND a.appointment_date >= CURRENT_DATE
            AND a.status IN ('scheduled', 'confirmed')
          ORDER BY a.appointment_date, a.start_time
          LIMIT 5
        ) ua
      )
    )
  ) INTO stats;

  RETURN stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FIX 5: Add membership check to get_org_plan() and get_org_usage()
-- ============================================================================

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
    'plan_id', p.id,
    'plan_name', p.name,
    'plan_slug', p.slug,
    'price_monthly', p.price_monthly,
    'price_yearly', p.price_yearly,
    'max_members', p.max_members,
    'max_doctors', p.max_doctors,
    'max_offices', p.max_offices,
    'max_patients', p.max_patients,
    'max_appointments_per_month', p.max_appointments_per_month,
    'features', p.features,
    'subscription_status', os.status,
    'trial_ends_at', os.trial_ends_at,
    'started_at', os.started_at,
    'addon_price_per_member', p.addon_price_per_member,
    'addon_price_per_office', p.addon_price_per_office
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
    'addons', (
      SELECT COALESCE(json_agg(json_build_object(
        'addon_type', addon_type,
        'quantity', quantity,
        'unit_price', unit_price
      )), '[]'::json)
      FROM plan_addons
      WHERE organization_id = org_id AND is_active = true
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- FIX 6: Add admin check to find_user_by_email()
-- ============================================================================

CREATE OR REPLACE FUNCTION find_user_by_email(lookup_email TEXT)
RETURNS UUID AS $$
DECLARE
  result UUID;
BEGIN
  -- Only org admins/owners can look up users by email
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  SELECT id INTO result FROM user_profiles WHERE email = lookup_email LIMIT 1;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- FIX 7: Restrict schedule_blocks DELETE to admins only
-- ============================================================================

DROP POLICY IF EXISTS "org_delete_schedule_blocks" ON schedule_blocks;
CREATE POLICY "org_delete_schedule_blocks" ON schedule_blocks FOR DELETE
  USING (is_org_admin(organization_id));

-- ============================================================================
-- FIX 8: Revoke direct execution of seed_email_templates from users
-- ============================================================================

REVOKE ALL ON FUNCTION seed_email_templates(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION seed_email_templates(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION seed_email_templates(UUID) FROM anon;

-- ============================================================================
-- FIX 9: Harden ai_readonly_query with additional forbidden patterns
-- and a statement timeout
-- ============================================================================

CREATE OR REPLACE FUNCTION ai_readonly_query(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result json;
  normalized text;
BEGIN
  normalized := lower(trim(query));

  -- Must start with SELECT
  IF normalized NOT LIKE 'select%' THEN
    RAISE EXCEPTION 'Solo se permiten consultas SELECT';
  END IF;

  -- Block dangerous patterns (expanded list)
  IF normalized ~* '(insert|update|delete|drop|truncate|alter|create|replace|grant|revoke|execute|copy\s|pg_read_file|pg_ls_dir|pg_sleep|pg_terminate|pg_cancel|pg_catalog|pg_authid|pg_shadow|pg_roles|information_schema|auth\.|set\s+role|set\s+session|reset\s|dblink|lo_import|lo_export|generate_series\s*\(\s*1)' THEN
    RAISE EXCEPTION 'La consulta contiene operaciones no permitidas';
  END IF;

  -- Block stacked queries (semicolons)
  IF normalized ~ ';\s*\w' THEN
    RAISE EXCEPTION 'No se permiten múltiples consultas';
  END IF;

  -- Set a statement timeout for this query (5 seconds max)
  SET LOCAL statement_timeout = '5s';

  EXECUTE format('SELECT json_agg(row_to_json(t)) FROM (%s) t', query) INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Re-apply permissions
REVOKE ALL ON FUNCTION ai_readonly_query(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_readonly_query(text) TO authenticated;
