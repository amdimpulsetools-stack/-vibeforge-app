-- ═══════════════════════════════════════════════════════════════════
-- RPC: get_user_session_check
-- Consolidates the 3 sequential middleware queries into 1 call:
--   1. user_profiles.whatsapp_phone (onboarding check)
--   2. organization_members (org_id + role)
--   3. organization_subscriptions (active/trialing status)
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
    'has_active_subscription', EXISTS (
      SELECT 1 FROM organization_subscriptions
      WHERE organization_id = m.organization_id
        AND status IN ('active', 'trialing')
    )
  )
  FROM organization_members m
  WHERE m.user_id = p_user_id
  LIMIT 1;
$$;
