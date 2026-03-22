-- Add revenue goal to organizations + redesign admin dashboard RPC
-- Adds: pending debt, debtor count, receptionist performance,
--        recurring patients, real no_show status, occupancy from offices

-- 1. Revenue goal column on organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS monthly_revenue_goal NUMERIC DEFAULT 0;

-- 2. Replace dashboard RPC with expanded metrics
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

    -- ── Appointment counts (month) ──
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
    -- Real no_show status (not inferred from scheduled/confirmed)
    'no_shows_month', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_month_start AND appointment_date <= p_month_end
        AND status = 'no_show'
    ),
    'no_shows_last_month', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_last_month_start AND appointment_date <= p_last_month_end
        AND status = 'no_show'
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

    -- ── Recurring patients (>1 completed appointment this month) ──
    'recurring_patients_month', (
      SELECT COUNT(*) FROM (
        SELECT patient_id FROM appointments
        WHERE organization_id = ANY(v_org_ids)
          AND appointment_date >= p_month_start AND appointment_date <= p_month_end
          AND status IN ('completed', 'confirmed', 'scheduled')
          AND patient_id IS NOT NULL
        GROUP BY patient_id
        HAVING COUNT(*) > 1
      ) sub
    ),
    'recurring_patients_last_month', (
      SELECT COUNT(*) FROM (
        SELECT patient_id FROM appointments
        WHERE organization_id = ANY(v_org_ids)
          AND appointment_date >= p_last_month_start AND appointment_date <= p_last_month_end
          AND status IN ('completed', 'confirmed', 'scheduled')
          AND patient_id IS NOT NULL
        GROUP BY patient_id
        HAVING COUNT(*) > 1
      ) sub
    ),

    -- ── Revenue (month) ──
    'revenue_this_month', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE organization_id = ANY(v_org_ids)
        AND payment_date >= p_month_start AND payment_date <= p_month_end
    ),
    'revenue_last_month', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE organization_id = ANY(v_org_ids)
        AND payment_date >= p_last_month_start AND payment_date <= p_last_month_end
    ),

    -- ── Revenue (week) ──
    'revenue_this_week', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE organization_id = ANY(v_org_ids)
        AND payment_date >= p_week_start AND payment_date <= p_today
    ),
    'revenue_prev_week', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE organization_id = ANY(v_org_ids)
        AND payment_date >= p_prev_week_start AND payment_date <= p_prev_week_end
    ),

    -- ── Revenue (today / yesterday) ──
    'revenue_today', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE organization_id = ANY(v_org_ids) AND payment_date = p_today
    ),
    'revenue_yesterday', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE organization_id = ANY(v_org_ids) AND payment_date = p_yesterday
    ),

    -- ── Pending debt (all time: billed - paid) ──
    'pending_debt', (
      SELECT COALESCE(SUM(
        CASE WHEN a.price_snapshot IS NOT NULL AND a.price_snapshot > 0 THEN a.price_snapshot
             ELSE COALESCE(s.base_price, 0) END
      ), 0) - COALESCE((
        SELECT SUM(pp.amount) FROM patient_payments pp
        WHERE pp.organization_id = ANY(v_org_ids)
      ), 0)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids) AND a.status != 'cancelled'
    ),

    -- ── Debtor count (patients with pending balance) ──
    'debtor_count', (
      SELECT COUNT(*) FROM (
        SELECT a.patient_id,
          SUM(CASE WHEN a.price_snapshot IS NOT NULL AND a.price_snapshot > 0
                   THEN a.price_snapshot ELSE COALESCE(s.base_price, 0) END) AS billed,
          COALESCE((
            SELECT SUM(pp.amount) FROM patient_payments pp
            WHERE pp.patient_id = a.patient_id
          ), 0) AS paid
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.id
        WHERE a.organization_id = ANY(v_org_ids)
          AND a.status != 'cancelled'
          AND a.patient_id IS NOT NULL
        GROUP BY a.patient_id
        HAVING SUM(CASE WHEN a.price_snapshot IS NOT NULL AND a.price_snapshot > 0
                        THEN a.price_snapshot ELSE COALESCE(s.base_price, 0) END)
               > COALESCE((
                   SELECT SUM(pp.amount) FROM patient_payments pp
                   WHERE pp.patient_id = a.patient_id
                 ), 0)
      ) debtors
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
    'week_no_shows', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_week_start AND appointment_date <= p_today
        AND status = 'no_show'
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
    'today_no_shows', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date = p_today AND status = 'no_show'
    ),

    -- ── Receptionist performance (completed appointments by responsible) ──
    'receptionist_performance', (
      SELECT COALESCE(json_agg(rp ORDER BY rp.completed DESC), '[]'::json)
      FROM (
        SELECT
          a.responsible AS name,
          COUNT(*) FILTER (WHERE a.status = 'completed') AS completed,
          COUNT(*) AS total
        FROM appointments a
        WHERE a.organization_id = ANY(v_org_ids)
          AND a.appointment_date >= p_month_start AND a.appointment_date <= p_month_end
          AND a.responsible IS NOT NULL AND a.responsible != ''
        GROUP BY a.responsible
      ) rp
    ),

    -- ── Top treatments (this month, completed) — expanded to 5 ──
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
        LIMIT 5
      ) t
    ),

    -- ── Occupancy: slots from active offices × schedule hours ──
    'occupancy_data', (
      SELECT json_build_object(
        'active_offices', (
          SELECT COUNT(*) FROM offices WHERE organization_id = ANY(v_org_ids) AND is_active = true
        ),
        'schedule_blocks_month', (
          SELECT COUNT(*) FROM schedule_blocks
          WHERE organization_id = ANY(v_org_ids)
            AND block_date >= p_month_start AND block_date <= p_month_end
        )
      )
    ),

    -- ── Revenue goal ──
    'monthly_revenue_goal', (
      SELECT COALESCE(monthly_revenue_goal, 0)
      FROM organizations
      WHERE id = ANY(v_org_ids)
      LIMIT 1
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
    ),

    -- ── Upcoming appointments (next 5) ──
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
          AND a.status IN ('scheduled', 'confirmed')
        ORDER BY a.appointment_date ASC, a.start_time ASC
        LIMIT 5
      ) ua
    )
  ) INTO result;

  RETURN result;
END;
$$;
