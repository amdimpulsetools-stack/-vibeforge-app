-- Pruebas de invariantes del módulo Farmacia (migs 216/217).
\set ON_ERROR_STOP on
\timing off

CREATE OR REPLACE FUNCTION t_ok(p_name text, p_cond boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond THEN
    RAISE NOTICE 'PASS  %', p_name;
  ELSE
    RAISE EXCEPTION 'FAIL  % % ', p_name, p_detail;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION t_eq(p_name text, p_a anyelement, p_b anyelement)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_a IS NOT DISTINCT FROM p_b THEN
    RAISE NOTICE 'PASS  %  (=%)', p_name, p_a;
  ELSE
    RAISE EXCEPTION 'FAIL  %  esperado=% obtenido=%', p_name, p_b, p_a;
  END IF;
END $$;

-- ══════════════════ Fixtures ══════════════════
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_admin uuid := '22222222-2222-2222-2222-222222222222';
  v_reception uuid := '33333333-3333-3333-3333-333333333333';
  v_doctor uuid := '44444444-4444-4444-4444-444444444444';
  v_pat uuid := '55555555-5555-5555-5555-555555555555';
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_admin,'admin@t.com'), (v_reception,'recep@t.com'), (v_doctor,'doc@t.com');
  INSERT INTO organizations (id, name, owner_id) VALUES (v_org,'Clinica Test',v_admin);
  INSERT INTO organization_members (user_id, organization_id, role) VALUES
    (v_admin,v_org,'admin'), (v_reception,v_org,'receptionist'), (v_doctor,v_org,'doctor');
  INSERT INTO organization_addons (organization_id, addon_key, enabled)
    VALUES (v_org,'almacen',true)
    ON CONFLICT (organization_id, addon_key) DO UPDATE SET enabled=true;
  INSERT INTO patients (id, organization_id, first_name, last_name)
    VALUES (v_pat, v_org, 'Ana','Perez');
  -- Caja encendida: la FILA es el interruptor (mig 214).
  INSERT INTO cash_settings (organization_id, shift_scope) VALUES (v_org,'user');
END $$;

-- Productos: P1 gravado, P2 exonerado.
DO $$
DECLARE v_org uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  INSERT INTO inventory_products (id, organization_id, name, sale_price, igv_affectation, track_lots)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', v_org, 'PARACETAMOL 500', 35.50, 1, true),
         ('aaaaaaaa-0000-0000-0000-000000000002', v_org, 'LECHE MATERNIZADA', 20.00, 8, false);

  INSERT INTO inventory_lots (id, organization_id, product_id, lot_code, expiry_date, unit_cost)
  VALUES ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-0000-0000-0000-000000000001','L-001', current_date + 30, 20.00);
END $$;

-- Entradas costeadas: 10 @ 20.00 y 10 @ 30.00  ⇒ CPP 25.0000
DO $$
DECLARE v_org uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  PERFORM set_config('test.uid','22222222-2222-2222-2222-222222222222', false);
  INSERT INTO inventory_movements (organization_id, product_id, lot_id, movement_type, quantity, unit_cost, reason_code, movement_date)
  VALUES (v_org,'aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','entrada',10,20.00,'compra',current_date-2),
         (v_org,'aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','entrada',10,30.00,'compra',current_date-1),
         (v_org,'aaaaaaaa-0000-0000-0000-000000000002',NULL,'entrada',50,12.00,'compra',current_date-1);
END $$;

SELECT t_eq('CPP ponderado de entradas', pharmacy_avg_cost('aaaaaaaa-0000-0000-0000-000000000001'), 25.0000::numeric);

-- ══════════════════ 1. Aritmética de línea = computeLineTax ══════════════════
-- El caso que motivó el orden de redondeo en mapper.ts: q=12 @ 35.50.
--   gross = 426.00 ; subtotal = round(426/1.18,2) = 361.02 ; igv = 64.98
-- Redondear el unitario y multiplicar daría 361.08 / 64.92 (6 céntimos de más).
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_sale uuid;
  r record;
BEGIN
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);
  INSERT INTO pharmacy_sales (organization_id, created_by) VALUES (v_org, auth.uid()) RETURNING id INTO v_sale;
  INSERT INTO pharmacy_sale_items (sale_id, organization_id, product_id, description, quantity, unit_price, igv_affectation)
  VALUES (v_sale, v_org, 'aaaaaaaa-0000-0000-0000-000000000001','PARACETAMOL 500', 12, 35.50, 1);

  SELECT * INTO r FROM pharmacy_sale_items WHERE sale_id = v_sale;
  PERFORM t_eq('linea gross  (12 x 35.50)', r.line_gross,    426.00::numeric);
  PERFORM t_eq('linea total', r.line_total,    426.00::numeric);
  PERFORM t_eq('linea subtotal (base)', r.line_subtotal, 361.02::numeric);
  PERFORM t_eq('linea igv (por diferencia)', r.line_igv,      64.98::numeric);
  PERFORM t_ok('subtotal + igv = total', r.line_subtotal + r.line_igv = r.line_total);

  DELETE FROM pharmacy_sales WHERE id = v_sale;
END $$;

-- Exonerado (8): la base ES el importe, IGV cero.
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_sale uuid; r record;
BEGIN
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);
  INSERT INTO pharmacy_sales (organization_id, created_by) VALUES (v_org, auth.uid()) RETURNING id INTO v_sale;
  INSERT INTO pharmacy_sale_items (sale_id, organization_id, product_id, description, quantity, unit_price, igv_affectation)
  VALUES (v_sale, v_org, 'aaaaaaaa-0000-0000-0000-000000000002','LECHE', 3, 20.00, 8);
  SELECT * INTO r FROM pharmacy_sale_items WHERE sale_id = v_sale;
  PERFORM t_eq('exonerado: subtotal = total', r.line_subtotal, 60.00::numeric);
  PERFORM t_eq('exonerado: igv = 0', r.line_igv, 0.00::numeric);
  DELETE FROM pharmacy_sales WHERE id = v_sale;
END $$;

-- El descuento no puede superar el importe de la línea.
DO $$
DECLARE v_org uuid := '11111111-1111-1111-1111-111111111111'; v_sale uuid; v_err boolean := false;
BEGIN
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);
  INSERT INTO pharmacy_sales (organization_id, created_by) VALUES (v_org, auth.uid()) RETURNING id INTO v_sale;
  BEGIN
    INSERT INTO pharmacy_sale_items (sale_id, organization_id, product_id, description, quantity, unit_price, line_discount)
    VALUES (v_sale, v_org,'aaaaaaaa-0000-0000-0000-000000000001','P',1,10.00, 25.00);
  EXCEPTION WHEN check_violation THEN v_err := true;
  END;
  PERFORM t_ok('descuento > importe se rechaza', v_err);
  DELETE FROM pharmacy_sales WHERE id = v_sale;
END $$;

-- Los importes derivados NO se pueden escribir (son GENERATED).
DO $$
DECLARE v_org uuid := '11111111-1111-1111-1111-111111111111'; v_sale uuid; v_err boolean := false;
BEGIN
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);
  INSERT INTO pharmacy_sales (organization_id, created_by) VALUES (v_org, auth.uid()) RETURNING id INTO v_sale;
  BEGIN
    INSERT INTO pharmacy_sale_items (sale_id, organization_id, product_id, description, quantity, unit_price, line_total)
    VALUES (v_sale, v_org,'aaaaaaaa-0000-0000-0000-000000000001','P',1,10.00, 0.01);
  EXCEPTION WHEN others THEN v_err := true;
  END;
  PERFORM t_ok('el navegador no puede escribir line_total', v_err);
  DELETE FROM pharmacy_sales WHERE id = v_sale;
END $$;

-- ══════════════════ 2. Confirmar: stock, costo, cobro, totales ══════════════════
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_sale uuid; v_shift uuid; v_res jsonb; s pharmacy_sales%ROWTYPE; r record;
  v_stock numeric;
BEGIN
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);
  v_shift := caja_open_shift(v_org, 100.00);

  INSERT INTO pharmacy_sales (organization_id, created_by, patient_id)
  VALUES (v_org, auth.uid(), '55555555-5555-5555-5555-555555555555') RETURNING id INTO v_sale;

  -- 2 x 35.50 gravado, con 5.00 de descuento  +  3 x 20.00 exonerado
  INSERT INTO pharmacy_sale_items (sale_id, organization_id, product_id, lot_id, description, quantity, unit_price, line_discount, igv_affectation, position)
  VALUES (v_sale, v_org,'aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','PARACETAMOL 500',2,35.50,5.00,1,1),
         (v_sale, v_org,'aaaaaaaa-0000-0000-0000-000000000002',NULL,'LECHE',3,20.00,0,8,2);

  v_res := pharmacy_confirm_sale(v_sale, 'Efectivo');
  SELECT * INTO s FROM pharmacy_sales WHERE id = v_sale;

  PERFORM t_eq('estado tras cobrar', s.status, 'confirmada');
  PERFORM t_eq('primer correlativo', s.sale_number, 1::bigint);
  -- gravada: gross 71.00 - 5.00 = 66.00 ; base 55.93 ; igv 6.07... verificado abajo
  PERFORM t_eq('total cabecera', s.total, (66.00 + 60.00)::numeric);
  PERFORM t_ok('totales reconcilian',
    s.total = s.subtotal_taxed + s.subtotal_exempt + s.subtotal_unaffected + s.igv_amount,
    format('%s vs %s', s.total, s.subtotal_taxed + s.subtotal_exempt + s.subtotal_unaffected + s.igv_amount));
  PERFORM t_eq('base exonerada va a su casillero', s.subtotal_exempt, 60.00::numeric);
  PERFORM t_eq('descuento agregado', s.discount_amount, 5.00::numeric);

  -- F4 NO EMITE: einvoice_id nace y muere NULL.
  PERFORM t_ok('einvoice_id sigue NULL (F4 sin emision)', s.einvoice_id IS NULL);
  PERFORM t_eq('billing_mode', s.billing_mode, 'interno');
  PERFORM t_eq('billing_status', s.billing_status, 'no_aplica');

  -- Stock descontado: 20 - 2 = 18
  SELECT COALESCE(sum(quantity),0) INTO v_stock FROM inventory_movements
   WHERE product_id='aaaaaaaa-0000-0000-0000-000000000001';
  PERFORM t_eq('stock tras vender 2', v_stock, 18.000::numeric);

  -- CPP congelado en la linea y en el movimiento
  SELECT * INTO r FROM pharmacy_sale_items WHERE sale_id=v_sale AND product_id='aaaaaaaa-0000-0000-0000-000000000001';
  PERFORM t_eq('costo congelado en la linea', r.unit_cost, 25.0000::numeric);
  PERFORM t_ok('la linea apunta a su movimiento', r.movement_id IS NOT NULL);

  SELECT * INTO r FROM inventory_movements WHERE sale_line_id = r.id;
  PERFORM t_eq('movimiento: tipo', r.movement_type, 'salida');
  PERFORM t_eq('movimiento: motivo', r.reason_code, 'venta');
  PERFORM t_eq('movimiento: cantidad negativa', r.quantity, -2.000::numeric);
  PERFORM t_eq('movimiento: precio de venta unitario cobrado', r.unit_sale_price, 33.00::numeric);

  -- El pago existe, es 'pos' y el TRIGGER de caja lo ató al turno solo.
  SELECT * INTO r FROM patient_payments WHERE sale_id = v_sale;
  PERFORM t_eq('pago: origen', r.source, 'pos');
  PERFORM t_eq('pago: monto', r.amount, 126.00::numeric);
  PERFORM t_eq('pago atado al turno por el trigger', r.cash_shift_id, v_shift);
  PERFORM t_eq('la venta guarda el turno', s.cash_shift_id, v_shift);
  PERFORM t_eq('tender clasificado', r.tender_kind, 'efectivo');
END $$;

-- ══════════════════ 3. Idempotencia ══════════════════
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_sale uuid; a jsonb; b jsonb; v_movs int; v_pays int; v_max bigint;
BEGIN
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);
  INSERT INTO pharmacy_sales (organization_id, created_by) VALUES (v_org, auth.uid()) RETURNING id INTO v_sale;
  INSERT INTO pharmacy_sale_items (sale_id, organization_id, product_id, description, quantity, unit_price)
  VALUES (v_sale, v_org,'aaaaaaaa-0000-0000-0000-000000000001','PARACETAMOL 500',1,35.50);

  a := pharmacy_confirm_sale(v_sale, 'Efectivo');
  b := pharmacy_confirm_sale(v_sale, 'Efectivo');   -- doble clic

  PERFORM t_eq('doble cobro: mismo correlativo', (b->>'sale_number')::bigint, (a->>'sale_number')::bigint);
  PERFORM t_eq('doble cobro: mismo total', (b->>'total')::numeric, (a->>'total')::numeric);
  PERFORM t_eq('doble cobro: mismo pago', b->>'payment_id', a->>'payment_id');
  PERFORM t_ok('segunda llamada marcada como ya-hecha', (b->>'already')::boolean);

  SELECT count(*) INTO v_movs FROM inventory_movements m
    JOIN pharmacy_sale_items i ON i.id = m.sale_line_id WHERE i.sale_id = v_sale;
  PERFORM t_eq('un solo movimiento de kardex', v_movs, 1);

  SELECT count(*) INTO v_pays FROM patient_payments WHERE sale_id = v_sale;
  PERFORM t_eq('un solo cobro', v_pays, 1);

  SELECT current_number INTO v_max FROM pharmacy_sale_counters WHERE organization_id = v_org;
  PERFORM t_eq('el correlativo no avanzo de mas', v_max, 2::bigint);
END $$;

-- ══════════════════ 4. Stock insuficiente avisa pero NO bloquea ══════════════════
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_sale uuid; v_res jsonb; v_stock numeric;
BEGIN
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);
  INSERT INTO pharmacy_sales (organization_id, created_by) VALUES (v_org, auth.uid()) RETURNING id INTO v_sale;
  INSERT INTO pharmacy_sale_items (sale_id, organization_id, product_id, description, quantity, unit_price)
  VALUES (v_sale, v_org,'aaaaaaaa-0000-0000-0000-000000000001','PARACETAMOL 500', 999, 35.50);

  v_res := pharmacy_confirm_sale(v_sale, 'Efectivo');
  PERFORM t_eq('la venta se cobra igual', v_res->>'status', 'confirmada');
  PERFORM t_ok('deja aviso de stock', jsonb_array_length(v_res->'warnings') > 0, v_res->>'warnings');

  SELECT COALESCE(sum(quantity),0) INTO v_stock FROM inventory_movements
   WHERE product_id='aaaaaaaa-0000-0000-0000-000000000001';
  PERFORM t_ok('el descuadre queda VISIBLE en el kardex', v_stock < 0, v_stock::text);

  -- se deshace para no ensuciar las pruebas siguientes
  PERFORM pharmacy_void_sale(v_sale, 'limpieza de prueba');
END $$;

-- ══════════════════ 5. Anulación: stock y dinero juntos ══════════════════
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_sale uuid; v_res jsonb; s pharmacy_sales%ROWTYPE;
  v_before numeric; v_after numeric; v_cash numeric; v_cm record;
BEGIN
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);
  SELECT COALESCE(sum(quantity),0) INTO v_before FROM inventory_movements
   WHERE product_id='aaaaaaaa-0000-0000-0000-000000000001';

  INSERT INTO pharmacy_sales (organization_id, created_by, patient_id)
  VALUES (v_org, auth.uid(),'55555555-5555-5555-5555-555555555555') RETURNING id INTO v_sale;
  INSERT INTO pharmacy_sale_items (sale_id, organization_id, product_id, description, quantity, unit_price)
  VALUES (v_sale, v_org,'aaaaaaaa-0000-0000-0000-000000000001','PARACETAMOL 500',2,35.50);

  PERFORM pharmacy_confirm_sale(v_sale, 'Efectivo');
  v_res := pharmacy_void_sale(v_sale, 'El cliente se arrepintio');

  SELECT * INTO s FROM pharmacy_sales WHERE id = v_sale;
  PERFORM t_eq('estado tras anular', s.status, 'anulada');
  PERFORM t_eq('billing_status tras anular', s.billing_status, 'anulado');
  PERFORM t_ok('queda el motivo firmado', btrim(coalesce(s.void_reason,'')) <> '');

  SELECT COALESCE(sum(quantity),0) INTO v_after FROM inventory_movements
   WHERE product_id='aaaaaaaa-0000-0000-0000-000000000001';
  PERFORM t_eq('el stock vuelve a su sitio', v_after, v_before);

  SELECT * INTO v_cm FROM cash_movements WHERE payment_id = s.payment_id;
  PERFORM t_eq('devolucion registrada en caja', v_cm.movement_type, 'devolucion');
  PERFORM t_eq('devolucion con monto negativo', v_cm.amount, -71.00::numeric);
  PERFORM t_eq('devolucion con motivo tipificado', v_cm.reason_code, 'devolucion_paciente');

  -- Doble anulación: idempotente.
  v_res := pharmacy_void_sale(v_sale, 'otra vez');
  PERFORM t_ok('doble anulacion es idempotente', (v_res->>'already')::boolean);
  PERFORM t_eq('no se duplica la devolucion',
    (SELECT count(*)::int FROM cash_movements WHERE payment_id = s.payment_id), 1);
END $$;

-- El contra-asiento no contamina el CPP (mismo criterio que avgCostByProduct).
SELECT t_eq('CPP intacto tras anular', pharmacy_avg_cost('aaaaaaaa-0000-0000-0000-000000000001'), 25.0000::numeric);

-- ══════════════════ 6. Sin caja abierta no se revierte NADA ══════════════════
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_sale uuid; v_shift uuid; v_err boolean := false;
  v_before numeric; v_after numeric; s pharmacy_sales%ROWTYPE;
BEGIN
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);

  INSERT INTO pharmacy_sales (organization_id, created_by) VALUES (v_org, auth.uid()) RETURNING id INTO v_sale;
  INSERT INTO pharmacy_sale_items (sale_id, organization_id, product_id, description, quantity, unit_price)
  VALUES (v_sale, v_org,'aaaaaaaa-0000-0000-0000-000000000001','PARACETAMOL 500',1,35.50);
  PERFORM pharmacy_confirm_sale(v_sale, 'Efectivo');

  SELECT COALESCE(sum(quantity),0) INTO v_before FROM inventory_movements
   WHERE product_id='aaaaaaaa-0000-0000-0000-000000000001';

  -- Se cierra la caja: ya no hay dónde registrar la devolución.
  SELECT id INTO v_shift FROM cash_shifts WHERE organization_id=v_org AND status='open';
  PERFORM caja_close_shift(v_shift, 0, NULL, NULL, 'cierre de prueba');

  BEGIN
    PERFORM pharmacy_void_sale(v_sale, 'sin caja abierta');
  EXCEPTION WHEN check_violation THEN v_err := true;
  END;

  PERFORM t_ok('anular sin caja abierta se rechaza', v_err);

  SELECT COALESCE(sum(quantity),0) INTO v_after FROM inventory_movements
   WHERE product_id='aaaaaaaa-0000-0000-0000-000000000001';
  PERFORM t_eq('ATOMICIDAD: el stock NO se movio', v_after, v_before);

  SELECT * INTO s FROM pharmacy_sales WHERE id = v_sale;
  PERFORM t_eq('ATOMICIDAD: la venta sigue confirmada', s.status, 'confirmada');
END $$;

-- ══════════════════ 7. Venta a público general ══════════════════
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_sale uuid; v_res jsonb; r record;
BEGIN
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);
  PERFORM caja_open_shift(v_org, 0);

  INSERT INTO pharmacy_sales (organization_id, created_by, customer_label)
  VALUES (v_org, auth.uid(), 'Publico general') RETURNING id INTO v_sale;
  INSERT INTO pharmacy_sale_items (sale_id, organization_id, product_id, description, quantity, unit_price)
  VALUES (v_sale, v_org,'aaaaaaaa-0000-0000-0000-000000000001','PARACETAMOL 500',1,35.50);

  v_res := pharmacy_confirm_sale(v_sale, 'Yape');
  PERFORM t_eq('venta sin paciente se cobra', v_res->>'status', 'confirmada');

  SELECT * INTO r FROM patient_payments WHERE sale_id = v_sale;
  PERFORM t_ok('el cobro no inventa un paciente', r.patient_id IS NULL);
  PERFORM t_eq('tender de Yape', r.tender_kind, 'electronico');
END $$;

-- ══════════════════ 8. get_patient_summary no se contamina ══════════════════
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_pat uuid := '55555555-5555-5555-5555-555555555555';
  v_paid numeric; v_sale uuid;
BEGIN
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);

  -- Un cobro CLÍNICO de 200.
  INSERT INTO patient_payments (organization_id, patient_id, amount, payment_method)
  VALUES (v_org, v_pat, 200.00, 'Efectivo');

  SELECT total_paid INTO v_paid FROM get_patient_summary(v_pat);
  PERFORM t_eq('deuda clinica: solo el cobro clinico', v_paid, 200.00::numeric);

  -- Ahora el paciente compra en la farmacia.
  INSERT INTO pharmacy_sales (organization_id, created_by, patient_id)
  VALUES (v_org, auth.uid(), v_pat) RETURNING id INTO v_sale;
  INSERT INTO pharmacy_sale_items (sale_id, organization_id, product_id, description, quantity, unit_price)
  VALUES (v_sale, v_org,'aaaaaaaa-0000-0000-0000-000000000001','PARACETAMOL 500',1,35.50);
  PERFORM pharmacy_confirm_sale(v_sale, 'Efectivo');

  SELECT total_paid INTO v_paid FROM get_patient_summary(v_pat);
  PERFORM t_eq('la venta de farmacia NO paga consultas', v_paid, 200.00::numeric);
END $$;

-- ══════════════════ 9. Autorización ══════════════════
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_sale uuid; v_err boolean := false;
BEGIN
  -- El borrador lo crea recepción...
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);
  INSERT INTO pharmacy_sales (organization_id, created_by) VALUES (v_org, auth.uid()) RETURNING id INTO v_sale;
  INSERT INTO pharmacy_sale_items (sale_id, organization_id, product_id, description, quantity, unit_price)
  VALUES (v_sale, v_org,'aaaaaaaa-0000-0000-0000-000000000001','P',1,35.50);

  -- ...y el médico intenta cobrarlo.
  PERFORM set_config('test.uid','44444444-4444-4444-4444-444444444444', false);
  BEGIN
    PERFORM pharmacy_confirm_sale(v_sale, 'Efectivo');
  EXCEPTION WHEN insufficient_privilege THEN v_err := true;
  END;
  PERFORM t_ok('el medico no cobra en farmacia', v_err);

  -- Sin el addon 'almacen' tampoco se cobra.
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);
  UPDATE organization_addons SET enabled=false WHERE organization_id=v_org AND addon_key='almacen';
  v_err := false;
  BEGIN
    PERFORM pharmacy_confirm_sale(v_sale, 'Efectivo');
  EXCEPTION WHEN insufficient_privilege THEN v_err := true;
  END;
  PERFORM t_ok('sin addon Almacen no se cobra', v_err);
  UPDATE organization_addons SET enabled=true WHERE organization_id=v_org AND addon_key='almacen';

  -- Cobrar sin método de pago no se puede.
  v_err := false;
  BEGIN
    PERFORM pharmacy_confirm_sale(v_sale, '  ');
  EXCEPTION WHEN check_violation THEN v_err := true;
  END;
  PERFORM t_ok('no se cobra sin metodo de pago', v_err);
END $$;

-- ══════════════════ 10. Una venta cerrada no se toca ══════════════════
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_sale uuid; v_err boolean := false; v_item uuid;
BEGIN
  PERFORM set_config('test.uid','33333333-3333-3333-3333-333333333333', false);
  INSERT INTO pharmacy_sales (organization_id, created_by) VALUES (v_org, auth.uid()) RETURNING id INTO v_sale;
  INSERT INTO pharmacy_sale_items (sale_id, organization_id, product_id, description, quantity, unit_price)
  VALUES (v_sale, v_org,'aaaaaaaa-0000-0000-0000-000000000001','P',1,35.50) RETURNING id INTO v_item;
  PERFORM pharmacy_confirm_sale(v_sale, 'Efectivo');

  BEGIN
    UPDATE pharmacy_sale_items SET quantity = 99 WHERE id = v_item;
  EXCEPTION WHEN check_violation THEN v_err := true;
  END;
  PERFORM t_ok('no se edita la linea de una venta cobrada (trigger, no solo RLS)', v_err);

  v_err := false;
  BEGIN
    DELETE FROM pharmacy_sale_items WHERE id = v_item;
  EXCEPTION WHEN check_violation THEN v_err := true;
  END;
  PERFORM t_ok('no se borra la linea de una venta cobrada', v_err);

  -- El kardex sigue siendo append-only (mig 209) incluso para el POS.
  v_err := false;
  BEGIN
    UPDATE inventory_movements SET quantity = -99 WHERE sale_line_id = v_item;
  EXCEPTION WHEN others THEN v_err := true;
  END;
  PERFORM t_ok('el kardex del POS sigue siendo append-only', v_err);
END $$;

-- ══════════════════ 11. Correlativo: único por org, sin colisión ══════════════════
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_dupes int; v_err boolean := false;
BEGIN
  SELECT count(*)::int INTO v_dupes FROM (
    SELECT organization_id, sale_number FROM pharmacy_sales
     WHERE sale_number IS NOT NULL
     GROUP BY 1,2 HAVING count(*) > 1) q;
  PERFORM t_eq('cero correlativos repetidos', v_dupes, 0);

  -- Y el índice lo impide de verdad.
  BEGIN
    UPDATE pharmacy_sales SET sale_number = 1
     WHERE organization_id = v_org AND sale_number = 2;
  EXCEPTION WHEN unique_violation THEN v_err := true;
  END;
  PERFORM t_ok('el UNIQUE parcial bloquea el correlativo repetido', v_err);
END $$;

-- ══════════════════ 12. Coherencia global del módulo ══════════════════
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*)::int INTO v_bad FROM pharmacy_sales
   WHERE status='confirmada'
     AND total <> subtotal_taxed + subtotal_exempt + subtotal_unaffected + igv_amount;
  PERFORM t_eq('toda venta confirmada reconcilia', v_bad, 0);

  SELECT count(*)::int INTO v_bad FROM pharmacy_sales s
   WHERE s.status='confirmada'
     AND s.total <> (SELECT COALESCE(sum(i.line_total),0) FROM pharmacy_sale_items i WHERE i.sale_id=s.id);
  PERFORM t_eq('la cabecera es la suma de sus lineas', v_bad, 0);

  SELECT count(*)::int INTO v_bad FROM pharmacy_sales
   WHERE status='confirmada' AND (payment_id IS NULL OR sale_number IS NULL);
  PERFORM t_eq('toda venta confirmada tiene cobro y numero', v_bad, 0);

  SELECT count(*)::int INTO v_bad FROM pharmacy_sales WHERE einvoice_id IS NOT NULL;
  PERFORM t_eq('F4 no emitio ni un comprobante electronico', v_bad, 0);

  -- Cada línea de producto de una venta viva tiene exactamente un movimiento.
  SELECT count(*)::int INTO v_bad FROM pharmacy_sale_items i
    JOIN pharmacy_sales s ON s.id = i.sale_id
   WHERE s.status = 'confirmada' AND i.product_id IS NOT NULL AND i.movement_id IS NULL;
  PERFORM t_eq('ninguna linea de producto quedo sin descontar', v_bad, 0);
END $$;

SELECT 'TODAS LAS PRUEBAS PASARON' AS resultado;
