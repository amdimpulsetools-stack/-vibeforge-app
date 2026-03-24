-- ═══════════════════════════════════════════════════════════════════
-- FIX: Members require org's active subscription/trial to access
--
-- Reverts migration 066 behavior. Members (doctors, receptionists)
-- should NOT inherit access just because the org has a founder.
-- Instead, they only get access when the org has an active
-- subscription or a valid (non-expired) trial.
--
-- The founder always has access (they're the platform superuser).
-- Owner/Admin with expired trial → redirected to select-plan.
-- Members with expired trial → redirected to waiting-for-plan
-- (handled in middleware, not here).
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
      -- Founders (platform superuser) always have access
      COALESCE(
        (SELECT up.is_founder FROM user_profiles up WHERE up.id = p_user_id),
        false
      )
      -- Everyone else needs an active subscription or valid trial
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
