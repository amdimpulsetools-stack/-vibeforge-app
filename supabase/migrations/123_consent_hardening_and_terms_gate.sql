-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 123: Consent hardening + middleware terms gate
--
-- Three concerns bundled because they all relate to closing review
-- gaps from migrations 116/120/122:
--
--   1. Storage UPDATE policy on `informed-consents` bucket — migration
--      120 only shipped SELECT + INSERT. Symmetric UPDATE for org
--      members lets us refresh metadata or re-render without dropping
--      the row (still no DELETE; consents remain append-only).
--
--   2. Length CHECK on `informed_consents.signature_data` — the column
--      stores base64 PNG of drawn signatures. The schema allowed up to
--      500 KB which would bloat the table. 200 KB is plenty for a
--      600×180 PNG (typical: 5–30 KB) and matches the new server-side
--      Zod cap.
--
--   3. Middleware terms-acceptance gate (Ley 29733). Pre-existing users
--      created before migration 116 have NULL accepted_terms_at and
--      were never prompted. We extend `get_user_session_check` to
--      surface those columns so the middleware can redirect them to
--      /onboarding/accept-terms.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Storage UPDATE policy ─────────────────────────────────────
CREATE POLICY "informed_consents_storage_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'informed-consents'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
  )
  WITH CHECK (
    bucket_id = 'informed-consents'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
  );

-- ─── 2. Length CHECK on signature_data ────────────────────────────
ALTER TABLE informed_consents
  DROP CONSTRAINT IF EXISTS informed_consents_signature_data_size;

ALTER TABLE informed_consents
  ADD CONSTRAINT informed_consents_signature_data_size
  CHECK (signature_data IS NULL OR length(signature_data) <= 200000);

COMMENT ON COLUMN informed_consents.signature_data IS
  'Typed name (small) or base64 PNG of drawn signature. Capped at 200 KB to keep the table lean — the full visual artifact lives in storage.';

-- ─── 3. Extend get_user_session_check to surface terms columns ────
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
    ),
    'accepted_terms_at', (
      SELECT up.accepted_terms_at FROM user_profiles up WHERE up.id = p_user_id
    ),
    'accepted_terms_version', (
      SELECT up.accepted_terms_version FROM user_profiles up WHERE up.id = p_user_id
    )
  );
$$;

COMMENT ON FUNCTION get_user_session_check(uuid) IS
  'Middleware session probe. Returns membership/role/subscription state plus all_memberships_inactive flag and accepted_terms_at/version for the terms-acceptance gate.';
