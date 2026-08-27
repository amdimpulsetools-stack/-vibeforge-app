-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 230: Cancelación de citas con pagos — devolución con rastro
--
-- Hallazgo del founder (27-ago, cuenta demo): canceló citas con pagos
-- parciales y el ingreso del dashboard no bajó. NO era bug de datos —
-- ingresos = patient_payments reales; cancelar una cita no des-cobra la
-- plata — pero faltaba el flujo para registrar qué pasó con ese dinero.
--
-- Dos piezas:
--
--   1. appointment_cancel_refund(): RPC transaccional que registra la
--      devolución al cancelar. Mismo criterio que pharmacy_void_sale
--      (mig 217) y el interruptor dual de la mig 226:
--        · Org con Caja activa (addon 'caja' habilitado + fila en
--          cash_settings) → movimiento 'devolucion' en el turno abierto
--          (monto negativo, tender heredable, payment_id enlazado).
--          Sin turno abierto → error claro: "Abre caja...". El pago
--          original NO se toca: entró plata, salió plata, el arqueo
--          cuadra.
--        · Org sin Caja → anulación de pagos con rastro: DELETE de los
--          pagos más recientes hasta cubrir el monto; si la devolución
--          es parcial, el último pago se reduce y queda anotado. (Sin
--          Caja no existe libro de egresos; el pago ES el registro.)
--      En ambos casos se anota la devolución en appointments.notes.
--      Regla intacta: NUNCA pagos negativos (línea roja de F3).
--
--   2. get_admin_dashboard_stats_v3 neteando devoluciones: los 6
--      bloques de ingresos restan los cash_movements 'devolucion' de la
--      ventana (amount ya es negativo → se SUMA). Esto también corrige
--      la sobreestimación que ya existía con las anulaciones del POS de
--      Farmacia (la venta anulada conservaba su pago y el dashboard lo
--      contaba como ingreso pleno). Resto de la función VERBATIM de la
--      mig 200.
--
-- Additive + idempotente (CREATE OR REPLACE). El founder la pega a mano.
-- Rollback: 230_cancel_refund_flow_rollback.sql (restaura la v3 de la
-- mig 200 y elimina el RPC).
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. RPC de devolución al cancelar
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION appointment_cancel_refund(
  p_appointment_id UUID,
  p_amount NUMERIC,
  p_tender TEXT DEFAULT NULL  -- 'efectivo' | 'electronico' | NULL = heredar del último pago
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_appt       RECORD;
  v_paid       NUMERIC;
  v_caja_on    BOOLEAN;
  v_scope      TEXT;
  v_shift      UUID;
  v_tender     TEXT;
  v_last_pay   UUID;
  v_cash_mov   UUID;
  v_remaining  NUMERIC;
  v_pay        RECORD;
  v_method     TEXT;
  v_stamp      TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT a.id, a.organization_id, a.patient_id, a.appointment_date, a.notes
    INTO v_appt
    FROM appointments a
   WHERE a.id = p_appointment_id;

  IF v_appt.id IS NULL THEN
    RAISE EXCEPTION 'Cita no encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Membresía del caller en la org de la cita (get_user_org_ids lee
  -- auth.uid(), que se conserva bajo SECURITY DEFINER).
  IF NOT v_appt.organization_id = ANY(ARRAY(SELECT get_user_org_ids())) THEN
    RAISE EXCEPTION 'Sin acceso a esta organización' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM patient_payments WHERE appointment_id = p_appointment_id;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > v_paid THEN
    RAISE EXCEPTION 'Monto de devolución inválido (pagado: S/%)', v_paid
      USING ERRCODE = 'check_violation';
  END IF;

  -- Interruptor dual de la mig 226: addon 'caja' habilitado + config.
  SELECT EXISTS (
           SELECT 1 FROM organization_addons oa
            WHERE oa.organization_id = v_appt.organization_id
              AND oa.addon_key = 'caja' AND oa.enabled
         )
         AND EXISTS (
           SELECT 1 FROM cash_settings cs
            WHERE cs.organization_id = v_appt.organization_id
         )
    INTO v_caja_on;

  IF v_caja_on THEN
    -- ── Ruta Caja: devolución como movimiento en el turno abierto ──
    -- Mismo criterio de scope que caja_stamp_payment (214) y
    -- pharmacy_void_sale (217).
    SELECT shift_scope INTO v_scope
      FROM cash_settings WHERE organization_id = v_appt.organization_id;

    SELECT sh.id INTO v_shift
      FROM cash_shifts sh
     WHERE sh.organization_id = v_appt.organization_id
       AND sh.status = 'open'
       AND (v_scope = 'organization' OR sh.opened_by = v_uid)
     ORDER BY sh.opened_at DESC
     LIMIT 1;

    IF v_shift IS NULL THEN
      RAISE EXCEPTION 'Abre caja para registrar la devolución.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Tender: el elegido en el diálogo, o heredado del último pago de la
    -- cita — una cita pagada con tarjeta no puede descuadrar el efectivo
    -- del cajón al devolverse (criterio de la 217).
    SELECT pp.id, pp.tender_kind INTO v_last_pay, v_tender
      FROM patient_payments pp
     WHERE pp.appointment_id = p_appointment_id
     ORDER BY pp.created_at DESC
     LIMIT 1;

    IF p_tender IN ('efectivo', 'electronico') THEN
      v_tender := p_tender;
    END IF;

    INSERT INTO cash_movements (
      organization_id, shift_id, movement_type, amount, tender_kind,
      reason_code, notes, patient_id, payment_id, created_by
    ) VALUES (
      v_appt.organization_id, v_shift, 'devolucion', -p_amount,
      COALESCE(v_tender, 'efectivo'),
      'devolucion_paciente',
      'Devolución por cancelación de cita del ' || to_char(v_appt.appointment_date, 'DD/MM/YYYY'),
      v_appt.patient_id, v_last_pay, v_uid
    )
    RETURNING id INTO v_cash_mov;

    v_method := 'caja';
  ELSE
    -- ── Ruta sin Caja: anulación de pagos con rastro ──
    -- Del más reciente al más antiguo; una devolución parcial reduce el
    -- último pago y lo deja anotado. Los pagos de orgs sin Caja tienen
    -- cash_shift_id NULL, así que el candado de turnos cerrados (213)
    -- no aplica.
    v_remaining := p_amount;
    FOR v_pay IN
      SELECT id, amount
        FROM patient_payments
       WHERE appointment_id = p_appointment_id
       ORDER BY created_at DESC
    LOOP
      EXIT WHEN v_remaining <= 0;
      IF v_pay.amount <= v_remaining THEN
        DELETE FROM patient_payments WHERE id = v_pay.id;
        v_remaining := v_remaining - v_pay.amount;
      ELSE
        UPDATE patient_payments
           SET amount = amount - v_remaining,
               notes  = COALESCE(notes || ' · ', '')
                        || '[Devolución parcial S/' || trim(to_char(v_remaining, 'FM999990.00'))
                        || ' por cancelación de la cita]'
         WHERE id = v_pay.id;
        v_remaining := 0;
      END IF;
    END LOOP;

    v_method := 'anulacion';
  END IF;

  -- Rastro en la cita, en ambas rutas.
  v_stamp := '[Devolución]: S/' || trim(to_char(p_amount, 'FM999990.00'))
             || CASE WHEN v_method = 'caja' THEN ' registrada en caja' ELSE ' (pagos anulados)' END
             || ' — ' || to_char(now() AT TIME ZONE 'America/Lima', 'DD/MM/YYYY HH24:MI');

  UPDATE appointments
     SET notes = COALESCE(notes || E'\n', '') || v_stamp
   WHERE id = p_appointment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'method', v_method,
    'refunded', p_amount,
    'cash_movement_id', v_cash_mov
  );
END;
$$;

REVOKE ALL ON FUNCTION appointment_cancel_refund(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION appointment_cancel_refund(UUID, NUMERIC, TEXT) TO authenticated;

COMMENT ON FUNCTION appointment_cancel_refund(UUID, NUMERIC, TEXT) IS
  'Registra la devolución de dinero al cancelar una cita con pagos. Con Caja activa (addon+config, mig 226): movimiento devolucion en el turno abierto (sin turno → error). Sin Caja: anula pagos con rastro (parcial reduce el último). Siempre anota en appointments.notes. Nunca crea pagos negativos.';

-- ─────────────────────────────────────────────
-- 2. Dashboard: ingresos NETOS de devoluciones
-- ─────────────────────────────────────────────
-- Copia VERBATIM de la mig 200 salvo los 6 bloques de ingresos, que ahora
-- suman los cash_movements 'devolucion' de la ventana (amount negativo).
-- Ventanas por fecha Lima del movimiento, consistente con payment_date
-- (DATE estampada en hora Lima por el cliente).

CREATE OR REPLACE FUNCTION get_admin_dashboard_stats_v3(
  p_today DATE DEFAULT CURRENT_DATE,
  p_month_start DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,
  p_month_end DATE DEFAULT (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE,
  p_last_month_start DATE DEFAULT (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::DATE,
  p_last_month_end DATE DEFAULT (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day')::DATE,
  p_week_start DATE DEFAULT (CURRENT_DATE - INTERVAL '6 days')::DATE,
  p_prev_week_start DATE DEFAULT (CURRENT_DATE - INTERVAL '13 days')::DATE,
  p_prev_week_end DATE DEFAULT (CURRENT_DATE - INTERVAL '7 days')::DATE,
  p_yesterday DATE DEFAULT (CURRENT_DATE - INTERVAL '1 day')::DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result JSON;
  v_org_ids UUID[];
BEGIN
  v_org_ids := ARRAY(SELECT get_user_org_ids());

  SELECT json_build_object(
    -- ── Conteos básicos ──
    'active_doctors', (
      SELECT COUNT(*) FROM doctors WHERE organization_id = ANY(v_org_ids) AND is_active = true
    ),

    -- ── Citas (mes) ──
    'today_appts', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids) AND appointment_date = p_today
    ),
    'this_month_appts', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_month_start AND appointment_date <= p_month_end
    ),
    'last_month_appts', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_last_month_start AND appointment_date <= p_last_month_end
    ),
    'completed_month', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_month_start AND appointment_date <= p_month_end
        AND status = 'completed'
    ),
    'cancelled_month', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_month_start AND appointment_date <= p_month_end
        AND status = 'cancelled'
    ),
    'no_shows_month', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_month_start AND appointment_date <= p_month_end
        AND status = 'no_show'
    ),

    -- ── Pacientes nuevos ──
    'new_patients_this_month', (
      SELECT COUNT(*) FROM patients
      WHERE organization_id = ANY(v_org_ids) AND created_at >= p_month_start::timestamp
    ),
    'new_patients_last_month', (
      SELECT COUNT(*) FROM patients
      WHERE organization_id = ANY(v_org_ids)
        AND created_at >= p_last_month_start::timestamp
        AND created_at < p_month_start::timestamp
    ),

    -- ── Pacientes recurrentes (>1 cita en el mes) ──
    'recurring_patients_month', (
      SELECT COUNT(*) FROM (
        SELECT patient_id FROM appointments
        WHERE organization_id = ANY(v_org_ids)
          AND appointment_date >= p_month_start AND appointment_date <= p_month_end
          AND status IN ('completed', 'confirmed', 'scheduled')
          AND patient_id IS NOT NULL
        GROUP BY patient_id
        HAVING COUNT(*) > 1
      ) sub
    ),
    'recurring_patients_last_month', (
      SELECT COUNT(*) FROM (
        SELECT patient_id FROM appointments
        WHERE organization_id = ANY(v_org_ids)
          AND appointment_date >= p_last_month_start AND appointment_date <= p_last_month_end
          AND status IN ('completed', 'confirmed', 'scheduled')
          AND patient_id IS NOT NULL
        GROUP BY patient_id
        HAVING COUNT(*) > 1
      ) sub
    ),

    -- ── Ingresos (mes) — netos de devoluciones ──
    'revenue_this_month', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE organization_id = ANY(v_org_ids)
        AND payment_date >= p_month_start AND payment_date <= p_month_end
    ) + (
      SELECT COALESCE(SUM(cm.amount), 0)  -- devoluciones: amount ya es negativo
      FROM cash_movements cm
      WHERE cm.organization_id = ANY(v_org_ids)
        AND cm.movement_type = 'devolucion'
        AND (cm.created_at AT TIME ZONE 'America/Lima')::date >= p_month_start
        AND (cm.created_at AT TIME ZONE 'America/Lima')::date <= p_month_end
    ),
    'revenue_last_month', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE organization_id = ANY(v_org_ids)
        AND payment_date >= p_last_month_start AND payment_date <= p_last_month_end
    ) + (
      SELECT COALESCE(SUM(cm.amount), 0)
      FROM cash_movements cm
      WHERE cm.organization_id = ANY(v_org_ids)
        AND cm.movement_type = 'devolucion'
        AND (cm.created_at AT TIME ZONE 'America/Lima')::date >= p_last_month_start
        AND (cm.created_at AT TIME ZONE 'America/Lima')::date <= p_last_month_end
    ),

    -- ── Ingresos (semana) — netos de devoluciones ──
    'revenue_this_week', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE organization_id = ANY(v_org_ids)
        AND payment_date >= p_week_start AND payment_date <= p_today
    ) + (
      SELECT COALESCE(SUM(cm.amount), 0)
      FROM cash_movements cm
      WHERE cm.organization_id = ANY(v_org_ids)
        AND cm.movement_type = 'devolucion'
        AND (cm.created_at AT TIME ZONE 'America/Lima')::date >= p_week_start
        AND (cm.created_at AT TIME ZONE 'America/Lima')::date <= p_today
    ),
    'revenue_prev_week', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE organization_id = ANY(v_org_ids)
        AND payment_date >= p_prev_week_start AND payment_date <= p_prev_week_end
    ) + (
      SELECT COALESCE(SUM(cm.amount), 0)
      FROM cash_movements cm
      WHERE cm.organization_id = ANY(v_org_ids)
        AND cm.movement_type = 'devolucion'
        AND (cm.created_at AT TIME ZONE 'America/Lima')::date >= p_prev_week_start
        AND (cm.created_at AT TIME ZONE 'America/Lima')::date <= p_prev_week_end
    ),

    -- ── Ingresos (hoy / ayer) — netos de devoluciones ──
    'revenue_today', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE organization_id = ANY(v_org_ids) AND payment_date = p_today
    ) + (
      SELECT COALESCE(SUM(cm.amount), 0)
      FROM cash_movements cm
      WHERE cm.organization_id = ANY(v_org_ids)
        AND cm.movement_type = 'devolucion'
        AND (cm.created_at AT TIME ZONE 'America/Lima')::date = p_today
    ),
    'revenue_yesterday', (
      SELECT COALESCE(SUM(amount), 0)
      FROM patient_payments
      WHERE organization_id = ANY(v_org_ids) AND payment_date = p_yesterday
    ) + (
      SELECT COALESCE(SUM(cm.amount), 0)
      FROM cash_movements cm
      WHERE cm.organization_id = ANY(v_org_ids)
        AND cm.movement_type = 'devolucion'
        AND (cm.created_at AT TIME ZONE 'America/Lima')::date = p_yesterday
    ),

    -- ── Deuda pendiente (mes) ──
    'pending_debt_month', (
      SELECT COALESCE(SUM(GREATEST(0,
        COALESCE(a.price_snapshot, COALESCE(s.base_price, 0))
        - COALESCE((SELECT SUM(pp.amount) FROM patient_payments pp WHERE pp.appointment_id = a.id), 0)
      )), 0)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids) AND a.status != 'cancelled'
        AND a.appointment_date >= p_month_start AND a.appointment_date <= p_month_end
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0)) > 0
    ),
    'debtor_count_month', (
      SELECT COUNT(DISTINCT a.patient_id)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids) AND a.status != 'cancelled'
        AND a.appointment_date >= p_month_start AND a.appointment_date <= p_month_end
        AND a.patient_id IS NOT NULL
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0)) > 0
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0))
            > COALESCE((SELECT SUM(pp.amount) FROM patient_payments pp WHERE pp.appointment_id = a.id), 0)
    ),

    -- ── Deuda pendiente (semana) ──
    'pending_debt_week', (
      SELECT COALESCE(SUM(GREATEST(0,
        COALESCE(a.price_snapshot, COALESCE(s.base_price, 0))
        - COALESCE((SELECT SUM(pp.amount) FROM patient_payments pp WHERE pp.appointment_id = a.id), 0)
      )), 0)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids) AND a.status != 'cancelled'
        AND a.appointment_date >= p_week_start AND a.appointment_date <= p_today
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0)) > 0
    ),
    'debtor_count_week', (
      SELECT COUNT(DISTINCT a.patient_id)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids) AND a.status != 'cancelled'
        AND a.appointment_date >= p_week_start AND a.appointment_date <= p_today
        AND a.patient_id IS NOT NULL
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0)) > 0
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0))
            > COALESCE((SELECT SUM(pp.amount) FROM patient_payments pp WHERE pp.appointment_id = a.id), 0)
    ),

    -- ── Deuda pendiente (hoy) ──
    'pending_debt_today', (
      SELECT COALESCE(SUM(GREATEST(0,
        COALESCE(a.price_snapshot, COALESCE(s.base_price, 0))
        - COALESCE((SELECT SUM(pp.amount) FROM patient_payments pp WHERE pp.appointment_id = a.id), 0)
      )), 0)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids) AND a.status != 'cancelled'
        AND a.appointment_date = p_today
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0)) > 0
    ),
    'debtor_count_today', (
      SELECT COUNT(DISTINCT a.patient_id)
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      WHERE a.organization_id = ANY(v_org_ids) AND a.status != 'cancelled'
        AND a.appointment_date = p_today
        AND a.patient_id IS NOT NULL
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0)) > 0
        AND COALESCE(a.price_snapshot, COALESCE(s.base_price, 0))
            > COALESCE((SELECT SUM(pp.amount) FROM patient_payments pp WHERE pp.appointment_id = a.id), 0)
    ),

    -- ── Desgloses semana / hoy ──
    'week_total', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_week_start AND appointment_date <= p_today
    ),
    'week_completed', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_week_start AND appointment_date <= p_today
        AND status = 'completed'
    ),
    'week_cancelled', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_week_start AND appointment_date <= p_today
        AND status = 'cancelled'
    ),
    'week_no_shows', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date >= p_week_start AND appointment_date <= p_today
        AND status = 'no_show'
    ),
    'today_completed', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date = p_today AND status = 'completed'
    ),
    'today_cancelled', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date = p_today AND status = 'cancelled'
    ),
    'today_no_shows', (
      SELECT COUNT(*) FROM appointments
      WHERE organization_id = ANY(v_org_ids)
        AND appointment_date = p_today AND status = 'no_show'
    ),

    -- ── Performance de recepcionistas (mes) ──
    'receptionist_performance', (
      SELECT COALESCE(json_agg(rp ORDER BY rp.completed DESC), '[]'::json)
      FROM (
        SELECT
          a.responsible AS name,
          COUNT(*) FILTER (WHERE a.status = 'completed') AS completed,
          COUNT(*) AS total
        FROM appointments a
        WHERE a.organization_id = ANY(v_org_ids)
          AND a.appointment_date >= p_month_start AND a.appointment_date <= p_month_end
          AND a.responsible IS NOT NULL AND a.responsible != ''
        GROUP BY a.responsible
      ) rp
    ),

    -- ── Meta de ingresos ──
    'monthly_revenue_goal', (
      SELECT COALESCE(monthly_revenue_goal, 0)
      FROM organizations
      WHERE id = ANY(v_org_ids)
      LIMIT 1
    ),

    -- ── Serie diaria de citas (últimos 30 días, sin canceladas) ──
    'daily_series', (
      SELECT COALESCE(json_agg(json_build_object(
        'date', ds.date,
        'count', ds.count
      ) ORDER BY ds.date ASC), '[]'::json)
      FROM (
        SELECT appointment_date AS date, COUNT(*) AS count
        FROM appointments
        WHERE organization_id = ANY(v_org_ids)
          AND appointment_date >= (p_today - INTERVAL '29 days')::date
          AND appointment_date <= p_today
          AND status != 'cancelled'
        GROUP BY appointment_date
      ) ds
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION get_admin_dashboard_stats_v3(DATE, DATE, DATE, DATE, DATE, DATE, DATE, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_admin_dashboard_stats_v3(DATE, DATE, DATE, DATE, DATE, DATE, DATE, DATE, DATE) TO authenticated;
