-- ============================================================================
-- Migration 055: Enhanced Doctor Dashboard RPC
-- Replaces the basic get_doctor_personal_stats with a rich dashboard function
-- ============================================================================

CREATE OR REPLACE FUNCTION get_doctor_dashboard_enhanced(p_user_id UUID, org_id UUID)
RETURNS JSON AS $$
DECLARE
  doctor_record_id UUID;
  result JSON;
BEGIN
  -- Authorization: only the user themselves or an org admin can call this
  IF p_user_id != auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid() AND organization_id = org_id AND role IN ('owner', 'admin')
    ) THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
  END IF;

  -- Verify caller is a member of this org
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND organization_id = org_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Find existing doctor record
  SELECT id INTO doctor_record_id
  FROM doctors
  WHERE user_id = p_user_id AND organization_id = org_id AND is_active = true
  LIMIT 1;

  -- Auto-link logic (same as original)
  IF doctor_record_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = p_user_id AND organization_id = org_id AND role = 'doctor'
    ) THEN
      DECLARE
        user_name TEXT;
      BEGIN
        SELECT full_name INTO user_name FROM user_profiles WHERE id = p_user_id;

        IF user_name IS NOT NULL THEN
          SELECT id INTO doctor_record_id
          FROM doctors
          WHERE user_id IS NULL
            AND organization_id = org_id
            AND is_active = true
            AND LOWER(TRIM(full_name)) = LOWER(TRIM(user_name))
          LIMIT 1;

          IF doctor_record_id IS NOT NULL THEN
            UPDATE doctors SET user_id = p_user_id WHERE id = doctor_record_id;
          ELSE
            INSERT INTO doctors (full_name, cmp, organization_id, user_id, is_active)
            VALUES (user_name, 'PEND-' || LEFT(gen_random_uuid()::text, 8), org_id, p_user_id, true)
            RETURNING id INTO doctor_record_id;
          END IF;
        END IF;
      END;
    END IF;
  END IF;

  IF doctor_record_id IS NULL THEN
    RETURN json_build_object(
      'has_doctor_record', false,
      'doctor_id', NULL,
      'stats', NULL
    );
  END IF;

  SELECT json_build_object(
    'has_doctor_record', true,
    'doctor_id', doctor_record_id,
    'stats', json_build_object(
      -- ── KPI metrics ──
      'today_appointments', (
        SELECT count(*) FROM appointments
        WHERE doctor_id = doctor_record_id
          AND appointment_date = CURRENT_DATE
          AND status IN ('scheduled', 'confirmed', 'completed')
      ),
      'today_completed', (
        SELECT count(*) FROM appointments
        WHERE doctor_id = doctor_record_id
          AND appointment_date = CURRENT_DATE
          AND status = 'completed'
      ),
      'week_appointments', (
        SELECT count(*) FROM appointments
        WHERE doctor_id = doctor_record_id
          AND appointment_date >= DATE_TRUNC('week', CURRENT_DATE)
          AND appointment_date < DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '7 days'
          AND status IN ('scheduled', 'confirmed', 'completed')
      ),
      'month_completed', (
        SELECT count(*) FROM appointments
        WHERE doctor_id = doctor_record_id
          AND DATE_TRUNC('month', appointment_date) = DATE_TRUNC('month', CURRENT_DATE)
          AND status = 'completed'
      ),
      'month_total', (
        SELECT count(*) FROM appointments
        WHERE doctor_id = doctor_record_id
          AND DATE_TRUNC('month', appointment_date) = DATE_TRUNC('month', CURRENT_DATE)
          AND status IN ('scheduled', 'confirmed', 'completed', 'cancelled')
      ),
      'month_revenue', (
        SELECT COALESCE(SUM(pp.amount), 0)
        FROM patient_payments pp
        JOIN appointments a ON pp.appointment_id = a.id
        WHERE a.doctor_id = doctor_record_id
          AND DATE_TRUNC('month', pp.payment_date) = DATE_TRUNC('month', CURRENT_DATE)
      ),
      'total_patients', (
        SELECT count(DISTINCT patient_id) FROM appointments
        WHERE doctor_id = doctor_record_id AND patient_id IS NOT NULL
      ),
      'new_patients_month', (
        SELECT count(*) FROM (
          SELECT patient_id
          FROM appointments
          WHERE doctor_id = doctor_record_id AND patient_id IS NOT NULL
          GROUP BY patient_id
          HAVING MIN(appointment_date) >= DATE_TRUNC('month', CURRENT_DATE)
        ) np
      ),

      -- ── Today's full agenda ──
      'today_agenda', (
        SELECT COALESCE(json_agg(ta ORDER BY ta.start_time), '[]'::json)
        FROM (
          SELECT
            a.id,
            a.patient_id,
            a.patient_name,
            a.start_time,
            a.end_time,
            a.status,
            s.name AS service_name,
            o.name AS office_name,
            CASE WHEN cn.id IS NOT NULL THEN true ELSE false END AS has_note,
            CASE WHEN cn.is_signed = true THEN true ELSE false END AS note_signed
          FROM appointments a
          LEFT JOIN services s ON a.service_id = s.id
          LEFT JOIN offices o ON a.office_id = o.id
          LEFT JOIN clinical_notes cn ON cn.appointment_id = a.id
          WHERE a.doctor_id = doctor_record_id
            AND a.appointment_date = CURRENT_DATE
            AND a.status IN ('scheduled', 'confirmed', 'completed')
          ORDER BY a.start_time
        ) ta
      ),

      -- ── Upcoming appointments (next days, excludes today) ──
      'upcoming_appointments', (
        SELECT COALESCE(json_agg(ua ORDER BY ua.appointment_date, ua.start_time), '[]'::json)
        FROM (
          SELECT
            a.id,
            a.patient_name,
            a.appointment_date,
            a.start_time,
            a.end_time,
            a.status,
            s.name AS service_name,
            o.name AS office_name
          FROM appointments a
          LEFT JOIN services s ON a.service_id = s.id
          LEFT JOIN offices o ON a.office_id = o.id
          WHERE a.doctor_id = doctor_record_id
            AND a.appointment_date > CURRENT_DATE
            AND a.status IN ('scheduled', 'confirmed')
          ORDER BY a.appointment_date, a.start_time
          LIMIT 5
        ) ua
      ),

      -- ── Unsigned clinical notes ──
      'unsigned_notes_count', (
        SELECT count(*) FROM clinical_notes
        WHERE doctor_id = doctor_record_id
          AND organization_id = org_id
          AND is_signed = false
      ),
      'unsigned_notes', (
        SELECT COALESCE(json_agg(un ORDER BY un.created_at DESC), '[]'::json)
        FROM (
          SELECT
            cn.id,
            cn.appointment_id,
            a.patient_name,
            a.appointment_date,
            cn.created_at
          FROM clinical_notes cn
          JOIN appointments a ON cn.appointment_id = a.id
          WHERE cn.doctor_id = doctor_record_id
            AND cn.organization_id = org_id
            AND cn.is_signed = false
          ORDER BY cn.created_at DESC
          LIMIT 5
        ) un
      ),

      -- ── Pending followups ──
      'followup_counts', (
        SELECT json_build_object(
          'overdue', (
            SELECT count(*) FROM clinical_followups
            WHERE doctor_id = doctor_record_id
              AND organization_id = org_id
              AND is_resolved = false
              AND follow_up_date < CURRENT_DATE
          ),
          'today', (
            SELECT count(*) FROM clinical_followups
            WHERE doctor_id = doctor_record_id
              AND organization_id = org_id
              AND is_resolved = false
              AND follow_up_date = CURRENT_DATE
          ),
          'this_week', (
            SELECT count(*) FROM clinical_followups
            WHERE doctor_id = doctor_record_id
              AND organization_id = org_id
              AND is_resolved = false
              AND follow_up_date > CURRENT_DATE
              AND follow_up_date <= CURRENT_DATE + INTERVAL '7 days'
          )
        )
      ),
      'pending_followups', (
        SELECT COALESCE(json_agg(pf ORDER BY pf.priority_order, pf.follow_up_date), '[]'::json)
        FROM (
          SELECT
            cf.id,
            cf.patient_id,
            cf.reason,
            cf.priority,
            cf.follow_up_date,
            cf.notes,
            p.full_name AS patient_name,
            CASE cf.priority
              WHEN 'red' THEN 1
              WHEN 'yellow' THEN 2
              WHEN 'green' THEN 3
            END AS priority_order
          FROM clinical_followups cf
          LEFT JOIN patients p ON cf.patient_id = p.id
          WHERE cf.doctor_id = doctor_record_id
            AND cf.organization_id = org_id
            AND cf.is_resolved = false
            AND cf.follow_up_date <= CURRENT_DATE + INTERVAL '7 days'
          ORDER BY
            CASE cf.priority WHEN 'red' THEN 1 WHEN 'yellow' THEN 2 WHEN 'green' THEN 3 END,
            cf.follow_up_date
          LIMIT 8
        ) pf
      ),

      -- ── Recent completed (last 5) ──
      'recent_completed', (
        SELECT COALESCE(json_agg(rc ORDER BY rc.appointment_date DESC, rc.start_time DESC), '[]'::json)
        FROM (
          SELECT
            a.id,
            a.patient_name,
            a.appointment_date,
            a.start_time,
            s.name AS service_name,
            CASE WHEN cn.id IS NOT NULL THEN true ELSE false END AS has_note,
            CASE WHEN cn.is_signed = true THEN true ELSE false END AS note_signed
          FROM appointments a
          LEFT JOIN services s ON a.service_id = s.id
          LEFT JOIN clinical_notes cn ON cn.appointment_id = a.id
          WHERE a.doctor_id = doctor_record_id
            AND a.status = 'completed'
          ORDER BY a.appointment_date DESC, a.start_time DESC
          LIMIT 5
        ) rc
      )
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
