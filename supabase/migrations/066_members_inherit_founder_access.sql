-- ═══════════════════════════════════════════════════════════════════
-- FIX: Non-founder members inherit access from org founder
--
-- Problem: Members (doctors, receptionists) of an org with a founder
--          were being blocked when the trial expired, even though
--          plan management is the founder's responsibility.
--
-- Solution: has_active_subscription now also returns true if the
--           user's org has a founder (meaning the org is managed).
--           This lets members always access the dashboard while the
--           founder handles billing.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_user_session_check(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'has_whatsapp', EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = p_user_id AND whatsapp_phone IS NOT NULL AND whatsapp_phone <> ''
    ),
    'organization_id', m.organization_id,
    'role', m.role,
    'is_founder', COALESCE(
      (SELECT up.is_founder FROM user_profiles up WHERE up.id = p_user_id),
      false
    ),
    'has_active_subscription', (
      -- Founders always have access
      COALESCE(
        (SELECT up.is_founder FROM user_profiles up WHERE up.id = p_user_id),
        false
      )
      -- Non-founder members inherit access if their org has a founder
      -- (billing is the founder's responsibility, not the member's)
      OR EXISTS (
        SELECT 1 FROM organization_members om
        JOIN user_profiles fp ON fp.id = om.user_id AND fp.is_founder = true
        WHERE om.organization_id = m.organization_id
      )
      OR EXISTS (
        SELECT 1 FROM organization_subscriptions os
        WHERE os.organization_id = m.organization_id
          AND (
            os.status = 'active'
            OR (os.status = 'trialing' AND os.trial_ends_at > now())
          )
      )
    )
  )
  FROM organization_members m
  WHERE m.user_id = p_user_id
  LIMIT 1;
$$;
