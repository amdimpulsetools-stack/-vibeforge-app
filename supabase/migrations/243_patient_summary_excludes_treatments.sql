-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 243: get_patient_summary — los cobros de TRATAMIENTO no cancelan deuda de citas.
--
-- Condición bloqueante #1 del módulo Tratamientos (mig 242): total_paid
-- sumaba TODO pago clínico, así que un cobro de S/ 8 000 al FIV cancelaba
-- por arte de magia una ecografía de S/ 150 pendiente. Ahora la cuenta de
-- citas excluye `treatment_id IS NOT NULL`; el dinero del tratamiento vive
-- en su propia cuenta (lib/treatments/money.ts).
--
-- Los anticipos a PLAN (treatment_plan_id, mig 099) siguen contando: sus
-- citas nacen con price_snapshot = session_price y el anticipo las cubre.
--
-- UN NÚMERO, UNA FÓRMULA: lib/patient-debt.ts cambia en el mismo commit.
-- Cuerpo VERBATIM de la 219 salvo el filtro (misma firma y RETURNS TABLE,
-- por eso CREATE OR REPLACE es válido sin DROP).
-- Rollback: rollbacks/243_patient_summary_excludes_treatments_rollback.sql

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
      -- Mig 243: los cobros de un TRATAMIENTO (treatment_id, mig 242) no
      -- cancelan deuda de citas — viven en su propia cuenta. Sin esto,
      -- S/ 8 000 al FIV "pagarían" una ecografía de S/ 150 pendiente.
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

REVOKE ALL ON FUNCTION get_patient_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_patient_summary(UUID) TO authenticated;

COMMENT ON FUNCTION get_patient_summary(UUID) IS
  'Mig 243 (sobre 219): resumen financiero/actividad del paciente. total_billed = SUM(GREATEST(0, COALESCE(price_snapshot, services.base_price) - discount_amount)) de citas no canceladas (precio REAL de la cita, no el de catálogo); total_paid = SUM(amount) de patient_payments con source=''clinical'' (mig 216) y treatment_id IS NULL (mig 243: los cobros de tratamiento no cancelan deuda de citas). SECURITY INVOKER: la RLS aplica por debajo.';
