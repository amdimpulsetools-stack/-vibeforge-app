-- ═══════════════════════════════════════════════════════════════════
-- Migs 270 (asignar unidades "sin lote") y 271 (editar producto),
-- ejecutadas como `authenticated` real (la RLS y los permisos cuentan).
--
-- 270 defiende una frase: asignar lote cambia DE QUÉ LOTE son las
-- unidades, nunca CUÁNTAS hay ni CUÁNTO costaron.
-- 271: renombrar no reescribe nada emitido y no duplica activos.
-- Corre después de 10_/20_ (reusa la org 1111 y sus usuarios, y los
-- GRANT de 20_).
-- ═══════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

-- Tablas nuevas de 270/271 (creadas antes del GRANT de 20_, pero por si acaso).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

CREATE OR REPLACE FUNCTION t_raises(p_name text, p_sql text, p_like text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE p_like THEN
      RAISE NOTICE 'PASS  %  (%)', p_name, SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL  %  error inesperado: %', p_name, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL  %  no falló', p_name;
END $$;
GRANT EXECUTE ON FUNCTION t_raises(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION t_eq(text, anyelement, anyelement) TO authenticated;
GRANT EXECUTE ON FUNCTION t_ok(text, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION t_stock(p uuid) RETURNS numeric LANGUAGE sql AS
  $$ SELECT COALESCE(sum(quantity),0) FROM inventory_movements WHERE product_id = p $$;
CREATE OR REPLACE FUNCTION t_unlotted(p uuid) RETURNS numeric LANGUAGE sql AS
  $$ SELECT COALESCE(sum(quantity),0) FROM inventory_movements WHERE product_id = p AND lot_id IS NULL $$;
CREATE OR REPLACE FUNCTION t_lot(l uuid) RETURNS numeric LANGUAGE sql AS
  $$ SELECT COALESCE(sum(quantity),0) FROM inventory_movements WHERE lot_id = l $$;
GRANT EXECUTE ON FUNCTION t_stock(uuid), t_unlotted(uuid), t_lot(uuid) TO authenticated;

-- ══════════════════ Fixtures (superusuario) ══════════════════
-- X = el caso Adaptessens: lote 25-006 anulado a 0, 25-075 con 17 y 1 und
--     que entró sin lote. Stock 18.
-- Y = lote inflado: entraron 10 al lote C-1, salieron 4 sin lote. Stock 6.
-- Z = 5 und sin ningún lote.
DO $$
DECLARE
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  X uuid := 'cccccccc-0000-0000-0000-00000000000a';
  Y uuid := 'cccccccc-0000-0000-0000-00000000000b';
  Z uuid := 'cccccccc-0000-0000-0000-00000000000c';
  W uuid := 'cccccccc-0000-0000-0000-00000000000d';
  e1 uuid;
BEGIN
  PERFORM set_config('test.uid','22222222-2222-2222-2222-222222222222', false);
  INSERT INTO inventory_products (id, organization_id, name, sale_price, track_lots) VALUES
    (X, v_org, 'ADAPTESSENS TEST', 150, false),
    (Y, v_org, 'LETROZOL TEST', 10, false),
    (Z, v_org, 'GUANTES TEST', 1, true);
  INSERT INTO inventory_products (id, organization_id, name, sale_price, is_discontinued, discontinued_at, discontinued_reason)
    VALUES (W, v_org, 'ARCHIVADO TEST', 1, true, now(), 'Ya no se vende');
  INSERT INTO inventory_lots (id, organization_id, product_id, lot_code, expiry_date, unit_cost, received_at) VALUES
    ('dddddddd-0000-0000-0000-000000000006', v_org, X, '25-006', '2027-05-31', 0, current_date - 30),
    ('dddddddd-0000-0000-0000-000000000075', v_org, X, '25-075', '2027-05-31', 101.60, current_date - 30),
    ('dddddddd-0000-0000-0000-0000000000c1', v_org, Y, 'C-1', '2027-01-31', 5, current_date - 20);
  INSERT INTO inventory_movements (id, organization_id, product_id, lot_id, movement_type, quantity, unit_cost, reason_code, movement_date)
    VALUES (gen_random_uuid(), v_org, X, 'dddddddd-0000-0000-0000-000000000006', 'entrada', 17, 0, 'compra', current_date - 30)
    RETURNING id INTO e1;
  INSERT INTO inventory_movements (organization_id, product_id, lot_id, movement_type, quantity, unit_cost, reason_code, reverses_movement_id, movement_date) VALUES
    (v_org, X, 'dddddddd-0000-0000-0000-000000000006', 'ajuste', -17, 0, 'error_registro', e1, current_date - 29);
  INSERT INTO inventory_movements (organization_id, product_id, lot_id, movement_type, quantity, unit_cost, reason_code, movement_date) VALUES
    (v_org, X, 'dddddddd-0000-0000-0000-000000000075', 'entrada', 17, 86.1017, 'compra', current_date - 30),
    (v_org, X, NULL, 'entrada', 1, 86.1017, 'compra', current_date - 3),
    (v_org, Y, 'dddddddd-0000-0000-0000-0000000000c1', 'entrada', 10, 5, 'compra', current_date - 20),
    (v_org, Z, NULL, 'entrada', 5, 3, 'saldo_inicial', current_date - 40);
  INSERT INTO inventory_movements (organization_id, product_id, lot_id, movement_type, quantity, unit_cost, unit_sale_price, reason_code, movement_date) VALUES
    (v_org, Y, NULL, 'salida', -4, 5, 10, 'venta', current_date - 2);
  -- El doctor tiene permiso de almacén (mig 267); recepción no.
  UPDATE organization_members SET can_manage_inventory = true
   WHERE user_id = '44444444-4444-4444-4444-444444444444';
  -- Catálogo de recetas importado de X, y uno renombrado a mano por la médica.
  INSERT INTO medication_catalog (organization_id, name, inventory_product_id) VALUES
    (v_org, 'ADAPTESSENS TEST', X),
    (v_org, 'Guantes de examen (a mano)', Z);
END $$;

SELECT t_eq('fixture: X stock 18', t_stock('cccccccc-0000-0000-0000-00000000000a'), 18::numeric);
SELECT t_eq('fixture: X sin lote 1', t_unlotted('cccccccc-0000-0000-0000-00000000000a'), 1::numeric);
SELECT t_eq('fixture: Y sin lote -4 (lote inflado)', t_unlotted('cccccccc-0000-0000-0000-00000000000b'), -4::numeric);

CREATE TEMP TABLE t_before AS
SELECT pharmacy_avg_cost('cccccccc-0000-0000-0000-00000000000a') AS cpp_x,
       pharmacy_avg_cost('cccccccc-0000-0000-0000-00000000000b') AS cpp_y,
       pharmacy_avg_cost('cccccccc-0000-0000-0000-00000000000c') AS cpp_z;
GRANT SELECT ON t_before TO authenticated;

-- ══════════════════ 270: como editor (admin) ══════════════════
SET ROLE authenticated;
SET test.uid = '22222222-2222-2222-2222-222222222222';

SELECT t_raises('270 lote nuevo no puede repetir código',
  $q$SELECT inventory_assign_unlotted('cccccccc-0000-0000-0000-00000000000a', 1, NULL, '25-075', NULL, 'Conteo')$q$,
  '%ya tiene un lote "25-075"%');
SELECT inventory_assign_unlotted('cccccccc-0000-0000-0000-00000000000a', 1,
  'dddddddd-0000-0000-0000-000000000075', NULL, NULL, 'Conteo físico');
SELECT t_eq('270 asignar: stock intacto', t_stock('cccccccc-0000-0000-0000-00000000000a'), 18::numeric);
SELECT t_eq('270 asignar: sin lote queda en 0', t_unlotted('cccccccc-0000-0000-0000-00000000000a'), 0::numeric);
SELECT t_eq('270 asignar: 25-075 pasa a 18', t_lot('dddddddd-0000-0000-0000-000000000075'), 18::numeric);
SELECT t_eq('270 asignar: CPP intacto', pharmacy_avg_cost('cccccccc-0000-0000-0000-00000000000a'), (SELECT cpp_x FROM t_before));

SELECT t_raises('270 no asigna más de lo que hay sin lote',
  $q$SELECT inventory_assign_unlotted('cccccccc-0000-0000-0000-00000000000a', 1, 'dddddddd-0000-0000-0000-000000000075', NULL, NULL, 'otra vez')$q$,
  '%Solo hay 0%');
SELECT t_raises('270 motivo obligatorio',
  $q$SELECT inventory_assign_unlotted('cccccccc-0000-0000-0000-00000000000c', 1, NULL, 'N-1', NULL, ' ')$q$,
  '%motivo%');
SELECT t_raises('270 lote existente o nuevo, no ambos',
  $q$SELECT inventory_assign_unlotted('cccccccc-0000-0000-0000-00000000000c', 1, 'dddddddd-0000-0000-0000-000000000075', 'N-1', NULL, 'Conteo')$q$,
  '%uno de los dos%');
SELECT t_raises('270 el lote tiene que ser del producto',
  $q$SELECT inventory_assign_unlotted('cccccccc-0000-0000-0000-00000000000c', 1, 'dddddddd-0000-0000-0000-000000000075', NULL, NULL, 'Conteo')$q$,
  '%no pertenece%');

-- Una fila de asignación no se escribe a mano ni se deshace suelta.
SELECT t_raises('270 la fila de asignación no se inserta a mano',
  $q$INSERT INTO inventory_movements (organization_id, product_id, movement_type, quantity, unit_cost, reason_code, lot_assignment_id, created_by)
     VALUES ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-00000000000a','ajuste',5,1,'asignacion_lote',
             (SELECT id FROM inventory_lot_assignments LIMIT 1),'22222222-2222-2222-2222-222222222222')$q$,
  '%solo se registran%');
SELECT t_raises('270 el motivo asignacion_lote exige la asignación',
  $q$INSERT INTO inventory_movements (organization_id, product_id, movement_type, quantity, unit_cost, reason_code, created_by)
     VALUES ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-00000000000a','ajuste',5,1,'asignacion_lote',
             '22222222-2222-2222-2222-222222222222')$q$,
  '%inv_mov_lot_assignment_chk%');
SELECT t_raises('270 una fila del par no se deshace sola',
  $q$INSERT INTO inventory_movements (organization_id, product_id, movement_type, quantity, unit_cost, reason_code, reverses_movement_id, created_by)
     VALUES ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-00000000000a','ajuste',1,1,'error_registro',
             (SELECT id FROM inventory_movements WHERE lot_assignment_id IS NOT NULL AND quantity < 0 LIMIT 1),
             '22222222-2222-2222-2222-222222222222')$q$,
  '%no se deshace fila por fila%');

-- Lote inflado: descontar de C-1 las 4 que salieron sin lote.
SELECT inventory_assign_unlotted('cccccccc-0000-0000-0000-00000000000b', -4,
  'dddddddd-0000-0000-0000-0000000000c1', NULL, NULL, 'Conteo físico');
SELECT t_eq('270 descontar: stock intacto', t_stock('cccccccc-0000-0000-0000-00000000000b'), 6::numeric);
SELECT t_eq('270 descontar: sin lote vuelve a 0', t_unlotted('cccccccc-0000-0000-0000-00000000000b'), 0::numeric);
SELECT t_eq('270 descontar: C-1 queda en 6', t_lot('dddddddd-0000-0000-0000-0000000000c1'), 6::numeric);
SELECT t_eq('270 descontar: CPP intacto', pharmacy_avg_cost('cccccccc-0000-0000-0000-00000000000b'), (SELECT cpp_y FROM t_before));
SELECT t_raises('270 no descuenta más de lo que salió sin lote',
  $q$SELECT inventory_assign_unlotted('cccccccc-0000-0000-0000-00000000000b', -1, 'dddddddd-0000-0000-0000-0000000000c1', NULL, NULL, 'Conteo')$q$,
  '%Solo salieron 0%');

-- Lote nuevo: toma costo y fecha de la entrada que llegó sin lote.
SELECT inventory_assign_unlotted('cccccccc-0000-0000-0000-00000000000c', 5, NULL, 'G-2027', '2027-12-31', 'Conteo físico');
SELECT t_eq('270 lote nuevo: stock intacto', t_stock('cccccccc-0000-0000-0000-00000000000c'), 5::numeric);
SELECT t_eq('270 lote nuevo: todo asignado', t_unlotted('cccccccc-0000-0000-0000-00000000000c'), 0::numeric);
SELECT t_eq('270 lote nuevo: costo de la entrada sin lote',
  (SELECT unit_cost FROM inventory_lots WHERE product_id = 'cccccccc-0000-0000-0000-00000000000c' AND lot_code = 'G-2027'), 3::numeric);
SELECT t_eq('270 lote nuevo: recibido cuando entraron',
  (SELECT received_at FROM inventory_lots WHERE product_id = 'cccccccc-0000-0000-0000-00000000000c' AND lot_code = 'G-2027'), current_date - 40);
SELECT t_eq('270 lote nuevo: CPP intacto', pharmacy_avg_cost('cccccccc-0000-0000-0000-00000000000c'), (SELECT cpp_z FROM t_before));
SELECT t_eq('270 auditoría: 3 asignaciones', (SELECT count(*)::int FROM inventory_lot_assignments), 3);
SELECT t_eq('270 kardex: 6 filas asignacion_lote que netean 0',
  (SELECT count(*)::int || '/' || sum(quantity)::text FROM inventory_movements WHERE reason_code = 'asignacion_lote'), '6/0.000');

-- Recepción sin permiso de almacén.
SET test.uid = '33333333-3333-3333-3333-333333333333';
SELECT t_raises('270 recepción sin permiso no asigna',
  $q$SELECT inventory_assign_unlotted('cccccccc-0000-0000-0000-00000000000a', 1, 'dddddddd-0000-0000-0000-000000000075', NULL, NULL, 'Conteo')$q$,
  '%forbidden%');

-- ══════════════════ 271: editar producto ══════════════════
SET test.uid = '22222222-2222-2222-2222-222222222222';
SELECT inventory_update_product('cccccccc-0000-0000-0000-00000000000a',
  '  Adaptessens   60 caps ', 'Vitaminas', 'FRASCO', 2, true, 'Nombre mal digitado');
SELECT t_eq('271 nombre sin espacios dobles',
  (SELECT name FROM inventory_products WHERE id = 'cccccccc-0000-0000-0000-00000000000a'), 'Adaptessens 60 caps');
SELECT t_eq('271 historial: 5 campos con motivo',
  (SELECT count(*)::int FROM inventory_product_changes
    WHERE product_id = 'cccccccc-0000-0000-0000-00000000000a' AND reason = 'Nombre mal digitado'), 5);
SELECT t_eq('271 historial guarda el nombre anterior',
  (SELECT old_value FROM inventory_product_changes
    WHERE product_id = 'cccccccc-0000-0000-0000-00000000000a' AND field = 'name'), 'ADAPTESSENS TEST');
SELECT t_eq('271 catálogo importado sigue al producto',
  (SELECT name FROM medication_catalog WHERE inventory_product_id = 'cccccccc-0000-0000-0000-00000000000a'), 'Adaptessens 60 caps');
SELECT t_eq('271 track_lots encendido',
  (SELECT track_lots FROM inventory_products WHERE id = 'cccccccc-0000-0000-0000-00000000000a'), true);

SELECT t_raises('271 no duplica un activo (mayúsculas/espacios)',
  $q$SELECT inventory_update_product('cccccccc-0000-0000-0000-00000000000a', ' paracetamol 500', 'Vitaminas', 'FRASCO', 2, true, NULL)$q$,
  '%Ya existe otro producto activo%');
SELECT t_raises('271 sin cambios',
  $q$SELECT inventory_update_product('cccccccc-0000-0000-0000-00000000000a', 'Adaptessens 60 caps', 'Vitaminas', 'FRASCO', 2, true, NULL)$q$,
  '%No hay cambios%');
SELECT t_raises('271 nombre vacío',
  $q$SELECT inventory_update_product('cccccccc-0000-0000-0000-00000000000a', '   ', 'Vitaminas', 'FRASCO', 2, true, NULL)$q$,
  '%vacío%');

-- Renombrar un catálogo editado a mano: no se toca.
SELECT inventory_update_product('cccccccc-0000-0000-0000-00000000000c', 'Guantes nitrilo M', NULL, 'CAJA', 0, true, NULL);
SELECT t_eq('271 catálogo renombrado a mano se respeta',
  (SELECT name FROM medication_catalog WHERE inventory_product_id = 'cccccccc-0000-0000-0000-00000000000c'), 'Guantes de examen (a mano)');

-- Archivado: owner/admin sí; el doctor con permiso de almacén no.
SET test.uid = '44444444-4444-4444-4444-444444444444';
SELECT t_raises('271 doctor con permiso no edita un archivado',
  $q$SELECT inventory_update_product('cccccccc-0000-0000-0000-00000000000d', 'ARCHIVADO TEST 2', NULL, 'UND', 0, false, NULL)$q$,
  '%forbidden%');
SELECT inventory_update_product('cccccccc-0000-0000-0000-00000000000b', 'Letrozol 2.5 mg', NULL, 'CAJA', 0, false, NULL);
SELECT t_eq('271 doctor con permiso edita un activo',
  (SELECT name FROM inventory_products WHERE id = 'cccccccc-0000-0000-0000-00000000000b'), 'Letrozol 2.5 mg');

SET test.uid = '22222222-2222-2222-2222-222222222222';
SELECT inventory_update_product('cccccccc-0000-0000-0000-00000000000d', 'ARCHIVADO TEST (viejo)', NULL, 'UND', 0, false, 'Liberar el nombre');
SELECT t_eq('271 admin renombra un archivado',
  (SELECT name FROM inventory_products WHERE id = 'cccccccc-0000-0000-0000-00000000000d'), 'ARCHIVADO TEST (viejo)');

SET test.uid = '33333333-3333-3333-3333-333333333333';
SELECT t_raises('271 recepción sin permiso no edita',
  $q$SELECT inventory_update_product('cccccccc-0000-0000-0000-00000000000b', 'Otro nombre', NULL, 'CAJA', 0, false, NULL)$q$,
  '%forbidden%');

-- Un UPDATE directo (PostgREST de un editor) también deja historial.
RESET ROLE;
UPDATE inventory_products SET min_stock = 9 WHERE id = 'cccccccc-0000-0000-0000-00000000000b';
SELECT t_eq('271 UPDATE directo también queda en el historial',
  (SELECT new_value FROM inventory_product_changes
    WHERE product_id = 'cccccccc-0000-0000-0000-00000000000b' AND field = 'min_stock'
    ORDER BY changed_at DESC LIMIT 1), '9.000');

SELECT 'LOTES Y EDICIÓN: TODAS LAS PRUEBAS PASARON' AS resultado;
