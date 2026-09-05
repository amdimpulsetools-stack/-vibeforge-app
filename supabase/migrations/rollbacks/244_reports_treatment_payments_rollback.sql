-- Rollback de la mig 244: restaura get_reports_overview de la 231 verbatim.

CREATE OR REPLACE FUNCTION get_reports_overview(
  p_date_from DATE,
  p_date_to DATE
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  result JSON;
BEGIN
  WITH range_appointments AS (
    -- Una sola pasada sobre las citas del rango; los bloques de abajo
    -- reutilizan este CTE (Postgres lo materializa una vez al haber
    -- múltiples referencias).
    SELECT
      a.appointment_date,
      a.start_time,
      a.status,
      COALESCE(d.full_name, 'Sin doctor')    AS doctor_name,
      COALESCE(d.color, '#9ca3af')           AS doctor_color,
      COALESCE(s.name, 'Sin servicio')       AS service_name,
      -- 231: precio ACORDADO de la cita con fallback al catálogo — misma
      -- fórmula que el dashboard (mig 200: COALESCE(price_snapshot,
      -- base_price)). Antes /reports usaba solo s.base_price: una cita con
      -- descuento o precio pactado distinto hacía que "Pendiente cobro" y
      -- los ingresos por doctor difirieran entre las dos pantallas.
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
        -- Mismo "hoy" que usaba el cliente: new Date().toISOString() es UTC.
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
        )
      )
      FROM range_appointments
    ),

    -- ── Financiero: productividad por doctor ──
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
          -- Color de la primera cita del doctor en orden cronológico —
          -- equivalente al "primer visto" del Map del cliente (que recibía
          -- las filas ordenadas por appointment_date).
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

    -- ── Operativo: top servicios (sin canceladas; revenue solo completed) ──
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

    -- ── Operativo: ocupación por consultorio (agrupa sobre TODAS las citas;
    --    total excluye canceladas, igual que el cliente) ──
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

    -- ── Operativo: tendencia diaria ──
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

    -- ── Operativo: citas por hora (sin canceladas). El cliente conserva sus
    --    buckets fijos 08:00-19:00 y descarta el resto, como hacía antes. ──
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
$$;


REVOKE ALL ON FUNCTION get_reports_overview(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_reports_overview(DATE, DATE) TO authenticated;
