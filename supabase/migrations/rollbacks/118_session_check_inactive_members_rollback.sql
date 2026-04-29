-- Rollback for migration 118
-- Reverts get_user_session_check to the migration 085 version (the
-- last stable before the all_memberships_inactive flag was added).

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
    'onboarding_completed', COALESCE(
      (SELECT o.onboarding_completed_at IS NOT NULL
         FROM organizations o
         WHERE o.id = m.organization_id),
      false
    ),
    'organization_id', m.organization_id,
    'role', m.role,
    'is_founder', COALESCE(
      (SELECT up.is_founder FROM user_profiles up WHERE up.id = p_user_id),
      false
    ),
    'has_active_subscription', (
      COALESCE(
        (SELECT up.is_founder FROM user_profiles up WHERE up.id = p_user_id),
        false
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
    AND m.is_active = true
  LIMIT 1;
$$;
