-- =============================================
-- Migration 044: Patient Retention RPCs
-- Provides server-side functions for retention
-- metrics: returning vs new patients, visit
-- frequency, at-risk patients, and LTV.
-- =============================================

-- 1) Returning vs New patients in a date range
--    A patient is "new" if their first-ever completed appointment falls in the range.
--    A patient is "returning" if they had a completed appointment before the range.
CREATE OR REPLACE FUNCTION get_retention_overview(
  p_date_from DATE,
  p_date_to DATE
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  WITH patient_first_visit AS (
    SELECT
      patient_id,
      MIN(appointment_date) AS first_visit
    FROM appointments
    WHERE status IN ('completed', 'confirmed')
      AND patient_id IS NOT NULL
      AND organization_id IN (SELECT get_user_org_ids())
    GROUP BY patient_id
  ),
  period_patients AS (
    SELECT DISTINCT a.patient_id
    FROM appointments a
    WHERE a.status IN ('completed', 'confirmed')
      AND a.appointment_date BETWEEN p_date_from AND p_date_to
      AND a.patient_id IS NOT NULL
      AND a.organization_id IN (SELECT get_user_org_ids())
  ),
  classified AS (
    SELECT
      pp.patient_id,
      CASE
        WHEN pfv.first_visit >= p_date_from AND pfv.first_visit <= p_date_to THEN 'new'
        ELSE 'returning'
      END AS patient_type
    FROM period_patients pp
    JOIN patient_first_visit pfv ON pfv.patient_id = pp.patient_id
  )
  SELECT json_build_object(
    'total_patients', (SELECT COUNT(*) FROM classified),
    'new_patients', (SELECT COUNT(*) FROM classified WHERE patient_type = 'new'),
    'returning_patients', (SELECT COUNT(*) FROM classified WHERE patient_type = 'returning'),
    'retention_rate', CASE
      WHEN (SELECT COUNT(*) FROM classified) > 0
      THEN ROUND((SELECT COUNT(*) FROM classified WHERE patient_type = 'returning')::NUMERIC / (SELECT COUNT(*) FROM classified) * 100, 1)
      ELSE 0
    END
  ) INTO result;

  RETURN result;
END;
$$;

-- 2) Average visit frequency (avg days between visits per patient)
CREATE OR REPLACE FUNCTION get_visit_frequency(
  p_date_from DATE,
  p_date_to DATE
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  WITH patient_visits AS (
    SELECT
      patient_id,
      appointment_date,
      LAG(appointment_date) OVER (PARTITION BY patient_id ORDER BY appointment_date) AS prev_date
    FROM appointments
    WHERE status IN ('completed', 'confirmed')
      AND patient_id IS NOT NULL
      AND appointment_date BETWEEN p_date_from AND p_date_to
      AND organization_id IN (SELECT get_user_org_ids())
  ),
  gaps AS (
    SELECT
      patient_id,
      (appointment_date - prev_date) AS days_between
    FROM patient_visits
    WHERE prev_date IS NOT NULL
  )
  SELECT json_build_object(
    'avg_days_between_visits', COALESCE(ROUND(AVG(days_between)::NUMERIC, 1), 0),
    'median_days_between_visits', COALESCE(
      ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_between))::NUMERIC, 1),
      0
    ),
    'patients_with_multiple_visits', (SELECT COUNT(DISTINCT patient_id) FROM gaps)
  ) INTO result;

  RETURN result;
END;
$$;

-- 3) At-risk patients (haven't visited in X months)
CREATE OR REPLACE FUNCTION get_at_risk_patients(
  p_months_threshold INT DEFAULT 3
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  WITH last_visits AS (
    SELECT
      a.patient_id,
      p.first_name,
      p.last_name,
      p.phone,
      p.email,
      MAX(a.appointment_date) AS last_visit,
      COUNT(a.id) AS total_visits
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.status IN ('completed', 'confirmed')
      AND a.patient_id IS NOT NULL
      AND a.organization_id IN (SELECT get_user_org_ids())
      AND p.status = 'active'
    GROUP BY a.patient_id, p.first_name, p.last_name, p.phone, p.email
  )
  SELECT json_build_object(
    'total_at_risk', (
      SELECT COUNT(*)
      FROM last_visits
      WHERE last_visit < CURRENT_DATE - (p_months_threshold || ' months')::INTERVAL
    ),
    'patients', (
      SELECT COALESCE(json_agg(row_to_json(sub.*)), '[]'::JSON)
      FROM (
        SELECT
          patient_id,
          first_name,
          last_name,
          phone,
          email,
          last_visit,
          total_visits,
          (CURRENT_DATE - last_visit) AS days_since_last_visit
        FROM last_visits
        WHERE last_visit < CURRENT_DATE - (p_months_threshold || ' months')::INTERVAL
        ORDER BY last_visit ASC
        LIMIT 50
      ) sub
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- 4) Patient LTV (lifetime value) — top patients by revenue
CREATE OR REPLACE FUNCTION get_patient_ltv(
  p_limit INT DEFAULT 20
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  WITH patient_revenue AS (
    SELECT
      a.patient_id,
      p.first_name,
      p.last_name,
      COUNT(a.id) AS total_visits,
      SUM(COALESCE(s.base_price, 0)) AS total_revenue,
      MIN(a.appointment_date) AS first_visit,
      MAX(a.appointment_date) AS last_visit
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    LEFT JOIN services s ON s.id = a.service_id
    WHERE a.status IN ('completed', 'confirmed')
      AND a.patient_id IS NOT NULL
      AND a.organization_id IN (SELECT get_user_org_ids())
    GROUP BY a.patient_id, p.first_name, p.last_name
  )
  SELECT json_build_object(
    'avg_ltv', (SELECT COALESCE(ROUND(AVG(total_revenue)::NUMERIC, 2), 0) FROM patient_revenue),
    'total_lifetime_revenue', (SELECT COALESCE(ROUND(SUM(total_revenue)::NUMERIC, 2), 0) FROM patient_revenue),
    'top_patients', (
      SELECT COALESCE(json_agg(row_to_json(sub.*)), '[]'::JSON)
      FROM (
        SELECT
          patient_id,
          first_name,
          last_name,
          total_visits,
          ROUND(total_revenue::NUMERIC, 2) AS total_revenue,
          first_visit,
          last_visit,
          ROUND((total_revenue / NULLIF(total_visits, 0))::NUMERIC, 2) AS avg_per_visit
        FROM patient_revenue
        ORDER BY total_revenue DESC
        LIMIT p_limit
      ) sub
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- 5) Monthly retention cohort (for trend chart)
CREATE OR REPLACE FUNCTION get_retention_trend(
  p_months INT DEFAULT 6
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  WITH monthly_data AS (
    SELECT
      date_trunc('month', a.appointment_date)::DATE AS month,
      COUNT(DISTINCT a.patient_id) AS total_patients,
      COUNT(DISTINCT CASE
        WHEN a.patient_id IN (
          SELECT patient_id FROM appointments a2
          WHERE a2.status IN ('completed', 'confirmed')
            AND a2.appointment_date < date_trunc('month', a.appointment_date)
            AND a2.organization_id IN (SELECT get_user_org_ids())
        ) THEN a.patient_id
      END) AS returning_patients
    FROM appointments a
    WHERE a.status IN ('completed', 'confirmed')
      AND a.patient_id IS NOT NULL
      AND a.appointment_date >= (CURRENT_DATE - (p_months || ' months')::INTERVAL)
      AND a.organization_id IN (SELECT get_user_org_ids())
    GROUP BY date_trunc('month', a.appointment_date)
    ORDER BY month
  )
  SELECT COALESCE(json_agg(json_build_object(
    'month', to_char(month, 'YYYY-MM'),
    'total_patients', total_patients,
    'returning_patients', returning_patients,
    'new_patients', total_patients - returning_patients,
    'retention_rate', CASE
      WHEN total_patients > 0
      THEN ROUND(returning_patients::NUMERIC / total_patients * 100, 1)
      ELSE 0
    END
  )), '[]'::JSON) INTO result
  FROM monthly_data;

  RETURN result;
END;
$$;
