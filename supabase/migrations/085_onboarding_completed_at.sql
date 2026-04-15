-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 085: Onboarding Completed Flag
--
-- Replaces the brittle "has_whatsapp" onboarding gate with an explicit
-- `onboarding_completed_at` timestamp on `organizations`. This unblocks
-- a multi-step wizard (WhatsApp + clinic contact + scheduler + first
-- service) without forcing users who already completed setup through
-- the new flow.
--
-- Backward-compatible by design:
--   • Existing orgs with any whatsapp_phone owner are backfilled with
--     current timestamp (they already "completed" the old 1-step flow).
--   • The RPC `get_user_session_check` returns a new
--     `onboarding_completed` boolean alongside the existing fields.
--   • Middleware migration (client code) can ignore `has_whatsapp`
--     and rely on `onboarding_completed` going forward.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add the column
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_organizations_onboarding_completed
  ON organizations(onboarding_completed_at)
  WHERE onboarding_completed_at IS NOT NULL;

-- 2. Backfill: any org whose owner already has a whatsapp_phone is
-- considered "onboarded" under the legacy 1-step flow.
UPDATE organizations o
SET onboarding_completed_at = now()
WHERE onboarding_completed_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM organization_members m
    JOIN user_profiles up ON up.id = m.user_id
    WHERE m.organization_id = o.id
      AND m.role IN ('owner', 'admin')
      AND m.is_active = true
      AND up.whatsapp_phone IS NOT NULL
      AND up.whatsapp_phone <> ''
  );

-- 3. Update the middleware RPC to include onboarding_completed
-- (keeps has_whatsapp for backwards-compat during deploy window)
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

-- 4. RLS: owners/admins can update onboarding_completed_at on their org
-- (covered by existing "org_update_organizations" policy from migration 013)
