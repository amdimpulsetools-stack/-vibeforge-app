-- ═══════════════════════════════════════════════════════════════════
-- 50: migs 283 (devoluciones netas) y 284 (anular pago erróneo)
-- Corre como superusuario con auth.uid() simulado (test.uid).
-- Org 1111…, admin 2222…, recepción 3333…, paciente 5555… (del stub).
-- ═══════════════════════════════════════════════════════════════════

-- ══════════════════ 1. Devolución en Caja deja de contar como pagado ══════════════════
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_pat uuid := '66666666-6666-6666-6666-666666666666';
  v_shift uuid; v_pay uuid; v_mov uuid; v_paid numeric; v_ref numeric;
BEGIN
  INSERT INTO patients (id, organization_id, first_name, last_name) VALUES (v_pat, v_org, 'Vane', 'Refund')
  ON CONFLICT (id) DO NOTHING;

  -- Admin abre caja y registra un cobro clínico de 350.
  PERFORM set_config('test.uid','22222222-2222-2222-2222-222222222222', false);
  SELECT caja_open_shift(v_org, 0, NULL, NULL) INTO v_shift;
  INSERT INTO patient_payments (organization_id, patient_id, amount, payment_method, tender_kind)
  VALUES (v_org, v_pat, 350.00, 'Yape', 'electronico') RETURNING id INTO v_pay;

  SELECT total_paid INTO v_paid FROM get_patient_summary(v_pat);
  PERFORM t_eq('283: sin devolución, pagado = 350', v_paid, 350.00::numeric);

  -- Devolución de 175 en Caja (como hace appointment_cancel_refund).
  INSERT INTO cash_movements (organization_id, shift_id, movement_type, amount, tender_kind,
                              reason_code, notes, patient_id, payment_id, created_by)
  VALUES (v_org, v_shift, 'devolucion', -175.00, 'electronico', 'devolucion_paciente',
          'test', v_pat, v_pay, auth.uid()) RETURNING id INTO v_mov;

  SELECT patient_refunds_total(v_pat) INTO v_ref;
  PERFORM t_eq('283: patient_refunds_total ve la devolución', v_ref, 175.00::numeric);
  SELECT total_paid INTO v_paid FROM get_patient_summary(v_pat);
  PERFORM t_eq('283: pagado neto = 350 - 175', v_paid, 175.00::numeric);

  -- Recepción (otro turno, RLS la dejaría sin ver el movimiento) obtiene el mismo total.
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);
  SELECT patient_refunds_total(v_pat) INTO v_ref;
  PERFORM t_eq('283: recepción ve la misma devolución (DEFINER)', v_ref, 175.00::numeric);

  -- En lote.
  SELECT refunded INTO v_ref FROM patient_refunds_totals(ARRAY[v_pat]);
  PERFORM t_eq('283: patient_refunds_totals en lote', v_ref, 175.00::numeric);

  -- Reversa de la devolución: vuelve a contar como pagado.
  PERFORM set_config('test.uid','22222222-2222-2222-2222-222222222222', false);
  INSERT INTO cash_movements (organization_id, shift_id, movement_type, amount, tender_kind,
                              reason_code, notes, patient_id, reverses_movement_id, created_by)
  VALUES (v_org, v_shift, 'ingreso', 175.00, 'electronico', 'ajuste', 'reversa', v_pat, v_mov, auth.uid());
  SELECT total_paid INTO v_paid FROM get_patient_summary(v_pat);
  PERFORM t_eq('283: devolución revertida no resta', v_paid, 350.00::numeric);

  -- Fuera de la org: 0.
  PERFORM set_config('test.uid','99999999-9999-9999-9999-999999999999', false);
  SELECT patient_refunds_total(v_pat) INTO v_ref;
  PERFORM t_eq('283: fuera de la org devuelve 0', v_ref, 0::numeric);
END $$;

-- ══════════════════ 2. Anular pago erróneo ══════════════════
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_pat uuid := '77777777-7777-7777-7777-777777777777';
  v_appt uuid; v_shift uuid; v_pay uuid; v_pay_cash uuid; v_res json; v_err text;
  v_notes text; v_n int;
BEGIN
  INSERT INTO patients (id, organization_id, first_name, last_name) VALUES (v_pat, v_org, 'Edi', 'Void')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO appointments (organization_id, patient_id, appointment_date, status, price_snapshot)
  VALUES (v_org, v_pat, CURRENT_DATE + 7, 'scheduled', 350.00) RETURNING id INTO v_appt;

  -- Una segunda recepcionista (sin caja abierta por otras pruebas) abre la
  -- suya y registra un anticipo electrónico y uno en efectivo.
  INSERT INTO auth.users (id, email) VALUES ('33333333-3333-3333-3333-333333333334', 'recep2@test.local')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES ('33333333-3333-3333-3333-333333333334', v_org, 'receptionist')
  ON CONFLICT DO NOTHING;
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333334', false);
  SELECT caja_open_shift(v_org, 0, NULL, NULL) INTO v_shift;
  INSERT INTO patient_payments (organization_id, patient_id, appointment_id, amount, payment_method, tender_kind, notes)
  VALUES (v_org, v_pat, v_appt, 175.00, NULL, 'otro', 'Anticipo') RETURNING id INTO v_pay;
  INSERT INTO patient_payments (organization_id, patient_id, appointment_id, amount, payment_method, tender_kind)
  VALUES (v_org, v_pat, v_appt, 50.00, 'Efectivo', 'efectivo') RETURNING id INTO v_pay_cash;

  -- Recepción NO puede anular.
  BEGIN
    PERFORM patient_payment_void(v_pay, 'registrado por error');
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM t_ok('284: recepción no anula', v_err ILIKE '%owner/admin%');

  -- Cierra el turno (el candado de la 214 queda activo).
  PERFORM caja_close_shift(v_shift, 50.00, NULL, NULL, NULL);
  SELECT status INTO v_err FROM cash_shifts WHERE id = v_shift;
  PERFORM t_eq('284: turno cerrado', v_err, 'closed');

  -- Admin: motivo corto, rechazado.
  PERFORM set_config('test.uid','22222222-2222-2222-2222-222222222222', false);
  BEGIN
    PERFORM patient_payment_void(v_pay, 'mal');
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM t_ok('284: motivo obligatorio', v_err ILIKE '%motivo%');

  -- Admin: efectivo de turno cerrado, rechazado (arqueo firmado).
  BEGIN
    PERFORM patient_payment_void(v_pay_cash, 'registrado por error');
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM t_ok('284: efectivo de turno cerrado no se anula', v_err ILIKE '%efectivo%cerrado%');

  -- DELETE directo del electrónico sigue bloqueado por el candado.
  BEGIN
    DELETE FROM patient_payments WHERE id = v_pay;
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM t_ok('284: el candado de la 214 sigue cerrando el DELETE directo', v_err ILIKE '%caja ya cerrada%');

  -- Admin anula el anticipo electrónico del turno cerrado: pasa, con rastro.
  SELECT patient_payment_void(v_pay, 'anticipo registrado por error, nunca se cobró') INTO v_res;
  PERFORM t_ok('284: anulado ok', (v_res->>'ok')::boolean);
  PERFORM t_ok('284: reporta turno cerrado', (v_res->>'shift_was_closed')::boolean);
  SELECT count(*) INTO v_n FROM patient_payments WHERE id = v_pay;
  PERFORM t_eq('284: el pago ya no existe', v_n, 0);
  SELECT notes INTO v_notes FROM appointments WHERE id = v_appt;
  PERFORM t_ok('284: rastro en la cita', v_notes ILIKE '%[Pago anulado]: S/175.00%nunca se cobró%');
  PERFORM t_ok('284: el GUC quedó limpio', COALESCE(current_setting('caja.void_payment_id', true), '') = '');

  -- Dos veces: no encontrado.
  BEGIN
    PERFORM patient_payment_void(v_pay, 'otra vez');
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM t_ok('284: idempotente (no encontrado)', v_err ILIKE '%no encontrado%');

  -- Pago sin cita: el rastro va a la ficha de la paciente.
  INSERT INTO patient_payments (organization_id, patient_id, amount, payment_method, tender_kind)
  VALUES (v_org, v_pat, 20.00, 'Yape', 'electronico') RETURNING id INTO v_pay;
  SELECT patient_payment_void(v_pay, 'duplicado al registrar') INTO v_res;
  SELECT notes INTO v_notes FROM patients WHERE id = v_pat;
  PERFORM t_ok('284: rastro en la ficha cuando no hay cita', v_notes ILIKE '%[Pago anulado]: S/20.00%');

  -- Con comprobante: rechazado.
  INSERT INTO patient_payments (organization_id, patient_id, amount, payment_method, tender_kind, einvoice_id)
  VALUES (v_org, v_pat, 30.00, 'Yape', 'electronico', gen_random_uuid()) RETURNING id INTO v_pay;
  BEGIN
    PERFORM patient_payment_void(v_pay, 'registrado por error');
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  PERFORM t_ok('284: con comprobante no se anula', v_err ILIKE '%comprobante%');
END $$;

SELECT 'TODAS las pruebas 283/284 pasaron' AS resultado;
