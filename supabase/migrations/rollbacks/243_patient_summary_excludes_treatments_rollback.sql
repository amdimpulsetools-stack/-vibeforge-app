-- Rollback de la mig 243: restaura get_patient_summary de la 219 verbatim
-- (los cobros de tratamiento vuelven a cancelar deuda de citas).

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
      -- Precio REAL de la cita, no el del catálogo (ver cabecera):
      -- GREATEST(0, COALESCE(price_snapshot, base_price) − discount_amount).
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
      -- Filtro de la mig 216, intacto: solo los cobros clínicos cancelan
      -- deuda clínica (los de source='pos' son de farmacia).
      COALESCE(SUM(pp.amount) FILTER (WHERE COALESCE(pp.source, 'clinical') = 'clinical'), 0) AS total_paid,
      COUNT(*) FILTER (WHERE COALESCE(pp.source, 'clinical') = 'clinical')::int AS payments_count
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

REVOKE ALL ON FUNCTION get_patient_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_patient_summary(UUID) TO authenticated;

COMMENT ON FUNCTION get_patient_summary(UUID) IS
  'Mig 219: resumen financiero/actividad del paciente. total_billed = SUM(GREATEST(0, COALESCE(price_snapshot, services.base_price) - discount_amount)) de citas no canceladas (precio REAL de la cita, no el de catálogo); total_paid = SUM(amount) de patient_payments con source=''clinical'' (mig 216). SECURITY INVOKER: la RLS aplica por debajo.';
