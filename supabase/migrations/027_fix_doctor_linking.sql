-- =============================================
-- Migration 027: Fix doctor record linking
--
-- BUG: When admin creates a doctor record (user_id = NULL)
-- and later invites that doctor as a user, the system creates
-- a SECOND doctor record instead of linking the existing one.
-- This causes appointments created under the original doctor
-- to not show up in the doctor's personal dashboard.
--
-- FIX: Before creating a new doctor record, try to find an
-- existing unlinked doctor record (user_id IS NULL) in the
-- same organization by name match, and link it instead.
-- =============================================

-- ─── Fix accept_invitation to link existing doctor records ──────────────

CREATE OR REPLACE FUNCTION accept_invitation(invite_token UUID)
RETURNS JSONB AS $$
DECLARE
  inv RECORD;
  user_name TEXT;
  existing_doctor_id UUID;
  unlinked_doctor_id UUID;
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

  -- Auto-link or auto-create doctor record if role is doctor
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

      -- Try to find an existing unlinked doctor record by name match
      SELECT id INTO unlinked_doctor_id
      FROM doctors
      WHERE user_id IS NULL
        AND organization_id = inv.organization_id
        AND is_active = true
        AND lower(trim(full_name)) = lower(trim(user_name))
      LIMIT 1;

      IF unlinked_doctor_id IS NOT NULL THEN
        -- Link the existing doctor record to this user
        UPDATE doctors
        SET user_id = auth.uid()
        WHERE id = unlinked_doctor_id;
      ELSE
        -- No match found, create a new doctor record
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


-- ─── Fix get_doctor_personal_stats to link existing doctor records ──────

CREATE OR REPLACE FUNCTION get_doctor_personal_stats(p_user_id UUID, org_id UUID)
RETURNS JSON AS $$
DECLARE
  doctor_record_id UUID;
  user_name TEXT;
  user_role TEXT;
  unlinked_doctor_id UUID;
  result JSON;
BEGIN
  -- Find the doctor record linked to this user
  SELECT id INTO doctor_record_id
  FROM doctors
  WHERE user_id = p_user_id AND organization_id = org_id
  LIMIT 1;

  -- If no linked record, try to auto-link or auto-create
  IF doctor_record_id IS NULL THEN
    -- Verify the user actually has the 'doctor' role in this org
    SELECT role INTO user_role
    FROM organization_members
    WHERE user_id = p_user_id AND organization_id = org_id
    LIMIT 1;

    IF user_role = 'doctor' THEN
      -- Get user's full name
      SELECT full_name INTO user_name
      FROM user_profiles
      WHERE id = p_user_id;

      user_name := COALESCE(user_name, 'Doctor');

      -- Try to find an existing unlinked doctor record by name match
      SELECT id INTO unlinked_doctor_id
      FROM doctors
      WHERE user_id IS NULL
        AND organization_id = org_id
        AND is_active = true
        AND lower(trim(full_name)) = lower(trim(user_name))
      LIMIT 1;

      IF unlinked_doctor_id IS NOT NULL THEN
        -- Link the existing doctor record to this user
        UPDATE doctors
        SET user_id = p_user_id
        WHERE id = unlinked_doctor_id;

        doctor_record_id := unlinked_doctor_id;
      ELSE
        -- No match found, create a new doctor record linked to this user
        INSERT INTO doctors (full_name, cmp, organization_id, user_id, is_active)
        VALUES (
          user_name,
          'PEND-' || left(gen_random_uuid()::text, 8),
          org_id,
          p_user_id,
          true
        )
        RETURNING id INTO doctor_record_id;
      END IF;
    END IF;
  END IF;

  -- Still no record → not linked
  IF doctor_record_id IS NULL THEN
    RETURN json_build_object('linked', false);
  END IF;

  SELECT json_build_object(
    'linked', true,
    'doctor_id', doctor_record_id,
    'today_appointments', (
      SELECT count(*) FROM appointments
      WHERE doctor_id = doctor_record_id
        AND appointment_date = CURRENT_DATE
        AND organization_id = org_id
    ),
    'month_appointments', (
      SELECT count(*) FROM appointments
      WHERE doctor_id = doctor_record_id
        AND appointment_date >= date_trunc('month', now())
        AND appointment_date < date_trunc('month', now()) + interval '1 month'
        AND organization_id = org_id
    ),
    'month_completed', (
      SELECT count(*) FROM appointments
      WHERE doctor_id = doctor_record_id
        AND status = 'completed'
        AND appointment_date >= date_trunc('month', now())
        AND organization_id = org_id
    ),
    'month_revenue', (
      SELECT COALESCE(SUM(COALESCE(a.price_snapshot, 0)), 0)
      FROM appointments a
      WHERE a.doctor_id = doctor_record_id
        AND a.status = 'completed'
        AND a.appointment_date >= date_trunc('month', now())
        AND a.organization_id = org_id
    ),
    'total_patients', (
      SELECT count(DISTINCT patient_id) FROM appointments
      WHERE doctor_id = doctor_record_id
        AND patient_id IS NOT NULL
        AND organization_id = org_id
    ),
    'upcoming_appointments', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
        SELECT a.id, a.patient_name, a.appointment_date, a.start_time,
               a.end_time, a.status, s.name as service_name, o.name as office_name
        FROM appointments a
        LEFT JOIN services s ON s.id = a.service_id
        LEFT JOIN offices o ON o.id = a.office_id
        WHERE a.doctor_id = doctor_record_id
          AND a.appointment_date >= CURRENT_DATE
          AND a.status IN ('scheduled', 'confirmed')
          AND a.organization_id = org_id
        ORDER BY a.appointment_date, a.start_time
        LIMIT 5
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── One-time fix: merge duplicate doctor records ──────────────────────
-- For doctors that already have duplicates (one with user_id, one without),
-- reassign all appointments/schedules/services from the unlinked duplicate
-- to the linked record, then deactivate the unlinked one.

DO $$
DECLARE
  linked RECORD;
  unlinked_id UUID;
BEGIN
  -- For each doctor record that has a user_id
  FOR linked IN
    SELECT d.id AS linked_id, d.user_id, d.organization_id, d.full_name
    FROM doctors d
    WHERE d.user_id IS NOT NULL
  LOOP
    -- Find unlinked duplicates with same name in same org
    FOR unlinked_id IN
      SELECT d2.id
      FROM doctors d2
      WHERE d2.user_id IS NULL
        AND d2.organization_id = linked.organization_id
        AND lower(trim(d2.full_name)) = lower(trim(linked.full_name))
        AND d2.id != linked.linked_id
    LOOP
      -- Reassign appointments from unlinked to linked doctor
      UPDATE appointments
      SET doctor_id = linked.linked_id
      WHERE doctor_id = unlinked_id;

      -- Reassign doctor_services (ignore conflicts)
      INSERT INTO doctor_services (doctor_id, service_id)
      SELECT linked.linked_id, ds.service_id
      FROM doctor_services ds
      WHERE ds.doctor_id = unlinked_id
      ON CONFLICT (doctor_id, service_id) DO NOTHING;

      DELETE FROM doctor_services WHERE doctor_id = unlinked_id;

      -- Reassign doctor_schedules (ignore conflicts)
      INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, office_id, is_active)
      SELECT linked.linked_id, ds.day_of_week, ds.start_time, ds.end_time, ds.office_id, ds.is_active
      FROM doctor_schedules ds
      WHERE ds.doctor_id = unlinked_id
      ON CONFLICT (doctor_id, day_of_week, start_time) DO NOTHING;

      DELETE FROM doctor_schedules WHERE doctor_id = unlinked_id;

      -- Deactivate the unlinked duplicate
      UPDATE doctors
      SET is_active = false,
          full_name = full_name || ' [DUPLICADO - MIGRADO]'
      WHERE id = unlinked_id;

      RAISE NOTICE 'Merged duplicate doctor % into linked doctor % (user_id: %)',
        unlinked_id, linked.linked_id, linked.user_id;
    END LOOP;
  END LOOP;
END $$;
