-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 202: resumen financiero/actividad del paciente en un RPC (Lote 2, ítem 2.12a).
--
-- PROBLEMA
-- El PatientDrawer traía TODO el historial del paciente al abrirlo — todas
-- sus citas con 3 joins (doctors, services, offices) y todos sus pagos —
-- aunque el 90% de las aperturas solo necesita:
--   · el badge de deuda pendiente del header,
--   · los conteos de la vista expandida de "Datos" (nº citas, total pagado),
--   · primera/última visita y completadas de la pestaña Marketing.
-- Con pacientes recurrentes (decenas de citas), eso son cientos de kB y
-- trabajo de join por cada apertura de ficha.
--
-- SOLUCIÓN
-- get_patient_summary(): una pasada por appointments + una por
-- patient_payments (índices idx_appointments_patient /
-- idx_patient_payments_patient) que devuelve los 7 agregados que usan esas
-- vistas. El historial completo pasa a cargarse solo al entrar a las
-- pestañas Historial/Finanzas (mismo patrón lazy que ya usa la pestaña
-- Clínico).
--
-- Equivalencia con el JS anterior (patient-drawer.tsx):
--   · total_billed = SUM(services.base_price) de citas no canceladas
--     (LEFT JOIN + COALESCE(base_price, 0): las citas sin servicio sumaban 0
--     también en JS).
--   · total_paid = SUM(patient_payments.amount).
--   · appointments_count / completed_count incluyen canceladas en el total,
--     igual que appointments.length del drawer.
--   · first/last_appointment_date = MIN/MAX(appointment_date) — el drawer
--     tomaba el último/primer elemento de la lista ordenada desc.
--
-- SECURITY INVOKER a propósito: la RLS de appointments y patient_payments
-- (scope por org activa / restricción de doctor) aplica por debajo — el
-- caller solo agrega filas que ya podía leer. GRANT explícito a
-- authenticated (193(d) cerró los defaults).

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
      COALESCE(SUM(COALESCE(s.base_price, 0)) FILTER (WHERE a.status <> 'cancelled'), 0) AS total_billed,
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
      COALESCE(SUM(pp.amount), 0) AS total_paid,
      COUNT(*)::int AS payments_count
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
