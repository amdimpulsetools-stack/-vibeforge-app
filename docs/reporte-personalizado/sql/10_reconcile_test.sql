-- Reconciliación: TOTAL FINAL (4 secciones) == payments_amount +
-- treatment_payments_amount de get_reports_overview (mig 251 verbatim),
-- con TODOS los casos límite que nombra el brief:
--   precios distintos del mismo servicio, cobro parcial, cita cancelada
--   con cobro, adelanto a cita futura, pago atrasado de cita pasada,
--   abono directo (drawer), anticipo a plan, tratamiento por conceptos,
--   farmacia con descuento de línea, venta anulada con devolución en
--   Caja, devolución de cita, otra org, pago fuera de rango.

CREATE OR REPLACE FUNCTION t_assert_eq(p_name text, p_a numeric, p_b numeric) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_a IS NOT DISTINCT FROM p_b THEN
    RAISE NOTICE 'PASS  %  (=%)', p_name, p_a;
  ELSE
    RAISE EXCEPTION 'FAIL  %  esperado=% obtenido=%', p_name, p_b, p_a;
  END IF;
END $$;

DO $$
DECLARE
  u_owner uuid := '11111111-1111-1111-1111-111111111111';
  u_recep uuid := '22222222-2222-2222-2222-222222222222';
  org_a   uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  org_b   uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  d1 uuid; p1 uuid; svc_cons uuid; svc_ctrl uuid; svc_eco uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; a6 uuid; a7 uuid;
  plan1 uuid; tr1 uuid; c_med uuid; c_hon uuid;
  prod_ovu uuid; prod_par uuid;
  s1 uuid; s2 uuid; s3 uuid; pay_s1 uuid; pay_s2 uuid; pay_s3 uuid; pay_a1 uuid;
  shift1 uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u_owner, 'owner@test'), (u_recep, 'recep@test');
  INSERT INTO organizations (id, name, timezone) VALUES (org_a, 'Clínica A', 'America/Lima'), (org_b, 'Clínica B', 'America/Lima');
  INSERT INTO organization_members (user_id, organization_id, role) VALUES
    (u_owner, org_a, 'owner'), (u_recep, org_a, 'receptionist');
  INSERT INTO addons (key, name) VALUES ('almacen','Almacén'), ('fertility_basic','Fertilidad'), ('caja','Caja');
  INSERT INTO organization_addons (organization_id, addon_key, enabled) VALUES
    (org_a, 'almacen', true), (org_a, 'fertility_basic', true), (org_a, 'caja', true);

  INSERT INTO doctors (organization_id, full_name) VALUES (org_a, 'Dra. Patricia') RETURNING id INTO d1;
  INSERT INTO patients (organization_id, first_name, last_name) VALUES (org_a, 'Ana', 'Pérez') RETURNING id INTO p1;
  INSERT INTO services (organization_id, name, base_price) VALUES (org_a, '1era consulta de fertilidad', 200) RETURNING id INTO svc_cons;
  INSERT INTO services (organization_id, name, base_price) VALUES (org_a, 'Control', 100) RETURNING id INTO svc_ctrl;
  INSERT INTO services (organization_id, name, base_price) VALUES (org_a, 'Ecografía', 150) RETURNING id INTO svc_eco;

  -- Citas del rango 2026-09-01..2026-09-07
  INSERT INTO appointments (organization_id, patient_id, doctor_id, service_id, appointment_date, status, price_snapshot)
    VALUES (org_a, p1, d1, svc_cons, '2026-09-02', 'completed', 200) RETURNING id INTO a1;   -- pagada 200
  INSERT INTO appointments (organization_id, patient_id, doctor_id, service_id, appointment_date, status, price_snapshot)
    VALUES (org_a, p1, d1, svc_cons, '2026-09-03', 'completed', 180) RETURNING id INTO a2;   -- precio pactado, parcial 100 (+80 fuera de rango)
  INSERT INTO appointments (organization_id, patient_id, doctor_id, service_id, appointment_date, status, price_snapshot, discount_amount)
    VALUES (org_a, p1, d1, svc_ctrl, '2026-09-04', 'completed', 100, 20) RETURNING id INTO a3; -- descuento: real 80, pagada 80
  INSERT INTO appointments (organization_id, patient_id, doctor_id, service_id, appointment_date, status, price_snapshot)
    VALUES (org_a, p1, d1, svc_ctrl, '2026-09-05', 'scheduled', 100) RETURNING id INTO a4;   -- sin cobro
  INSERT INTO appointments (organization_id, patient_id, doctor_id, service_id, appointment_date, status, price_snapshot)
    VALUES (org_a, p1, d1, svc_eco, '2026-09-06', 'cancelled', 150) RETURNING id INTO a5;    -- cancelada con cobro 150
  -- Citas fuera del rango
  INSERT INTO appointments (organization_id, patient_id, doctor_id, service_id, appointment_date, status, price_snapshot)
    VALUES (org_a, p1, d1, svc_cons, '2026-09-20', 'scheduled', 200) RETURNING id INTO a6;   -- futura: adelanto 50
  INSERT INTO appointments (organization_id, patient_id, doctor_id, service_id, appointment_date, status, price_snapshot)
    VALUES (org_a, p1, d1, svc_eco, '2026-08-20', 'completed', 150) RETURNING id INTO a7;    -- pasada: pago atrasado 150

  -- Cobros clínicos de citas
  INSERT INTO patient_payments (organization_id, patient_id, appointment_id, amount, payment_method, payment_date)
    VALUES (org_a, p1, a1, 200, 'Efectivo', '2026-09-02') RETURNING id INTO pay_a1;
  INSERT INTO patient_payments (organization_id, patient_id, appointment_id, amount, payment_method, payment_date) VALUES
    (org_a, p1, a2, 100, 'Yape',     '2026-09-03'),
    (org_a, p1, a2,  80, 'Yape',     '2026-09-10'),   -- fuera de rango
    (org_a, p1, a3,  80, 'Efectivo', '2026-09-04'),
    (org_a, p1, a5, 150, 'Tarjeta',  '2026-09-06'),
    (org_a, p1, a6,  50, 'Efectivo', '2026-09-05'),   -- adelanto cita futura
    (org_a, p1, a7, 150, 'Efectivo', '2026-09-01');   -- pago atrasado cita pasada
  -- Abono directo (drawer, "-- Ninguna --")
  INSERT INTO patient_payments (organization_id, patient_id, amount, payment_method, payment_date, notes)
    VALUES (org_a, p1, 300, 'Transferencia', '2026-09-02', 'A cuenta');
  -- Anticipo a plan (budgets-panel)
  INSERT INTO treatment_plans (organization_id, patient_id, title) VALUES (org_a, p1, 'Plan Fisio') RETURNING id INTO plan1;
  INSERT INTO patient_payments (organization_id, patient_id, treatment_plan_id, amount, payment_method, payment_date, notes)
    VALUES (org_a, p1, plan1, 400, 'Efectivo', '2026-09-03', 'Anticipo al plan');

  -- Tratamiento con conceptos (mig 242)
  INSERT INTO treatment_payment_concepts (organization_id, key, label, revenue_bucket) VALUES
    (org_a, 'medicacion', 'Medicación', 'third_party') RETURNING id INTO c_med;
  INSERT INTO treatment_payment_concepts (organization_id, key, label, revenue_bucket) VALUES
    (org_a, 'honorarios_aspiracion', 'Honorarios — aspiración', 'honorarium') RETURNING id INTO c_hon;
  INSERT INTO treatments (organization_id, patient_id, doctor_id, treatment_type, title, expected_total)
    VALUES (org_a, p1, d1, 'FIV', 'FIV', 20000) RETURNING id INTO tr1;
  INSERT INTO patient_payments (organization_id, patient_id, treatment_id, treatment_concept_id, revenue_bucket, amount, payment_method, payment_date, source) VALUES
    (org_a, p1, tr1, c_med, 'third_party', 1200, 'Efectivo', '2026-09-02', 'clinical'),
    (org_a, p1, tr1, c_hon, 'honorarium',  2500, 'Tarjeta',  '2026-09-06', 'clinical'),
    (org_a, p1, tr1, c_med, 'third_party',  800, 'Efectivo', '2026-09-07', 'clinical');

  -- Farmacia: 2 ventas confirmadas + 1 anulada (emulando pharmacy_confirm_sale)
  INSERT INTO inventory_products (organization_id, name, sale_price) VALUES (org_a, 'Ovusitol', 45) RETURNING id INTO prod_ovu;
  INSERT INTO inventory_products (organization_id, name, sale_price) VALUES (org_a, 'Paracetamol', 2.5) RETURNING id INTO prod_par;

  INSERT INTO pharmacy_sales (organization_id, status, sale_number, sale_date, patient_id) VALUES (org_a, 'borrador', 1, '2026-09-02', p1) RETURNING id INTO s1;
  INSERT INTO pharmacy_sale_items (sale_id, organization_id, position, product_id, description, quantity, unit_price, line_discount) VALUES
    (s1, org_a, 1, prod_ovu, 'Ovusitol', 2, 45, 0),
    (s1, org_a, 2, prod_par, 'Paracetamol', 3, 2.5, 0.5);
  INSERT INTO patient_payments (organization_id, patient_id, amount, payment_method, payment_date, notes, source, sale_id)
    SELECT org_a, p1, SUM(line_total), 'Efectivo', '2026-09-02', 'Farmacia NV-000001', 'pos', s1 FROM pharmacy_sale_items WHERE sale_id = s1
    RETURNING id INTO pay_s1;
  UPDATE pharmacy_sales SET status = 'confirmada', payment_id = pay_s1,
    total = (SELECT SUM(line_total) FROM pharmacy_sale_items WHERE sale_id = s1) WHERE id = s1;

  INSERT INTO pharmacy_sales (organization_id, status, sale_number, sale_date, patient_id, appointment_id) VALUES (org_a, 'borrador', 2, '2026-09-05', p1, a1) RETURNING id INTO s2;
  INSERT INTO pharmacy_sale_items (sale_id, organization_id, position, product_id, description, quantity, unit_price) VALUES
    (s2, org_a, 1, prod_ovu, 'Ovusitol', 1, 45);
  -- venta pos VINCULADA a la cita a1 (appointment_id): debe seguir en farmacia, no en servicios
  INSERT INTO patient_payments (organization_id, patient_id, appointment_id, amount, payment_method, payment_date, notes, source, sale_id)
    VALUES (org_a, p1, a1, 45, 'Yape', '2026-09-05', 'Farmacia NV-000002', 'pos', s2) RETURNING id INTO pay_s2;
  UPDATE pharmacy_sales SET status = 'confirmada', payment_id = pay_s2, total = 45 WHERE id = s2;

  INSERT INTO pharmacy_sales (organization_id, status, sale_number, sale_date, patient_id) VALUES (org_a, 'borrador', 3, '2026-09-06', p1) RETURNING id INTO s3;
  INSERT INTO pharmacy_sale_items (sale_id, organization_id, position, product_id, description, quantity, unit_price) VALUES
    (s3, org_a, 1, prod_ovu, 'Ovusitol', 1, 45);
  INSERT INTO patient_payments (organization_id, patient_id, amount, payment_method, payment_date, notes, source, sale_id)
    VALUES (org_a, p1, 45, 'Efectivo', '2026-09-06', 'Farmacia NV-000003', 'pos', s3) RETURNING id INTO pay_s3;
  UPDATE pharmacy_sales SET status = 'anulada', payment_id = pay_s3, total = 45, void_reason = 'error' WHERE id = s3;

  -- Caja: devolución de la venta anulada y devolución de la cita a1
  INSERT INTO cash_shifts (organization_id, status) VALUES (org_a, 'open') RETURNING id INTO shift1;
  INSERT INTO cash_movements (organization_id, shift_id, movement_type, amount, reason_code, payment_id, created_at) VALUES
    (org_a, shift1, 'devolucion', -45, 'devolucion_paciente', pay_s3, '2026-09-06 15:00-05'),
    (org_a, shift1, 'devolucion', -50, 'devolucion_paciente', pay_a1, '2026-09-07 21:30-05'); -- 21:30 Lima = 02:30 UTC del 8: debe contar el 7

  -- Otra org con cobros en el rango: jamás debe entrar
  INSERT INTO patient_payments (organization_id, amount, payment_date) VALUES (org_b, 9999, '2026-09-03');
END $$;

-- ─────────────────────────────────────────────────────────────────
-- Ejecutar como el owner de la org A
SET test.uid = '11111111-1111-1111-1111-111111111111';

DO $$
DECLARE
  r   json;
  ov  json;
  sec json;
BEGIN
  r  := get_custom_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', '2026-09-07', NULL);
  ov := get_reports_overview('2026-09-01', '2026-09-07');   -- mig 251 verbatim

  RAISE NOTICE 'custom_report = %', jsonb_pretty(r::jsonb);

  -- Cubetas esperadas a mano
  PERFORM t_assert_eq('period_appointments (SERVICIOS)',   (r->'reconciliation'->'collected_breakdown'->>'period_appointments')::numeric, 530);
  PERFORM t_assert_eq('other_appointments',                (r->'reconciliation'->'collected_breakdown'->>'other_appointments')::numeric, 200);
  PERFORM t_assert_eq('other (abono directo)',             (r->'reconciliation'->'collected_breakdown'->>'other')::numeric, 300);
  PERFORM t_assert_eq('plans',                             (r->'reconciliation'->'collected_breakdown'->>'plans')::numeric, 400);
  PERFORM t_assert_eq('pharmacy (incluye anulada)',        (r->'reconciliation'->'collected_breakdown'->>'pharmacy')::numeric, 187);
  PERFORM t_assert_eq('treatment_payments_amount',         (r->'reconciliation'->>'treatment_payments_amount')::numeric, 4500);

  -- Totales de sección == cubetas
  PERFORM t_assert_eq('SERVICIOS.total == period_appointments',
    (r->'sections'->'services'->>'total')::numeric, (r->'reconciliation'->'collected_breakdown'->>'period_appointments')::numeric);
  PERFORM t_assert_eq('ABONOS.total == other_appointments+other+plans',
    (r->'sections'->'advances'->>'total')::numeric, 200 + 300 + 400);
  PERFORM t_assert_eq('FARMACIA.total == pharmacy',
    (r->'sections'->'pharmacy'->>'total')::numeric, (r->'reconciliation'->'collected_breakdown'->>'pharmacy')::numeric);
  PERFORM t_assert_eq('TRATAMIENTOS.total == treatment_payments_amount',
    (r->'sections'->'treatments'->>'total')::numeric, (r->'reconciliation'->>'treatment_payments_amount')::numeric);

  -- Σ filas == total de sección (ninguna fila se pierde en la agrupación)
  PERFORM t_assert_eq('Σ filas SERVICIOS',   (SELECT SUM((x->>'total')::numeric) FROM json_array_elements(r->'sections'->'services'->'rows') x),   530);
  PERFORM t_assert_eq('Σ filas ABONOS',      (SELECT SUM((x->>'total')::numeric) FROM json_array_elements(r->'sections'->'advances'->'rows') x),   900);
  PERFORM t_assert_eq('Σ filas FARMACIA',    (SELECT SUM((x->>'total')::numeric) FROM json_array_elements(r->'sections'->'pharmacy'->'rows') x),   187);
  PERFORM t_assert_eq('Σ filas TRATAMIENTOS',(SELECT SUM((x->>'total')::numeric) FROM json_array_elements(r->'sections'->'treatments'->'rows') x), 4500);

  -- TOTAL FINAL == payments_amount + treatment_payments_amount (get_reports_overview mig 251)
  PERFORM t_assert_eq('TOTAL FINAL == overview.payments_amount + treatment_payments_amount',
    (r->>'grand_total')::numeric,
    (ov->'totals'->>'payments_amount')::numeric + (ov->'totals'->>'treatment_payments_amount')::numeric);
  PERFORM t_assert_eq('TOTAL FINAL (valor)', (r->>'grand_total')::numeric, 6117);
  PERFORM t_assert_eq('overview.payments_amount', (ov->'totals'->>'payments_amount')::numeric, 1617);
  PERFORM t_assert_eq('overview.period_appointments == Σ doctors[].collected',
    (ov->'totals'->'collected_breakdown'->>'period_appointments')::numeric,
    (SELECT SUM((d->>'collected')::numeric) FROM json_array_elements(ov->'doctors') d));

  -- Detalle de filas
  PERFORM t_assert_eq('Consulta: 2 citas cobradas', (SELECT (x->>'quantity')::numeric FROM json_array_elements(r->'sections'->'services'->'rows') x WHERE x->>'description' = '1era consulta de fertilidad'), 2);
  PERFORM t_assert_eq('Consulta: precio NULL (varios 180/200)', (SELECT CASE WHEN x->>'price' IS NULL THEN 1 ELSE 0 END FROM json_array_elements(r->'sections'->'services'->'rows') x WHERE x->>'description' = '1era consulta de fertilidad'), 1);
  PERFORM t_assert_eq('Consulta: producción (services[].revenue mig 198) = 380', (SELECT (x->>'production_total')::numeric FROM json_array_elements(r->'sections'->'services'->'rows') x WHERE x->>'description' = '1era consulta de fertilidad'), 380);
  PERFORM t_assert_eq('Control: precio real con descuento = 80', (SELECT (x->>'price')::numeric FROM json_array_elements(r->'sections'->'services'->'rows') x WHERE x->>'description' = 'Control'), 80);
  PERFORM t_assert_eq('Ecografía cancelada con cobro cuenta (mig 251)', (SELECT (x->>'total')::numeric FROM json_array_elements(r->'sections'->'services'->'rows') x WHERE x->>'description' = 'Ecografía'), 150);
  PERFORM t_assert_eq('Ovusitol qty 3 (anulada fuera)', (SELECT (x->>'quantity')::numeric FROM json_array_elements(r->'sections'->'pharmacy'->'rows') x WHERE x->>'description' = 'Ovusitol'), 3);
  PERFORM t_assert_eq('Paracetamol total 7.00 (descuento de línea)', (SELECT (x->>'total')::numeric FROM json_array_elements(r->'sections'->'pharmacy'->'rows') x WHERE x->>'description' = 'Paracetamol'), 7.00);
  PERFORM t_assert_eq('Fila ventas anuladas = 45', (SELECT (x->>'total')::numeric FROM json_array_elements(r->'sections'->'pharmacy'->'rows') x WHERE (x->>'voided')::boolean), 45);
  PERFORM t_assert_eq('Medicación: 2 cobros', (SELECT (x->>'quantity')::numeric FROM json_array_elements(r->'sections'->'treatments'->'rows') x WHERE x->>'description' = 'Medicación'), 2);
  PERFORM t_assert_eq('Adelanto cita futura = 50', (SELECT (x->>'total')::numeric FROM json_array_elements(r->'sections'->'advances'->'rows') x WHERE x->>'kind' = 'appointment_future'), 50);
  PERFORM t_assert_eq('Pago atrasado cita pasada = 150', (SELECT (x->>'total')::numeric FROM json_array_elements(r->'sections'->'advances'->'rows') x WHERE x->>'kind' = 'appointment_past'), 150);
  PERFORM t_assert_eq('Devoluciones en Caja (informativo, fecha civil Lima) = -95', (r->'reconciliation'->>'refunds_in_range')::numeric, -95);

  -- Secciones parciales: TOTAL FINAL = Σ de las marcadas
  r := get_custom_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', '2026-09-07', ARRAY['services','pharmacy']);
  PERFORM t_assert_eq('Solo SERVICIOS+FARMACIA', (r->>'grand_total')::numeric, 530 + 187);
  PERFORM t_assert_eq('sección no marcada viene NULL', (CASE WHEN r->'sections'->'treatments' IS NULL OR json_typeof(r->'sections'->'treatments') = 'null' THEN 1 ELSE 0 END), 1);

  -- "Hoy" por defecto: p_from/p_to NULL ⇒ hoy civil de la org (sin excepción)
  r := get_custom_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  PERFORM t_assert_eq('hoy: from == to', (CASE WHEN r->'range'->>'from' = r->'range'->>'to' THEN 1 ELSE 0 END), 1);
END $$;

-- Robustez: alguien edita el monto de un cobro POS (policy UPDATE mig 008)
-- ⇒ aparece la fila de ajuste y FARMACIA sigue cuadrando con la cubeta.
DO $$
DECLARE r json;
BEGIN
  UPDATE patient_payments SET amount = amount + 10 WHERE notes = 'Farmacia NV-000001';
  r := get_custom_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', '2026-09-07', NULL);
  PERFORM t_assert_eq('cobro POS editado: fila de ajuste = 10', (SELECT (x->>'total')::numeric FROM json_array_elements(r->'sections'->'pharmacy'->'rows') x WHERE x->>'description' LIKE 'Ajuste%'), 10);
  PERFORM t_assert_eq('cobro POS editado: FARMACIA.total == pharmacy', (r->'sections'->'pharmacy'->>'total')::numeric, (r->'reconciliation'->'collected_breakdown'->>'pharmacy')::numeric);
  PERFORM t_assert_eq('cobro POS editado: TOTAL FINAL sigue cuadrando', (r->>'grand_total')::numeric, (r->'reconciliation'->>'expected_grand_total')::numeric);
  UPDATE patient_payments SET amount = amount - 10 WHERE notes = 'Farmacia NV-000001';
END $$;

-- Gating: recepcionista ⇒ forbidden
SET test.uid = '22222222-2222-2222-2222-222222222222';
DO $$
BEGIN
  PERFORM get_custom_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', '2026-09-07', NULL);
  RAISE EXCEPTION 'FAIL  recepcionista pudo ejecutar el reporte';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'forbidden' THEN RAISE NOTICE 'PASS  gating: receptionist ⇒ forbidden';
  ELSE RAISE; END IF;
END $$;

-- Gating: owner de A pidiendo la org B ⇒ forbidden
SET test.uid = '11111111-1111-1111-1111-111111111111';
DO $$
BEGIN
  PERFORM get_custom_report('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-09-01', '2026-09-07', NULL);
  RAISE EXCEPTION 'FAIL  owner de A leyó la org B';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'forbidden' THEN RAISE NOTICE 'PASS  gating: otra org ⇒ forbidden';
  ELSE RAISE; END IF;
END $$;

-- Plan de ejecución (volumen de prueba, solo para ver los índices elegidos)
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF, SUMMARY OFF)
SELECT get_custom_report('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', '2026-09-07', NULL);

SELECT 'TODAS LAS ASERCIONES PASARON' AS resultado;
