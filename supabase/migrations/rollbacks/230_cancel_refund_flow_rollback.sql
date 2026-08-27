-- Rollback de la mig 230 (cancelación con devolución):
--   1. Elimina el RPC appointment_cancel_refund (las devoluciones ya
--      registradas en cash_movements y las notas en citas NO se tocan —
--      son historia contable).
--   2. Restaura get_admin_dashboard_stats_v3 VERBATIM de la mig 200
--      (ingresos brutos, sin netear devoluciones).

DROP FUNCTION IF EXISTS appointment_cancel_refund(UUID, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION get_admin_dashboard_stats_v3(
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
SET search_path = public, pg_temp
AS $$
DECLARE
  result JSON;
  v_org_ids UUID[];
BEGIN
  v_org_ids := ARRAY(SELECT get_user_org_ids());

  SELECT json_build_object(
    -- ── Conteos básicos ──
    'active_doctors', (
      SELECT COUNT(*) FROM doctors WHERE organization_id = ANY(v_org_ids) AND is_active = true
    ),

    -- ── Citas (mes) ──
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
    'no_shows_month', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_month_start AND appointment_date <= p_month_end
        AND status = 'no_show'
    ),

    -- ── Pacientes nuevos ──
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

    -- ── Pacientes recurrentes (>1 cita en el mes) ──
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

    -- ── Ingresos (mes) ──
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

    -- ── Ingresos (semana) ──
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

    -- ── Ingresos (hoy / ayer) ──
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

    -- ── Deuda pendiente (mes) ──
    'pending_debt_month', (
      SELECT COALESCE(SUM(GREATEST(0,
        COALESCE(a.price_snapshot, COALESCE(s.base_price, 0))
        - COALESCE((SELECT SUM(pp.amount) FROM patient_payments pp WHERE pp.appointment_id = a.id), 0)
      )), 0)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids) AND a.status != 'cancelled'
        AND a.appointment_date >= p_month_start AND a.appointment_date <= p_month_end
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0)) > 0
    ),
    'debtor_count_month', (
      SELECT COUNT(DISTINCT a.patient_id)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids) AND a.status != 'cancelled'
        AND a.appointment_date >= p_month_start AND a.appointment_date <= p_month_end
        AND a.patient_id IS NOT NULL
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0)) > 0
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0))
            > COALESCE((SELECT SUM(pp.amount) FROM patient_payments pp WHERE pp.appointment_id = a.id), 0)
    ),

    -- ── Deuda pendiente (semana) ──
    'pending_debt_week', (
      SELECT COALESCE(SUM(GREATEST(0,
        COALESCE(a.price_snapshot, COALESCE(s.base_price, 0))
        - COALESCE((SELECT SUM(pp.amount) FROM patient_payments pp WHERE pp.appointment_id = a.id), 0)
      )), 0)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids) AND a.status != 'cancelled'
        AND a.appointment_date >= p_week_start AND a.appointment_date <= p_today
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0)) > 0
    ),
    'debtor_count_week', (
      SELECT COUNT(DISTINCT a.patient_id)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids) AND a.status != 'cancelled'
        AND a.appointment_date >= p_week_start AND a.appointment_date <= p_today
        AND a.patient_id IS NOT NULL
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0)) > 0
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0))
            > COALESCE((SELECT SUM(pp.amount) FROM patient_payments pp WHERE pp.appointment_id = a.id), 0)
    ),

    -- ── Deuda pendiente (hoy) ──
    'pending_debt_today', (
      SELECT COALESCE(SUM(GREATEST(0,
        COALESCE(a.price_snapshot, COALESCE(s.base_price, 0))
        - COALESCE((SELECT SUM(pp.amount) FROM patient_payments pp WHERE pp.appointment_id = a.id), 0)
      )), 0)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids) AND a.status != 'cancelled'
        AND a.appointment_date = p_today
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0)) > 0
    ),
    'debtor_count_today', (
      SELECT COUNT(DISTINCT a.patient_id)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids) AND a.status != 'cancelled'
        AND a.appointment_date = p_today
        AND a.patient_id IS NOT NULL
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0)) > 0
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0))
            > COALESCE((SELECT SUM(pp.amount) FROM patient_payments pp WHERE pp.appointment_id = a.id), 0)
    ),

    -- ── Desgloses semana / hoy ──
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

    -- ── Performance de recepcionistas (mes) ──
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

    -- ── Meta de ingresos ──
    'monthly_revenue_goal', (
      SELECT COALESCE(monthly_revenue_goal, 0)
      FROM organizations
      WHERE id = ANY(v_org_ids)
      LIMIT 1
    ),

    -- ── NUEVO: serie diaria de citas (últimos 30 días, sin canceladas) ──
    -- Reemplaza el select("appointment_date") sin agregación de page.tsx:
    -- mismos filtros (>= hoy-29, <= hoy, status != 'cancelled'), agregado
    -- por día. Solo se devuelven los días con citas; el cliente rellena los
    -- vacíos con 0 igual que hacía con el Map.
    'daily_series', (
      SELECT COALESCE(json_agg(json_build_object(
        'date', ds.date,
        'count', ds.count
      ) ORDER BY ds.date ASC), '[]'::json)
      FROM (
        SELECT appointment_date AS date, COUNT(*) AS count
        FROM appointments
        WHERE organization_id = ANY(v_org_ids)
          AND appointment_date >= (p_today - INTERVAL '29 days')::date
          AND appointment_date <= p_today
          AND status != 'cancelled'
        GROUP BY appointment_date
      ) ds
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION get_admin_dashboard_stats_v3(DATE, DATE, DATE, DATE, DATE, DATE, DATE, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_admin_dashboard_stats_v3(DATE, DATE, DATE, DATE, DATE, DATE, DATE, DATE, DATE) TO authenticated;
