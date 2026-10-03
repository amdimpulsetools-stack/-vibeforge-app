-- Rollback 283: get_patient_summary vuelve al cuerpo de la 243 (sin restar
-- devoluciones) y se quitan las RPC de devoluciones. Idempotente; no toca datos.

CREATE OR REPLACE FUNCTION get_patient_summary(p_patient_id UUID)
RETURNS TABLE (
  total_billed NUMERIC,
  total_paid NUMERIC,
  appointments_count INTEGER,
  completed_count INTEGER,
  first_appointment_date DATE,
  last_appointment_date DATE,
  payments_count INTEGER
)
LANGUAGE sql SECURITY INVOKER STABLE
SET search_path = public, pg_temp
AS $$
  WITH appt AS (
    SELECT
      COALESCE(
        SUM(
          GREATEST(
            0,
            COALESCE(a.price_snapshot, COALESCE(s.base_price, 0))
              - COALESCE(a.discount_amount, 0)
          )
        ) FILTER (WHERE a.status <> 'cancelled'),
        0
      ) AS total_billed,
      COUNT(*)::int AS appointments_count,
      COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed_count,
      MIN(a.appointment_date) AS first_appointment_date,
      MAX(a.appointment_date) AS last_appointment_date
    FROM appointments a
    LEFT JOIN services s ON s.id = a.service_id
    WHERE a.patient_id = p_patient_id
  ),
  pay AS (
    SELECT
      COALESCE(SUM(pp.amount) FILTER (WHERE COALESCE(pp.source, 'clinical') = 'clinical' AND pp.treatment_id IS NULL), 0) AS total_paid,
      COUNT(*) FILTER (WHERE COALESCE(pp.source, 'clinical') = 'clinical' AND pp.treatment_id IS NULL)::int AS payments_count
    FROM patient_payments pp
    WHERE pp.patient_id = p_patient_id
  )
  SELECT
    appt.total_billed,
    pay.total_paid,
    appt.appointments_count,
    appt.completed_count,
    appt.first_appointment_date,
    appt.last_appointment_date,
    pay.payments_count
  FROM appt, pay
$$;

DROP FUNCTION IF EXISTS patient_refunds_totals(uuid[]);
DROP FUNCTION IF EXISTS patient_refunds_total(uuid);
