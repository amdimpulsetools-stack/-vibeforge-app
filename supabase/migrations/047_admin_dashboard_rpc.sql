-- Consolidated RPC for the admin dashboard
-- Replaces ~17 parallel queries with a single database call

CREATE OR REPLACE FUNCTION get_admin_dashboard_stats(
  p_today DATE DEFAULT CURRENT_DATE,
  p_month_start DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,
  p_month_end DATE DEFAULT (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE,
  p_last_month_start DATE DEFAULT (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::DATE,
  p_last_month_end DATE DEFAULT (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day')::DATE,
  p_week_start DATE DEFAULT (CURRENT_DATE - INTERVAL '6 days')::DATE,
  p_prev_week_start DATE DEFAULT (CURRENT_DATE - INTERVAL '13 days')::DATE,
  p_prev_week_end DATE DEFAULT (CURRENT_DATE - INTERVAL '7 days')::DATE,
  p_yesterday DATE DEFAULT (CURRENT_DATE - INTERVAL '1 day')::DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  v_org_ids UUID[];
BEGIN
  -- Get user's org IDs (respects RLS context)
  v_org_ids := ARRAY(SELECT get_user_org_ids());

  SELECT json_build_object(
    -- ── Basic counts ──
    'total_patients', (
      SELECT COUNT(*) FROM patients WHERE organization_id = ANY(v_org_ids)
    ),
    'active_doctors', (
      SELECT COUNT(*) FROM doctors WHERE organization_id = ANY(v_org_ids) AND is_active = true
    ),
    'active_offices', (
      SELECT COUNT(*) FROM offices WHERE organization_id = ANY(v_org_ids) AND is_active = true
    ),

    -- ── Appointment counts ──
    'today_appts', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids) AND appointment_date = p_today
    ),
    'this_month_appts', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_month_start AND appointment_date <= p_month_end
    ),
    'last_month_appts', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_last_month_start AND appointment_date <= p_last_month_end
    ),
    'completed_month', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_month_start AND appointment_date <= p_month_end
        AND status = 'completed'
    ),
    'cancelled_month', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_month_start AND appointment_date <= p_month_end
        AND status = 'cancelled'
    ),
    'no_shows', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_month_start AND appointment_date < p_today
        AND status IN ('scheduled', 'confirmed')
    ),

    -- ── New patients ──
    'new_patients_this_month', (
      SELECT COUNT(*) FROM patients
      WHERE organization_id = ANY(v_org_ids) AND created_at >= p_month_start::timestamp
    ),
    'new_patients_last_month', (
      SELECT COUNT(*) FROM patients
      WHERE organization_id = ANY(v_org_ids)
        AND created_at >= p_last_month_start::timestamp
        AND created_at < p_month_start::timestamp
    ),

    -- ── Revenue this month ──
    'revenue_this_month', (
      SELECT COALESCE(SUM(
        CASE WHEN price_snapshot IS NOT NULL AND price_snapshot > 0 THEN price_snapshot
             ELSE COALESCE(s.base_price, 0) END
      ), 0)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids)
        AND a.appointment_date >= p_month_start AND a.appointment_date <= p_month_end
        AND a.status = 'completed'
    ),
    'revenue_last_month', (
      SELECT COALESCE(SUM(
        CASE WHEN price_snapshot IS NOT NULL AND price_snapshot > 0 THEN price_snapshot
             ELSE COALESCE(s.base_price, 0) END
      ), 0)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids)
        AND a.appointment_date >= p_last_month_start AND a.appointment_date <= p_last_month_end
        AND a.status = 'completed'
    ),

    -- ── Revenue by period (week) ──
    'revenue_this_week', (
      SELECT COALESCE(SUM(
        CASE WHEN price_snapshot IS NOT NULL AND price_snapshot > 0 THEN price_snapshot
             ELSE COALESCE(s.base_price, 0) END
      ), 0)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids)
        AND a.appointment_date >= p_week_start AND a.appointment_date <= p_today
        AND a.status = 'completed'
    ),
    'revenue_prev_week', (
      SELECT COALESCE(SUM(
        CASE WHEN price_snapshot IS NOT NULL AND price_snapshot > 0 THEN price_snapshot
             ELSE COALESCE(s.base_price, 0) END
      ), 0)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids)
        AND a.appointment_date >= p_prev_week_start AND a.appointment_date <= p_prev_week_end
        AND a.status = 'completed'
    ),
    'revenue_today', (
      SELECT COALESCE(SUM(
        CASE WHEN price_snapshot IS NOT NULL AND price_snapshot > 0 THEN price_snapshot
             ELSE COALESCE(s.base_price, 0) END
      ), 0)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids)
        AND a.appointment_date = p_today
        AND a.status = 'completed'
    ),
    'revenue_yesterday', (
      SELECT COALESCE(SUM(
        CASE WHEN price_snapshot IS NOT NULL AND price_snapshot > 0 THEN price_snapshot
             ELSE COALESCE(s.base_price, 0) END
      ), 0)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids)
        AND a.appointment_date = p_yesterday
        AND a.status = 'completed'
    ),

    -- ── Week/Today appointment breakdowns ──
    'week_total', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_week_start AND appointment_date <= p_today
    ),
    'week_completed', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_week_start AND appointment_date <= p_today
        AND status = 'completed'
    ),
    'week_cancelled', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_week_start AND appointment_date <= p_today
        AND status = 'cancelled'
    ),
    'today_completed', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date = p_today AND status = 'completed'
    ),
    'today_cancelled', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date = p_today AND status = 'cancelled'
    ),

    -- ── Top treatments (this month, completed) ──
    'top_treatments', (
      SELECT COALESCE(json_agg(t ORDER BY t.count DESC), '[]'::json)
      FROM (
        SELECT
          COALESCE(s.name, 'Sin servicio') AS name,
          COUNT(*) AS count,
          SUM(CASE WHEN a.price_snapshot IS NOT NULL AND a.price_snapshot > 0
                   THEN a.price_snapshot ELSE COALESCE(s.base_price, 0) END)::numeric AS revenue
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.id
        WHERE a.organization_id = ANY(v_org_ids)
          AND a.appointment_date >= p_month_start AND a.appointment_date <= p_month_end
          AND a.status = 'completed'
        GROUP BY s.name
      ) t
    ),

    -- ── Upcoming appointments (next 3) ──
    'upcoming_appointments', (
      SELECT COALESCE(json_agg(ua ORDER BY ua.appointment_date, ua.start_time), '[]'::json)
      FROM (
        SELECT
          a.id, a.patient_name, a.appointment_date, a.start_time, a.end_time, a.status,
          json_build_object('full_name', d.full_name, 'color', d.color) AS doctors,
          json_build_object('name', o.name) AS offices,
          json_build_object('name', s.name) AS services
        FROM appointments a
        LEFT JOIN doctors d ON a.doctor_id = d.id
        LEFT JOIN offices o ON a.office_id = o.id
        LEFT JOIN services s ON a.service_id = s.id
        WHERE a.organization_id = ANY(v_org_ids)
          AND a.appointment_date >= p_today
          AND a.status IN ('scheduled', 'confirmed', 'completed')
        ORDER BY a.appointment_date ASC, a.start_time ASC
        LIMIT 3
      ) ua
    ),

    -- ── Heatmap data (last 90 days) ──
    'heatmap', (
      SELECT COALESCE(json_agg(h), '[]'::json)
      FROM (
        SELECT
          CASE EXTRACT(DOW FROM a.appointment_date::date)
            WHEN 0 THEN 6 ELSE EXTRACT(DOW FROM a.appointment_date::date)::int - 1
          END AS day,
          EXTRACT(HOUR FROM a.start_time::time)::int AS hour,
          COUNT(*) AS count
        FROM appointments a
        WHERE a.organization_id = ANY(v_org_ids)
          AND a.appointment_date >= (p_today - INTERVAL '89 days')::date
          AND a.appointment_date <= p_today
          AND EXTRACT(HOUR FROM a.start_time::time) BETWEEN 8 AND 20
        GROUP BY 1, 2
      ) h
    )
  ) INTO result;

  RETURN result;
END;
$$;
