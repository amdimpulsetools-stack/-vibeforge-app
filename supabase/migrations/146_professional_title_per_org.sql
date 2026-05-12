-- Migration 146: move professional_title from user_profiles (global) to
-- organization_members (per-org). A doctor invited into multiple clinics
-- can hold a different title in each one (Dr. in clinic A, Lic. in clinic B).
--
-- Strategy: ADD COLUMN + backfill from user_profiles. Keep the legacy
-- user_profiles.professional_title intact for now; it stops being written
-- by the app in this release. A follow-up migration will DROP it once we
-- confirm no remaining reads in production.

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS professional_title text
  CHECK (
    professional_title IS NULL
    OR professional_title IN ('doctor', 'especialista', 'licenciada')
  );

COMMENT ON COLUMN organization_members.professional_title IS
  'Per-org professional title (Dr./Esp./Lic.) for doctor members. NULL for non-doctor roles. Replaces the deprecated global user_profiles.professional_title (mig 017).';

-- Backfill: copy from user_profiles for existing doctor memberships.
-- Only sets the new column when it is currently NULL — re-running this
-- migration is a no-op even if some rows were already populated.
UPDATE organization_members om
SET professional_title = up.professional_title
FROM user_profiles up
WHERE om.user_id = up.id
  AND om.role = 'doctor'
  AND up.professional_title IS NOT NULL
  AND om.professional_title IS NULL;

-- Self-service title update: a doctor needs to change their own title
-- from the /account page, but the existing UPDATE policy on
-- organization_members is admin-only (mig 013). Opening UPDATE to the
-- own row would let the user escalate their role, so we expose a narrow
-- SECURITY DEFINER RPC that ONLY touches professional_title and ONLY on
-- the caller's own doctor membership.
CREATE OR REPLACE FUNCTION update_my_professional_title(
  p_org_id uuid,
  p_title text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_title IS NOT NULL
     AND p_title NOT IN ('doctor', 'especialista', 'licenciada') THEN
    RAISE EXCEPTION 'invalid_professional_title';
  END IF;

  UPDATE organization_members
  SET professional_title = p_title
  WHERE user_id = auth.uid()
    AND organization_id = p_org_id
    AND role = 'doctor';
END;
$$;

REVOKE ALL ON FUNCTION update_my_professional_title(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_my_professional_title(uuid, text) TO authenticated;

COMMENT ON FUNCTION update_my_professional_title(uuid, text) IS
  'Allows an authenticated doctor to update their own professional_title in a specific org. Restricted to role=doctor memberships; raises if the value is not in the allowed enum.';

-- Rewrite accept_invitation (last touched in mig 027) for per-org titles.
-- The old version had two bugs that this release fixes:
--   1. It did `DELETE FROM organization_members WHERE user_id = auth.uid()`
--      which evicted the invitee from EVERY other clinic — so a doctor in
--      Vitra invited as receptionist elsewhere lost Vitra access entirely.
--   2. It wrote professional_title into user_profiles (global), leaking the
--      invitation's title across all clinics where the same user is a
--      member.
-- New behaviour:
--   - Only deletes prior memberships in orgs where the user is the SOLE
--     member (the auto-created default org from handle_new_user). Real
--     multi-tenant memberships stay intact.
--   - Stores the title on the new organization_members row (per-org).
CREATE OR REPLACE FUNCTION accept_invitation(invite_token UUID)
RETURNS JSONB AS $$
DECLARE
  inv RECORD;
  user_name TEXT;
  existing_doctor_id UUID;
  unlinked_doctor_id UUID;
  member_title TEXT;
  auto_org RECORD;
BEGIN
  SELECT * INTO inv
  FROM organization_invitations
  WHERE token = invite_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired');
  END IF;

  -- Drop only the user's auto-created default orgs (sole-member rows),
  -- never touch memberships in shared clinics.
  FOR auto_org IN
    SELECT om.id, om.organization_id
    FROM organization_members om
    WHERE om.user_id = auth.uid()
      AND om.organization_id <> inv.organization_id
  LOOP
    IF (
      SELECT count(*) FROM organization_members
      WHERE organization_id = auto_org.organization_id
    ) = 1 THEN
      DELETE FROM organization_members WHERE id = auto_org.id;
    END IF;
  END LOOP;

  -- Per-org professional_title: NULL when the role is not doctor.
  member_title := CASE
    WHEN inv.role = 'doctor' THEN COALESCE(inv.professional_title, 'doctor')
    ELSE NULL
  END;

  INSERT INTO organization_members (
    user_id, organization_id, role, professional_title
  )
  VALUES (auth.uid(), inv.organization_id, inv.role, member_title)
  ON CONFLICT (user_id, organization_id) DO UPDATE
    SET role = EXCLUDED.role,
        professional_title = EXCLUDED.professional_title;

  -- Auto-link or auto-create doctor record if role is doctor
  IF inv.role = 'doctor' THEN
    SELECT id INTO existing_doctor_id
    FROM doctors
    WHERE user_id = auth.uid() AND organization_id = inv.organization_id
    LIMIT 1;

    IF existing_doctor_id IS NULL THEN
      SELECT full_name INTO user_name
      FROM user_profiles
      WHERE id = auth.uid();

      user_name := COALESCE(user_name, split_part(inv.email, '@', 1));

      SELECT id INTO unlinked_doctor_id
      FROM doctors
      WHERE user_id IS NULL
        AND organization_id = inv.organization_id
        AND is_active = true
        AND lower(trim(full_name)) = lower(trim(user_name))
      LIMIT 1;

      IF unlinked_doctor_id IS NOT NULL THEN
        UPDATE doctors
        SET user_id = auth.uid()
        WHERE id = unlinked_doctor_id;
      ELSE
        INSERT INTO doctors (full_name, cmp, organization_id, user_id, is_active)
        VALUES (
          user_name,
          'PEND-' || left(gen_random_uuid()::text, 8),
          inv.organization_id,
          auth.uid(),
          true
        );
      END IF;
    END IF;
  END IF;

  UPDATE organization_invitations
  SET status = 'accepted'
  WHERE id = inv.id;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', inv.organization_id,
    'role', inv.role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
