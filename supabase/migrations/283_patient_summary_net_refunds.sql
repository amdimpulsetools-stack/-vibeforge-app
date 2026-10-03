-- Pendiente de aplicar en producción (la aplica el founder en el SQL Editor)
--
-- ═══════════════════════════════════════════════════════════════════
-- 283: el dinero DEVUELTO a la paciente deja de contar como "pagado"
--
-- Hallazgo del diagnóstico de saldos del 02-oct-2026 (Dra. Patricia).
-- Con Caja activa, appointment_cancel_refund (migs 230/233) registra la
-- devolución como cash_movements 'devolucion' y NO toca el pago (un
-- turno cerrado no se reescribe). Pero get_patient_summary y
-- lib/patient-debt.ts sumaban patient_payments a secas: una paciente a la
-- que se le devolvieron S/175 seguía con S/175 "pagados" en su ficha y,
-- al volver a agendar, debía S/175 menos de lo real. Sin Caja no pasa:
-- esa rama anula el pago.
--
-- Qué agrega
--   · patient_refunds_total(p_patient)      → S/ devueltos a la paciente
--   · patient_refunds_totals(p_patient_ids) → lo mismo, en lote (lista)
--     Ambas SECURITY DEFINER de SOLO LECTURA: la RLS de cash_movements
--     deja ver a recepción solo SU turno, y una devolución hecha en la
--     caja de otra persona debe restar igual. Exigen membresía en la org
--     de la paciente; fuera de ella devuelven 0 / nada.
--     Solo devoluciones ligadas a un pago CLÍNICO (la anulación de una
--     venta de Farmacia también es 'devolucion' y no toca citas); una
--     devolución revertida (contra-movimiento con reverses_movement_id)
--     no cuenta.
--   · get_patient_summary: total_paid = cobros clínicos − devoluciones
--     (nunca negativo). Cuerpo VERBATIM de la 243 salvo esa resta.
--
-- UN NÚMERO, UNA FÓRMULA: lib/patient-debt.ts cambia en el mismo commit
-- (patientPendingBalance recibe lo devuelto como tercer argumento; el
-- sidebar y la lista de pacientes lo piden a estas RPC).
--
-- Aditiva e idempotente. Rollback: rollbacks/283_patient_summary_net_refunds_rollback.sql
-- Pruebas: bash supabase/tests/pharmacy/run.sh (50_money_refunds_void_test.sql)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Devuelto a UNA paciente ─────────────────────────────────────
CREATE OR REPLACE FUNCTION patient_refunds_total(p_patient_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(-cm.amount), 0)::numeric
    FROM cash_movements cm
    JOIN patients p ON p.id = cm.patient_id
    -- Solo devoluciones de PLATA CLÍNICA: la anulación de una venta de
    -- Farmacia (pharmacy_void_sale, mig 217) también es 'devolucion' y
    -- apunta a un pago source='pos'; esa no toca la deuda de citas.
    JOIN patient_payments pp ON pp.id = cm.payment_id
   WHERE cm.patient_id = p_patient_id
     AND cm.movement_type = 'devolucion'
     AND cm.organization_id = p.organization_id
     AND COALESCE(pp.source, 'clinical') = 'clinical'
     AND pp.treatment_id IS NULL
     AND p.organization_id IN (SELECT get_user_org_ids())
     AND NOT EXISTS (SELECT 1 FROM cash_movements r WHERE r.reverses_movement_id = cm.id)
$$;

REVOKE ALL ON FUNCTION patient_refunds_total(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION patient_refunds_total(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION patient_refunds_total(uuid) IS
  'Mig 283: S/ devueltos a la paciente (cash_movements devolucion, netas de reversas). Solo lectura; DEFINER para ver turnos ajenos; exige membresía en la org de la paciente.';

-- ── 2. Devuelto a VARIAS pacientes (lista / exportación) ───────────
CREATE OR REPLACE FUNCTION patient_refunds_totals(p_patient_ids uuid[])
RETURNS TABLE (patient_id uuid, refunded numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT cm.patient_id, COALESCE(SUM(-cm.amount), 0)::numeric
    FROM cash_movements cm
    JOIN patients p ON p.id = cm.patient_id
    JOIN patient_payments pp ON pp.id = cm.payment_id
   WHERE cm.patient_id = ANY (p_patient_ids)
     AND cm.movement_type = 'devolucion'
     AND cm.organization_id = p.organization_id
     AND COALESCE(pp.source, 'clinical') = 'clinical'
     AND pp.treatment_id IS NULL
     AND p.organization_id IN (SELECT get_user_org_ids())
     AND NOT EXISTS (SELECT 1 FROM cash_movements r WHERE r.reverses_movement_id = cm.id)
   GROUP BY cm.patient_id
$$;

REVOKE ALL ON FUNCTION patient_refunds_totals(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION patient_refunds_totals(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION patient_refunds_totals(uuid[]) IS
  'Mig 283: patient_refunds_total en lote para la lista de pacientes y el CSV. Misma regla de acceso.';

-- ── 3. get_patient_summary: pagado NETO de devoluciones ────────────
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
      -- Precio REAL de la cita, no el del catálogo (mig 219):
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
      -- Mig 216: solo cobros clínicos. Mig 243: los cobros de un TRATAMIENTO
      -- no cancelan deuda de citas.
      COALESCE(SUM(pp.amount) FILTER (WHERE COALESCE(pp.source, 'clinical') = 'clinical' AND pp.treatment_id IS NULL), 0) AS total_paid,
      COUNT(*) FILTER (WHERE COALESCE(pp.source, 'clinical') = 'clinical' AND pp.treatment_id IS NULL)::int AS payments_count
    FROM patient_payments pp
    WHERE pp.patient_id = p_patient_id
  )
  SELECT
    appt.total_billed,
    -- Mig 283: lo devuelto en Caja ya no está en manos de la clínica.
    GREATEST(0, pay.total_paid - COALESCE(patient_refunds_total(p_patient_id), 0)) AS total_paid,
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
  'Mig 283 (sobre 243/219): resumen financiero del paciente. total_billed = precio real de citas no canceladas; total_paid = cobros clínicos sin tratamiento MENOS devoluciones en Caja (patient_refunds_total), nunca negativo. SECURITY INVOKER.';
