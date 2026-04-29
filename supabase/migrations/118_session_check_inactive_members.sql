-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 118: Block sessions of fully deactivated members
--
-- The `is_active` column on `organization_members` already exists
-- (added in migration 030) and the UI already lets owners/admins
-- toggle it via PATCH /api/members/[id]. What was missing: the
-- middleware never re-checked it, so a deactivated member kept full
-- access until they manually logged out.
--
-- This migration extends the existing `get_user_session_check` RPC
-- (returns single jsonb consumed by `lib/supabase/middleware.ts`)
-- with two new keys:
--   - all_memberships_inactive  → true when every membership of the
--     user has is_active=false. Middleware redirects these users to
--     `/account-suspended`.
--   - membership_count          → number of memberships, for clarity
--     when debugging.
--
-- A user who is owner of org A (active) and member of org B
-- (deactivated) is NOT suspended — they still operate org A. Only
-- when ALL memberships are inactive do we cut them off.
--
-- The first row returned still preserves the previous shape so the
-- existing middleware fallback paths keep working unchanged.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_user_session_check(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH memberships AS (
    SELECT
      m.organization_id,
      m.role,
      m.is_active
    FROM organization_members m
    WHERE m.user_id = p_user_id
  ),
  active_membership AS (
    SELECT *
    FROM memberships
    WHERE is_active = true
    ORDER BY
      CASE role
        WHEN 'owner' THEN 1
        WHEN 'admin' THEN 2
        WHEN 'doctor' THEN 3
        WHEN 'receptionist' THEN 4
        ELSE 5
      END
    LIMIT 1
  ),
  fallback_membership AS (
    SELECT * FROM memberships LIMIT 1
  ),
  picked AS (
    SELECT * FROM active_membership
    UNION ALL
    SELECT * FROM fallback_membership
    WHERE NOT EXISTS (SELECT 1 FROM active_membership)
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'has_whatsapp', EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = p_user_id AND whatsapp_phone IS NOT NULL AND whatsapp_phone <> ''
    ),
    'onboarding_completed', EXISTS (
      SELECT 1 FROM organizations o
      JOIN picked p ON p.organization_id = o.id
      WHERE o.onboarding_completed_at IS NOT NULL
    ),
    'organization_id', (SELECT organization_id FROM picked),
    'role', (SELECT role FROM picked),
    'is_founder', COALESCE(
      (SELECT up.is_founder FROM user_profiles up WHERE up.id = p_user_id),
      false
    ),
    'membership_count', (SELECT COUNT(*) FROM memberships),
    'all_memberships_inactive', (
      EXISTS (SELECT 1 FROM memberships)
      AND NOT EXISTS (SELECT 1 FROM memberships WHERE is_active = true)
    ),
    'has_active_subscription', (
      COALESCE(
        (SELECT up.is_founder FROM user_profiles up WHERE up.id = p_user_id),
        false
      )
      OR EXISTS (
        SELECT 1 FROM organization_subscriptions os
        JOIN picked p ON p.organization_id = os.organization_id
        WHERE (
          os.status = 'active'
          OR (os.status = 'trialing' AND os.trial_ends_at > now())
        )
      )
    )
  );
$$;

COMMENT ON FUNCTION get_user_session_check(uuid) IS
  'Middleware session probe. Returns membership/role/subscription state plus all_memberships_inactive flag used by the suspension gate.';
