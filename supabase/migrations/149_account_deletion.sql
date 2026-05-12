-- Migration 149: account / org deletion (Ley 29733 compliance).
--
-- Three laws collide here:
--   - Ley 29733 (Peru data protection): subject has the right to erasure
--   - SUNAT (tax): einvoices must be retained 5 years
--   - Ley General de Salud / NTS 139: clinical notes must be kept 15 years
--
-- Resolution: soft-delete the org for 30 days (owner can revert), then
-- IRREVERSIBLY anonymize all PII columns. No hard-delete of fiscal /
-- clinical rows. Anonymized rows satisfy retention laws because they
-- no longer constitute "personal data" under Ley 29733 (data subject
-- is unidentifiable).
--
-- Pre-conditions enforced by request_org_deletion():
--   1. Caller must be the org owner
--   2. The subscription must already be cancelled (not active/grace/trialing)
--   3. (No einvoice block — anonymization is non-destructive of fiscal data)
--
-- Multi-org users (mig 146 fix) are explicitly preserved: anonymizing
-- user_profiles ONLY happens for users with no other memberships.

-- ─── 1. Schema columns ────────────────────────────────────────────
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delete_grace_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delete_requested_by_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_organizations_delete_grace_pending
  ON organizations(delete_grace_until)
  WHERE deleted_at IS NOT NULL AND anonymized_at IS NULL;

-- ─── 2. Extend billing_events with deletion lifecycle ─────────────
ALTER TABLE billing_events
  DROP CONSTRAINT IF EXISTS billing_events_event_type_check;

ALTER TABLE billing_events
  ADD CONSTRAINT billing_events_event_type_check
  CHECK (event_type IN (
    'payment_failed',
    'entered_grace',
    'grace_extended',
    'grace_expired',
    'recovered_to_active',
    'past_due_terminated',
    'cancelled_by_user',
    'cancelled_by_mp',
    'email_sent',
    'plan_changed',
    'plan_change_mp_sync_failed',
    'addon_added',
    'addon_cancelled',
    'addon_mp_sync_failed',
    'org_delete_requested',
    'org_delete_cancelled',
    'org_delete_anonymized'
  ));

-- ─── 3. RPC: request_org_deletion ─────────────────────────────────
CREATE OR REPLACE FUNCTION request_org_deletion(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_sub_status text;
  v_already_deleted timestamptz;
  v_grace_until timestamptz;
BEGIN
  SELECT owner_id, deleted_at
  INTO v_owner_id, v_already_deleted
  FROM organizations
  WHERE id = p_org_id;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'org_not_found');
  END IF;

  IF auth.uid() <> v_owner_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
  END IF;

  IF v_already_deleted IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_deleted');
  END IF;

  -- Subscription must already be cancelled. Active/grace/trialing
  -- subscriptions would keep charging via MP after the org disappears,
  -- so we force the owner through /api/billing/cancel first.
  SELECT status INTO v_sub_status
  FROM organization_subscriptions
  WHERE organization_id = p_org_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub_status IN ('active', 'grace', 'trialing') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'subscription_still_active',
      'message', 'Cancela tu suscripción antes de eliminar la clínica.'
    );
  END IF;

  v_grace_until := now() + interval '30 days';

  UPDATE organizations
  SET deleted_at = now(),
      delete_grace_until = v_grace_until,
      delete_requested_by_user_id = auth.uid(),
      updated_at = now()
  WHERE id = p_org_id;

  INSERT INTO billing_events
    (organization_id, subscription_id, event_type, metadata)
  VALUES (
    p_org_id,
    NULL,
    'org_delete_requested',
    jsonb_build_object(
      'requested_by', auth.uid(),
      'grace_until', v_grace_until
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'grace_until', v_grace_until
  );
END;
$$;

REVOKE ALL ON FUNCTION request_org_deletion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_org_deletion(uuid) TO authenticated;

COMMENT ON FUNCTION request_org_deletion(uuid) IS
  'Owner-only soft-delete request. 30-day grace. Subscription must already be cancelled.';

-- ─── 4. RPC: cancel_org_deletion ──────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_org_deletion(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_deleted_at timestamptz;
  v_grace_until timestamptz;
  v_anonymized_at timestamptz;
BEGIN
  SELECT owner_id, deleted_at, delete_grace_until, anonymized_at
  INTO v_owner_id, v_deleted_at, v_grace_until, v_anonymized_at
  FROM organizations
  WHERE id = p_org_id;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'org_not_found');
  END IF;

  IF auth.uid() <> v_owner_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
  END IF;

  IF v_deleted_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_deletion');
  END IF;

  IF v_anonymized_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_anonymized');
  END IF;

  IF now() > v_grace_until THEN
    RETURN jsonb_build_object('ok', false, 'error', 'grace_period_expired');
  END IF;

  UPDATE organizations
  SET deleted_at = NULL,
      delete_grace_until = NULL,
      delete_requested_by_user_id = NULL,
      updated_at = now()
  WHERE id = p_org_id;

  INSERT INTO billing_events
    (organization_id, subscription_id, event_type, metadata)
  VALUES (
    p_org_id,
    NULL,
    'org_delete_cancelled',
    jsonb_build_object('cancelled_by', auth.uid())
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION cancel_org_deletion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_org_deletion(uuid) TO authenticated;

COMMENT ON FUNCTION cancel_org_deletion(uuid) IS
  'Owner-only. Reverts a soft-delete within the 30-day grace window.';

-- ─── 5. RPC: anonymize_org — called by cron after grace expires ──
-- IRREVERSIBLE. Replaces every PII column in the org footprint with
-- a deterministic ANON_<hash> placeholder. Fiscal (einvoices) and
-- health (clinical_notes via patients) rows remain queryable but
-- can no longer identify the data subject.
--
-- Multi-org users: user_profiles is only anonymized when the user has
-- NO other organization memberships (mig 146 made multi-org real).
-- auth.users is never touched — Supabase Auth owns that table and
-- recycling email vulnerabilities are a real risk.
--
-- NOT exposed to authenticated; only callable by service_role from the
-- cron endpoint (which gates with CRON_SECRET).
CREATE OR REPLACE FUNCTION anonymize_org(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_state record;
  v_anon_tag text;
  v_user record;
  v_member_count int;
  v_summary jsonb := '{}'::jsonb;
BEGIN
  SELECT id, deleted_at, delete_grace_until, anonymized_at
  INTO v_org_state
  FROM organizations
  WHERE id = p_org_id;

  IF v_org_state.id IS NULL THEN
    RAISE EXCEPTION 'org_not_found: %', p_org_id;
  END IF;
  IF v_org_state.deleted_at IS NULL THEN
    RAISE EXCEPTION 'org_not_in_deletion: %', p_org_id;
  END IF;
  IF v_org_state.anonymized_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_anonymized: %', p_org_id;
  END IF;
  IF v_org_state.delete_grace_until > now() THEN
    RAISE EXCEPTION 'grace_not_expired: %', p_org_id;
  END IF;

  v_anon_tag := 'ANON_' || substring(md5(p_org_id::text), 1, 10);

  -- patients
  UPDATE patients
  SET first_name = v_anon_tag,
      last_name  = v_anon_tag,
      email      = NULL,
      phone      = NULL,
      dni        = NULL
  WHERE organization_id = p_org_id;
  v_summary := v_summary || jsonb_build_object('patients', (SELECT count(*) FROM patients WHERE organization_id = p_org_id));

  -- doctors (org-scoped — same physical doctor in another org keeps
  -- their record intact thanks to the per-org row).
  UPDATE doctors
  SET full_name = v_anon_tag
  WHERE organization_id = p_org_id;

  -- appointments — patient_name/responsible are denormalized snapshots
  UPDATE appointments
  SET patient_name  = v_anon_tag,
      patient_phone = NULL,
      responsible   = NULL
  WHERE organization_id = p_org_id;

  -- einvoices — customer PII anon, document numbers kept (fiscal value)
  UPDATE einvoices
  SET customer_name    = v_anon_tag,
      customer_email   = NULL,
      customer_address = NULL
  WHERE organization_id = p_org_id;

  -- Organization itself — name + contact info
  UPDATE organizations
  SET name    = v_anon_tag,
      phone   = NULL,
      address = NULL,
      legal_name = NULL,
      tagline = NULL,
      website = NULL,
      email_public = NULL,
      social_facebook = NULL,
      social_instagram = NULL,
      social_tiktok = NULL,
      social_linkedin = NULL,
      social_youtube = NULL,
      social_whatsapp = NULL,
      logo_url = NULL,
      anonymized_at = now(),
      is_active = false
  WHERE id = p_org_id;

  -- user_profiles — only for users whose ONLY membership was this org
  FOR v_user IN
    SELECT om.user_id
    FROM organization_members om
    WHERE om.organization_id = p_org_id
  LOOP
    SELECT count(*) INTO v_member_count
    FROM organization_members
    WHERE user_id = v_user.user_id
      AND organization_id <> p_org_id;

    IF v_member_count = 0 THEN
      UPDATE user_profiles
      SET full_name      = v_anon_tag,
          phone          = NULL,
          whatsapp_phone = NULL
          -- email left intact: it's the auth.users key and we don't
          -- delete that row. Anonymizing email here would orphan the
          -- profile from the auth record.
      WHERE id = v_user.user_id;
    END IF;
  END LOOP;

  INSERT INTO billing_events
    (organization_id, subscription_id, event_type, metadata)
  VALUES (
    p_org_id,
    NULL,
    'org_delete_anonymized',
    jsonb_build_object('anon_tag', v_anon_tag, 'summary', v_summary)
  );

  RETURN jsonb_build_object('ok', true, 'anon_tag', v_anon_tag);
END;
$$;

REVOKE ALL ON FUNCTION anonymize_org(uuid) FROM PUBLIC;

COMMENT ON FUNCTION anonymize_org(uuid) IS
  'IRREVERSIBLE. Replaces PII columns with ANON_<hash>. Called only by /api/cron/account-deletion-process after the 30-day grace expires. Preserves fiscal (einvoices) and clinical (clinical_notes via patients) rows for SUNAT (5y) and Ley General de Salud (15y) retention.';
