-- Rollback 250: vuelve a la versión de la mig 244 de get_reports_overview
-- (sin pending_amount ni collected_breakdown; precio sin restar descuento).

CREATE OR REPLACE FUNCTION public.get_reports_overview(p_date_from date, p_date_to date)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result JSON;
BEGIN
  WITH range_appointments AS (
    SELECT
      a.appointment_date,
      a.start_time,
      a.status,
      COALESCE(d.full_name, 'Sin doctor')    AS doctor_name,
      COALESCE(d.color, '#9ca3af')           AS doctor_color,
      COALESCE(s.name, 'Sin servicio')       AS service_name,
      COALESCE(a.price_snapshot, s.base_price, 0) AS base_price,
      COALESCE(o.name, 'Sin consultorio')    AS office_name
    FROM appointments a
    LEFT JOIN doctors d  ON d.id = a.doctor_id
    LEFT JOIN services s ON s.id = a.service_id
    LEFT JOIN offices o  ON o.id = a.office_id
    WHERE a.organization_id IN (SELECT get_user_org_ids())
      AND a.appointment_date >= p_date_from
      AND a.appointment_date <= p_date_to
  )
  SELECT json_build_object(
    'totals', (
      SELECT json_build_object(
        'appointments', COUNT(*),
        'no_shows', COUNT(*) FILTER (
          WHERE appointment_date < (now() AT TIME ZONE 'utc')::date
            AND status IN ('scheduled', 'confirmed')
        ),
        'payments_amount', (
          SELECT COALESCE(SUM(amount), 0)
          FROM patient_payments
          WHERE organization_id IN (SELECT get_user_org_ids())
            AND payment_date >= p_date_from
            AND payment_date <= p_date_to
            AND treatment_id IS NULL
        ),
        'treatment_payments_amount', (
          SELECT COALESCE(SUM(amount), 0)
          FROM patient_payments
          WHERE organization_id IN (SELECT get_user_org_ids())
            AND payment_date >= p_date_from
            AND payment_date <= p_date_to
            AND treatment_id IS NOT NULL
            AND COALESCE(source, 'clinical') = 'clinical'
        )
      )
      FROM range_appointments
    ),
    'doctors', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', dd.name,
        'color', dd.color,
        'total', dd.total,
        'attended', dd.attended,
        'confirmed', dd.confirmed,
        'cancelled', dd.cancelled,
        'scheduled', dd.scheduled,
        'revenue', dd.revenue
      ) ORDER BY dd.revenue DESC, dd.first_date ASC, dd.name ASC), '[]'::json)
      FROM (
        SELECT
          doctor_name AS name,
          (array_agg(doctor_color ORDER BY appointment_date, start_time))[1] AS color,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'completed') AS attended,
          COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
          COUNT(*) FILTER (WHERE status NOT IN ('completed', 'confirmed', 'cancelled')) AS scheduled,
          COALESCE(SUM(base_price) FILTER (WHERE status IN ('completed', 'confirmed')), 0) AS revenue,
          MIN(appointment_date) AS first_date
        FROM range_appointments
        GROUP BY doctor_name
      ) dd
    ),
    'services', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', sv.name,
        'count', sv.count,
        'revenue', sv.revenue
      ) ORDER BY sv.count DESC, sv.first_date ASC, sv.name ASC), '[]'::json)
      FROM (
        SELECT
          service_name AS name,
          COUNT(*) AS count,
          COALESCE(SUM(base_price) FILTER (WHERE status = 'completed'), 0) AS revenue,
          MIN(appointment_date) AS first_date
        FROM range_appointments
        WHERE status <> 'cancelled'
        GROUP BY service_name
      ) sv
    ),
    'offices', (
      SELECT COALESCE(json_agg(json_build_object(
        'name', oc.name,
        'total', oc.total,
        'completed', oc.completed
      ) ORDER BY oc.total DESC, oc.first_date ASC, oc.name ASC), '[]'::json)
      FROM (
        SELECT
          office_name AS name,
          COUNT(*) FILTER (WHERE status <> 'cancelled') AS total,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          MIN(appointment_date) AS first_date
        FROM range_appointments
        GROUP BY office_name
      ) oc
    ),
    'daily', (
      SELECT COALESCE(json_agg(json_build_object(
        'date', dl.date,
        'scheduled', dl.scheduled,
        'completed', dl.completed,
        'cancelled', dl.cancelled
      ) ORDER BY dl.date ASC), '[]'::json)
      FROM (
        SELECT
          appointment_date AS date,
          COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled')) AS scheduled,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
        FROM range_appointments
        GROUP BY appointment_date
      ) dl
    ),
    'peak_hours', (
      SELECT COALESCE(json_agg(json_build_object(
        'hour', ph.hour,
        'count', ph.count
      ) ORDER BY ph.hour ASC), '[]'::json)
      FROM (
        SELECT
          EXTRACT(HOUR FROM start_time)::int AS hour,
          COUNT(*) AS count
        FROM range_appointments
        WHERE status <> 'cancelled'
        GROUP BY EXTRACT(HOUR FROM start_time)::int
      ) ph
    )
  ) INTO result
  FROM (SELECT 1) one;

  RETURN result;
END;
$function$;
