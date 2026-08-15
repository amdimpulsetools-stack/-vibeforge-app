-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 219: get_patient_summary factura el PRECIO REAL de la cita, no el de catálogo.
--
-- BUG REPRODUCIDO EN PRODUCCIÓN
-- Cita con servicio de base_price S/ 200 pero PRECIO PERSONALIZADO S/ 180.
-- El paciente pagó S/ 90 + S/ 90 = S/ 180. El sidebar de la cita mostraba
-- Total 180 / Pagado 180 / Pendiente 0 ✓, pero el PatientDrawer mostraba
-- "Saldo pendiente: S/ 20.00" ✗. Los S/ 20 fantasma son exactamente
-- 200 (catálogo) − 180 (precio real de la cita).
--
-- CAUSA
-- La mig 202 definió total_billed como SUM(services.base_price) — el precio
-- del CATÁLOGO — y la mig 216 la reescribió tocando únicamente total_paid
-- (filtro source='clinical'), heredando el defecto intacto. Pero el precio
-- que se le cobra al paciente NO es el del catálogo:
--   · mig 011 añadió appointments.price_snapshot: el precio acordado y
--     congelado al crear la cita. Es lo que escribe el formulario de cita
--     (app/(dashboard)/scheduler/appointment-form-modal.tsx), con la
--     precedencia precio personalizado > precio de sesión de plan > catálogo.
--   · mig 100 añadió appointments.discount_amount (NOT NULL DEFAULT 0) y fijó
--     la fórmula canónica en su propia cabecera:
--         precio efectivo = GREATEST(0, price_snapshot − discount_amount)
-- El resto de la app ya usaba esa fórmula (sidebar de la cita, lista de
-- pacientes, filtro "con deuda", export CSV). Solo este RPC seguía sumando
-- base_price, así que el drawer era la única vista que mentía.
--
-- FÓRMULA NUEVA (autoritativa para la deuda clínica del paciente)
--   total_billed = SUM(
--       GREATEST(0,
--         COALESCE(a.price_snapshot, COALESCE(s.base_price, 0))  -- precio real
--         - COALESCE(a.discount_amount, 0)                        -- descuento
--       )
--     ) FILTER (WHERE a.status <> 'cancelled')
--
--   · price_snapshot es la fuente de verdad del precio de ESA cita.
--   · El fallback a services.base_price cubre las citas anteriores a la
--     mig 011 (cuando la columna no existía) y las creadas sin servicio
--     asociado o sin snapshot; para ellas el comportamiento es idéntico al
--     de la 202/216, así que ningún número histórico se mueve por el fallback.
--     Nota: el fallback usa price_snapshot IS NULL, no "= 0" — una cita
--     legítimamente gratis (price_snapshot = 0) sigue facturando 0 y no
--     resucita el precio de catálogo.
--   · discount_amount es NOT NULL DEFAULT 0 desde la mig 100; el COALESCE es
--     defensivo para filas insertadas por rutas que la dejen NULL.
--   · GREATEST(0, ...) evita que un descuento mayor que el precio genere
--     crédito negativo que cancele la deuda de otras citas — misma
--     protección que Math.max(0, ...) en el cliente.
--   · Las canceladas siguen sin facturar (igual que 202/216).
--
-- LO QUE NO CAMBIA
--   · El filtro source='clinical' de la mig 216 en total_paid / payments_count
--     queda INTACTO: el dinero del POS de farmacia no cancela deuda clínica.
--   · Conteos, primera/última visita, firma, SECURITY INVOKER y GRANTs:
--     idénticos. La RLS de appointments y patient_payments sigue aplicando
--     por debajo — el caller solo agrega filas que ya podía leer.
--
-- CONSUMIDORES ALINEADOS POR ESTE CAMBIO
--   · app/(dashboard)/patients/patient-drawer.tsx — badge "Saldo pendiente"
--     y pestaña Finanzas (únicos consumidores del RPC).
--   · app/(dashboard)/patients/patients-client.tsx — filtro "con deuda" y
--     export CSV: se ajustan en este mismo commit para calcular en cliente
--     exactamente esta fórmula (fallback a base_price + source='clinical').
--   · app/(dashboard)/scheduler/appointment-sidebar.tsx — la deuda total del
--     paciente se alinea a la misma semántica en el mismo commit.
--
-- DEFECTO CONOCIDO NO TOCADO AQUÍ
--   La mig 200 (get_admin_dashboard_stats_v3: pending_debt_today/week/month y
--   debtor_count_*) sí usa COALESCE(a.price_snapshot, s.base_price) — el
--   precio real — pero NUNCA resta discount_amount. Una cita con descuento
--   infla la deuda del dashboard admin en el monto del descuento y puede
--   contar como deudor a un paciente al día. Es otro RPC, con otros
--   consumidores y semántica por-cita (no por-paciente): se decide y corrige
--   aparte, deliberadamente fuera de esta migración.

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
