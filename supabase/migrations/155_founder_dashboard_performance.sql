-- ============================================================
-- 155: Founder dashboard performance — aggregate RPCs + indices
--
-- The founder /stats routes were ".select('id') + .length" and
-- ".select('amount') + reduce()" patterns — fetching every row
-- just to count or sum. On 100k+ payment rows this was 5MB+
-- per request. Push aggregation into Postgres.
-- ============================================================

-- Multi-window revenue aggregate. Returns total + current month
-- + previous month in a single round trip. Used by the founder
-- platform overview (/api/founder/stats).
CREATE OR REPLACE FUNCTION public.founder_revenue_summary(
  p_current_month_start timestamptz,
  p_prev_month_start    timestamptz,
  p_prev_month_end      timestamptz
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'total_revenue', (
      SELECT COALESCE(SUM(amount), 0) FROM patient_payments
    ),
    'current_month_revenue', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE created_at >= p_current_month_start
    ),
    'prev_month_revenue', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE created_at >= p_prev_month_start
        AND created_at <  p_prev_month_end
    )
  );
$$;

REVOKE ALL ON FUNCTION public.founder_revenue_summary(timestamptz, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founder_revenue_summary(timestamptz, timestamptz, timestamptz) TO service_role;

-- Compact aggregate for /api/founder/stats/revenue. Returns total
-- + current month (uses payment_date not created_at because that's
-- the field this page filters on).
CREATE OR REPLACE FUNCTION public.founder_revenue_compact(
  p_current_month_start timestamptz
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'total_revenue', (
      SELECT COALESCE(SUM(amount), 0) FROM patient_payments
    ),
    'monthly_revenue', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE payment_date >= p_current_month_start::date
    )
  );
$$;

REVOKE ALL ON FUNCTION public.founder_revenue_compact(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founder_revenue_compact(timestamptz) TO service_role;

-- Indices for date-range scans the founder dashboard runs WITHOUT
-- per-org filtering. The existing composite indices on
-- (organization_id, created_at) aren't used when org isn't in the
-- WHERE clause.
CREATE INDEX IF NOT EXISTS idx_ai_query_usage_created_at_desc
  ON public.ai_query_usage(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_payments_created_at_desc
  ON public.patient_payments(created_at DESC);
