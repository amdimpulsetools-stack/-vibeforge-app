-- 251: /reports — "Facturado por citas" = lo COBRADO sobre las citas del rango
--
-- Decisión del founder con la clínica de Patricia (7-sep-2026): la tarjeta
-- "Total facturado" (precio de las citas atendidas, S/ 750 ese día) no la
-- lee nadie; la doctora quiere ver cuánto entró por atenciones (S/ 2 050).
-- Ese número ya existía como la línea "Citas del periodo" del desglose de
-- la mig 250; ahora pasa a ser la tarjeta principal y, para que la pantalla
-- entera diga lo mismo, la productividad por doctor también lo usa.
--
-- Cambios (aditivos):
--   range_appointments.collected_in_range
--     Σ cobros clínicos (no farmacia, no tratamiento) de ESA cita con fecha
--     de pago dentro del rango. Mismo criterio que la cubeta
--     collected_breakdown.period_appointments, así Σ doctors[].collected ==
--     period_appointments siempre.
--   doctors[].collected
--     Σ collected_in_range de las citas del doctor en el rango. Se conserva
--     doctors[].revenue (precio de las citas) para el que lo necesite.

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
    -- Una sola pasada sobre las citas del rango; los bloques de abajo
    -- reutilizan este CTE (Postgres lo materializa una vez al haber
    -- múltiples referencias).
    SELECT
      a.id                                   AS appointment_id,
      a.appointment_date,
      a.start_time,
      a.status,
      COALESCE(d.full_name, 'Sin doctor')    AS doctor_name,
      COALESCE(d.color, '#9ca3af')           AS doctor_color,
      COALESCE(s.name, 'Sin servicio')       AS service_name,
      -- Precio REAL de la cita (fórmula canónica mig 100 / 219): precio
      -- acordado con fallback al catálogo, menos descuento, nunca negativo.
      GREATEST(
        0,
        COALESCE(a.price_snapshot, s.base_price, 0) - COALESCE(a.discount_amount, 0)
      )                                      AS base_price,
      COALESCE(o.name, 'Sin consultorio')    AS office_name,
      -- Mig 251: cobrado sobre ESTA cita dentro del rango (clínico, sin
      -- farmacia ni tratamientos). Mismo criterio que la cubeta
      -- period_appointments de collected_breakdown.
      COALESCE((
        SELECT SUM(pp.amount) FROM patient_payments pp
        WHERE pp.appointment_id = a.id
          AND pp.payment_date >= p_date_from
          AND pp.payment_date <= p_date_to
          AND COALESCE(pp.source, 'clinical') = 'clinical'
          AND pp.treatment_id IS NULL
      ), 0)                                  AS collected_in_range
    FROM appointments a
    LEFT JOIN doctors d  ON d.id = a.doctor_id
    LEFT JOIN services s ON s.id = a.service_id
    LEFT JOIN offices o  ON o.id = a.office_id
    WHERE a.organization_id IN (SELECT get_user_org_ids())
      AND a.appointment_date >= p_date_from
      AND a.appointment_date <= p_date_to
  ),
  range_payments AS (
    -- Cobros del rango por fecha de pago, ya clasificados en su cubeta.
    SELECT
      pp.amount,
      CASE
        WHEN COALESCE(pp.source, 'clinical') = 'pos'            THEN 'pharmacy'
        WHEN pp.treatment_id IS NOT NULL                        THEN 'treatments'
        WHEN pp.appointment_id IS NOT NULL
             AND pp.appointment_id IN (SELECT appointment_id FROM range_appointments)
                                                                THEN 'period_appointments'
        WHEN pp.appointment_id IS NOT NULL                      THEN 'other_appointments'
        WHEN pp.treatment_plan_id IS NOT NULL                   THEN 'plans'
        ELSE 'other'
      END AS bucket
    FROM patient_payments pp
    WHERE pp.organization_id IN (SELECT get_user_org_ids())
      AND pp.payment_date >= p_date_from
      AND pp.payment_date <= p_date_to
  )
  SELECT json_build_object(
    'totals', (
      SELECT json_build_object(
        'appointments', (SELECT COUNT(*) FROM range_appointments),
        -- Mismo "hoy" que usaba el cliente: new Date().toISOString() es UTC.
        'no_shows', (
          SELECT COUNT(*) FROM range_appointments
          WHERE appointment_date < (now() AT TIME ZONE 'utc')::date
            AND status IN ('scheduled', 'confirmed')
        ),
        -- Mig 244: los cobros de TRATAMIENTO van en su propio total.
        -- payments_amount se conserva tal cual (citas + farmacia + planes).
        'payments_amount', (
          SELECT COALESCE(SUM(amount), 0) FROM range_payments
          WHERE bucket <> 'treatments'
        ),
        'treatment_payments_amount', (
          SELECT COALESCE(SUM(amount), 0) FROM range_payments
          WHERE bucket = 'treatments'
        ),
        -- Mig 250: lo que de verdad falta cobrar de las citas del rango.
        'pending_amount', (
          SELECT COALESCE(SUM(GREATEST(0,
            ra.base_price - COALESCE((
              SELECT SUM(pp.amount) FROM patient_payments pp
              WHERE pp.appointment_id = ra.appointment_id
                AND COALESCE(pp.source, 'clinical') = 'clinical'
                AND pp.treatment_id IS NULL
            ), 0)
          )), 0)
          FROM range_appointments ra
          WHERE ra.status IN ('completed', 'confirmed')
        ),
        -- Mig 250: de dónde viene cada sol de payments_amount.
        'collected_breakdown', (
          SELECT json_build_object(
            'period_appointments', COALESCE(SUM(amount) FILTER (WHERE bucket = 'period_appointments'), 0),
            'other_appointments',  COALESCE(SUM(amount) FILTER (WHERE bucket = 'other_appointments'), 0),
            'plans',               COALESCE(SUM(amount) FILTER (WHERE bucket = 'plans'), 0),
            'pharmacy',            COALESCE(SUM(amount) FILTER (WHERE bucket = 'pharmacy'), 0),
            'other',               COALESCE(SUM(amount) FILTER (WHERE bucket = 'other'), 0)
          )
          FROM range_payments
        )
      )
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
        'revenue', dd.revenue,
        'collected', dd.collected
      ) ORDER BY dd.collected DESC, dd.revenue DESC, dd.first_date ASC, dd.name ASC), '[]'::json)
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
          -- Mig 251: lo cobrado en el rango sobre las citas del doctor, sin
          -- filtrar por estado (el dinero entró aunque la cita siga
          -- "programada").
          COALESCE(SUM(collected_in_range), 0) AS collected,
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
  ) INTO result;

  RETURN result;
END;
$function$;

COMMENT ON FUNCTION public.get_reports_overview(date, date) IS
  'Agregados de /reports. Mig 250: totals.pending_amount y totals.collected_breakdown. Mig 251: doctors[].collected (cobrado en el rango sobre las citas del doctor).';
