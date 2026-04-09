-- ═══════════════════════════════════════════════════════════════════
-- FIX: Enforce trial expiration in middleware session check
--
-- Before: status IN ('active', 'trialing') passed regardless of trial_ends_at
-- After:  'trialing' only passes if trial_ends_at > now()
--         Founders bypass this check (always have access)
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
      OR EXISTS (
        SELECT 1 FROM organization_subscriptions os
        WHERE os.organization_id = m.organization_id
          AND (
            -- Active paid subscriptions always pass
            os.status = 'active'
            -- Trialing subscriptions only pass if trial hasn't expired
            OR (os.status = 'trialing' AND os.trial_ends_at > now())
          )
      )
    )
  )
  FROM organization_members m
  WHERE m.user_id = p_user_id
  LIMIT 1;
$$;
