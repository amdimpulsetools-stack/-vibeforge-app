-- ═══════════════════════════════════════════════════════════════════
-- AI Report Summaries — Monthly rate-limited usage tracking + metrics RPC
-- ═══════════════════════════════════════════════════════════════════

-- Track AI report generation usage per organization per month
CREATE TABLE IF NOT EXISTS ai_report_usage (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type   text NOT NULL DEFAULT 'general',   -- financial, marketing, operational, retention, general
  date_from     date NOT NULL,
  date_to       date NOT NULL,
  tokens_used   int DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_ai_report_usage_org_month
  ON ai_report_usage (organization_id, created_at);

ALTER TABLE ai_report_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view AI report usage"
  ON ai_report_usage FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Org members can insert AI report usage"
  ON ai_report_usage FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

-- ═══════════════════════════════════════════════════════════════════
-- RPC: Count AI reports generated this month for an organization
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_ai_report_usage_this_month(org_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(COUNT(*)::int, 0)
  FROM ai_report_usage
  WHERE organization_id = org_id
    AND created_at >= date_trunc('month', now())
    AND created_at < date_trunc('month', now()) + interval '1 month';
$$;

-- ═══════════════════════════════════════════════════════════════════
-- RPC: Get consolidated report metrics for AI summary generation
-- Returns a single JSON object with all KPIs for the given period
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_report_metrics_for_ai(
  org_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  period_days int;
  prev_from date;
  prev_to date;
BEGIN
  period_days := (p_date_to - p_date_from) + 1;
  prev_from := p_date_from - period_days;
  prev_to := p_date_from - 1;

  SELECT jsonb_build_object(
    'period', jsonb_build_object(
      'from', p_date_from,
      'to', p_date_to,
      'days', period_days
    ),

    -- ── Appointment metrics (current period) ──
    'appointments', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'completed', COUNT(*) FILTER (WHERE status = 'completed'),
        'cancelled', COUNT(*) FILTER (WHERE status = 'cancelled'),
        'confirmed', COUNT(*) FILTER (WHERE status = 'confirmed'),
        'scheduled', COUNT(*) FILTER (WHERE status = 'scheduled'),
        'no_shows', COUNT(*) FILTER (WHERE status IN ('scheduled', 'confirmed') AND appointment_date < CURRENT_DATE),
        'cancel_rate_pct', CASE WHEN COUNT(*) > 0
          THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'cancelled') / COUNT(*), 1)
          ELSE 0 END,
        'completion_rate_pct', CASE WHEN COUNT(*) > 0
          THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 1)
          ELSE 0 END
      )
      FROM appointments
      WHERE organization_id = org_id
        AND appointment_date BETWEEN p_date_from AND p_date_to
    ),

    -- ── Appointment metrics (previous period for comparison) ──
    'appointments_prev', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'completed', COUNT(*) FILTER (WHERE status = 'completed'),
        'cancelled', COUNT(*) FILTER (WHERE status = 'cancelled'),
        'cancel_rate_pct', CASE WHEN COUNT(*) > 0
          THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'cancelled') / COUNT(*), 1)
          ELSE 0 END,
        'completion_rate_pct', CASE WHEN COUNT(*) > 0
          THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 1)
          ELSE 0 END
      )
      FROM appointments
      WHERE organization_id = org_id
        AND appointment_date BETWEEN prev_from AND prev_to
    ),

    -- ── Revenue metrics (current period) ──
    'revenue', (
      SELECT jsonb_build_object(
        'total_billed', COALESCE(SUM(s.base_price) FILTER (WHERE a.status IN ('completed', 'confirmed')), 0),
        'total_collected', (
          SELECT COALESCE(SUM(amount), 0)
          FROM patient_payments
          WHERE organization_id = org_id
            AND payment_date BETWEEN p_date_from AND p_date_to
        ),
        'avg_per_appointment', CASE
          WHEN COUNT(*) FILTER (WHERE a.status IN ('completed', 'confirmed')) > 0
          THEN ROUND(COALESCE(SUM(s.base_price) FILTER (WHERE a.status IN ('completed', 'confirmed')), 0)
               / COUNT(*) FILTER (WHERE a.status IN ('completed', 'confirmed')), 2)
          ELSE 0 END
      )
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = org_id
        AND a.appointment_date BETWEEN p_date_from AND p_date_to
    ),

    -- ── Revenue (previous period) ──
    'revenue_prev', (
      SELECT jsonb_build_object(
        'total_billed', COALESCE(SUM(s.base_price) FILTER (WHERE a.status IN ('completed', 'confirmed')), 0),
        'total_collected', (
          SELECT COALESCE(SUM(amount), 0)
          FROM patient_payments
          WHERE organization_id = org_id
            AND payment_date BETWEEN prev_from AND prev_to
        )
      )
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = org_id
        AND a.appointment_date BETWEEN prev_from AND prev_to
    ),

    -- ── Top doctors (current period) ──
    'top_doctors', (
      SELECT COALESCE(jsonb_agg(doc ORDER BY doc->>'revenue' DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'name', d.full_name,
          'total_appointments', COUNT(*),
          'completed', COUNT(*) FILTER (WHERE a.status = 'completed'),
          'cancelled', COUNT(*) FILTER (WHERE a.status = 'cancelled'),
          'completion_rate_pct', CASE WHEN COUNT(*) > 0
            THEN ROUND(100.0 * COUNT(*) FILTER (WHERE a.status = 'completed') / COUNT(*), 1)
            ELSE 0 END,
          'revenue', COALESCE(SUM(s.base_price) FILTER (WHERE a.status IN ('completed', 'confirmed')), 0)
        ) AS doc
        FROM appointments a
        JOIN doctors d ON a.doctor_id = d.id
        LEFT JOIN services s ON a.service_id = s.id
        WHERE a.organization_id = org_id
          AND a.appointment_date BETWEEN p_date_from AND p_date_to
        GROUP BY d.id, d.full_name
      ) sub
    ),

    -- ── Top services (current period) ──
    'top_services', (
      SELECT COALESCE(jsonb_agg(svc ORDER BY svc->>'count' DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'name', s.name,
          'count', COUNT(*),
          'revenue', COALESCE(SUM(s.base_price) FILTER (WHERE a.status IN ('completed', 'confirmed')), 0)
        ) AS svc
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        WHERE a.organization_id = org_id
          AND a.appointment_date BETWEEN p_date_from AND p_date_to
        GROUP BY s.id, s.name
        ORDER BY COUNT(*) DESC
        LIMIT 10
      ) sub
    ),

    -- ── Patient metrics ──
    'patients', (
      SELECT jsonb_build_object(
        'new_this_period', COUNT(*),
        'new_prev_period', (
          SELECT COUNT(*) FROM patients
          WHERE organization_id = org_id
            AND created_at::date BETWEEN prev_from AND prev_to
        ),
        'total_active', (
          SELECT COUNT(*) FROM patients
          WHERE organization_id = org_id AND status = 'active'
        )
      )
      FROM patients
      WHERE organization_id = org_id
        AND created_at::date BETWEEN p_date_from AND p_date_to
    ),

    -- ── Origin distribution (marketing) ──
    'origins', (
      SELECT COALESCE(jsonb_agg(orig ORDER BY orig->>'count' DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'origin', COALESCE(origin, 'Sin origen'),
          'count', COUNT(*)
        ) AS orig
        FROM appointments
        WHERE organization_id = org_id
          AND appointment_date BETWEEN p_date_from AND p_date_to
        GROUP BY origin
        ORDER BY COUNT(*) DESC
        LIMIT 10
      ) sub
    ),

    -- ── Peak hours ──
    'peak_hours', (
      SELECT COALESCE(jsonb_agg(ph ORDER BY ph->>'count' DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'hour', EXTRACT(HOUR FROM start_time::time),
          'count', COUNT(*)
        ) AS ph
        FROM appointments
        WHERE organization_id = org_id
          AND appointment_date BETWEEN p_date_from AND p_date_to
        GROUP BY EXTRACT(HOUR FROM start_time::time)
        ORDER BY COUNT(*) DESC
        LIMIT 5
      ) sub
    ),

    -- ── Day of week distribution ──
    'day_of_week', (
      SELECT COALESCE(jsonb_agg(dow ORDER BY dow->>'dow' ASC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'dow', EXTRACT(DOW FROM appointment_date),
          'day_name', TO_CHAR(appointment_date, 'Day'),
          'count', COUNT(*)
        ) AS dow
        FROM appointments
        WHERE organization_id = org_id
          AND appointment_date BETWEEN p_date_from AND p_date_to
        GROUP BY EXTRACT(DOW FROM appointment_date), TO_CHAR(appointment_date, 'Day')
      ) sub
    )

  ) INTO result;

  RETURN result;
END;
$$;
