-- =============================================
-- Migration 025: Auto-link doctor record on invitation
--
-- When a user accepts an invitation with role 'doctor',
-- automatically create a doctors table record with user_id
-- so their personal dashboard works immediately.
-- =============================================

-- Update accept_invitation to auto-create doctor record
CREATE OR REPLACE FUNCTION accept_invitation(invite_token UUID)
RETURNS JSONB AS $$
DECLARE
  inv RECORD;
  user_name TEXT;
  existing_doctor_id UUID;
BEGIN
  -- Find the pending, non-expired invitation
  SELECT * INTO inv
  FROM organization_invitations
  WHERE token = invite_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired');
  END IF;

  -- Remove user from any previous organization
  DELETE FROM organization_members WHERE user_id = auth.uid();

  -- Add user to the organization with the invited role
  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES (auth.uid(), inv.organization_id, inv.role)
  ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role;

  -- Set professional title if doctor role
  IF inv.role = 'doctor' AND inv.professional_title IS NOT NULL THEN
    UPDATE user_profiles
    SET professional_title = inv.professional_title
    WHERE id = auth.uid();
  END IF;

  -- Auto-create doctor record if role is doctor
  IF inv.role = 'doctor' THEN
    -- Check if a doctor record already exists for this user in this org
    SELECT id INTO existing_doctor_id
    FROM doctors
    WHERE user_id = auth.uid() AND organization_id = inv.organization_id
    LIMIT 1;

    IF existing_doctor_id IS NULL THEN
      -- Get user's full name from profile
      SELECT full_name INTO user_name
      FROM user_profiles
      WHERE id = auth.uid();

      user_name := COALESCE(user_name, split_part(inv.email, '@', 1));

      -- Create a doctor record linked to this user
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

  -- Mark invitation as accepted
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
