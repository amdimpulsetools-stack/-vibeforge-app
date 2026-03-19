-- =============================================
-- Migration 026: Auto-link doctor record on dashboard access
--
-- When a doctor visits their dashboard and has no linked
-- doctor record (user_id in doctors table), automatically
-- create one if they have the 'doctor' role in the org.
-- This fixes the "Cuenta no vinculada" issue that occurs
-- when the doctor record wasn't created during invitation.
-- =============================================

CREATE OR REPLACE FUNCTION get_doctor_personal_stats(p_user_id UUID, org_id UUID)
RETURNS JSON AS $$
DECLARE
  doctor_record_id UUID;
  user_name TEXT;
  user_role TEXT;
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

      -- Create a doctor record linked to this user
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
