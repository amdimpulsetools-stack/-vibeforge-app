-- ═══════════════════════════════════════════════════════════════════
-- Mig 272: recepción pasa a SU caja los cobros "fuera de turno".
-- Org propia (7777…) para no depender del estado que dejan 10_/20_.
-- ═══════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_org uuid := '77777777-7777-7777-7777-777777777777';
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    ('77777777-0000-0000-0000-00000000000a','admin7@t.com'),
    ('77777777-0000-0000-0000-00000000000b','recep7@t.com'),
    ('77777777-0000-0000-0000-00000000000c','recep7b@t.com'),
    ('77777777-0000-0000-0000-00000000000d','doc7@t.com');
  INSERT INTO organizations (id, name, owner_id) VALUES (v_org, 'Clinica Caja', '77777777-0000-0000-0000-00000000000a');
  INSERT INTO organization_members (user_id, organization_id, role) VALUES
    ('77777777-0000-0000-0000-00000000000a', v_org, 'admin'),
    ('77777777-0000-0000-0000-00000000000b', v_org, 'receptionist'),
    ('77777777-0000-0000-0000-00000000000c', v_org, 'receptionist'),
    ('77777777-0000-0000-0000-00000000000d', v_org, 'doctor');
  -- Caja configurada hace 30 días; el addon se REACTIVÓ ayer.
  INSERT INTO organization_addons (organization_id, addon_key, enabled, activated_at)
    VALUES (v_org, 'caja', true, now() - interval '1 day')
    ON CONFLICT (organization_id, addon_key) DO UPDATE SET enabled = true, activated_at = now() - interval '1 day';
  INSERT INTO cash_settings (organization_id, shift_scope, activated_at)
    VALUES (v_org, 'user', now() - interval '30 days');

  -- Cobros sin turno (nadie tiene caja abierta todavía).
  PERFORM set_config('test.uid', '77777777-0000-0000-0000-00000000000b', false);
  INSERT INTO patient_payments (id, organization_id, amount, payment_method, created_at) VALUES
    ('77777777-1111-0000-0000-000000000001', v_org, 200, 'Efectivo', now() - interval '2 hours'),   -- hoy
    ('77777777-1111-0000-0000-000000000002', v_org, 50,  'Efectivo', now() - interval '10 days'),   -- viejo
    ('77777777-1111-0000-0000-000000000003', v_org, 80,  'Yape',     now() - interval '2 days'),    -- módulo apagado
    ('77777777-1111-0000-0000-000000000004', v_org, 30,  'Efectivo', now() - interval '1 hour');    -- para la otra caja
END $$;

SELECT t_eq('272 fixture: 4 cobros sin turno',
  (SELECT count(*)::int FROM patient_payments WHERE organization_id = '77777777-7777-7777-7777-777777777777' AND cash_shift_id IS NULL), 4);

SET ROLE authenticated;

-- Cada recepcionista abre su caja (scope user).
SET test.uid = '77777777-0000-0000-0000-00000000000b';
SELECT caja_open_shift('77777777-7777-7777-7777-777777777777', 100, NULL, NULL);
SET test.uid = '77777777-0000-0000-0000-00000000000c';
SELECT caja_open_shift('77777777-7777-7777-7777-777777777777', 100, NULL, NULL);

RESET ROLE;
CREATE TEMP TABLE t_shift AS
  SELECT opened_by, id FROM cash_shifts WHERE organization_id = '77777777-7777-7777-7777-777777777777' AND status = 'open';
GRANT SELECT ON t_shift TO authenticated;
SET ROLE authenticated;

-- Recepción pasa el cobro de hoy a SU caja.
SET test.uid = '77777777-0000-0000-0000-00000000000b';
SELECT caja_attach_payment('77777777-1111-0000-0000-000000000001',
  (SELECT id FROM t_shift WHERE opened_by = '77777777-0000-0000-0000-00000000000b'));
RESET ROLE;
SELECT t_ok('272 recepción pasa a su caja el cobro de hoy',
  (SELECT cash_shift_id = (SELECT id FROM t_shift WHERE opened_by = '77777777-0000-0000-0000-00000000000b')
          AND cash_attached_by = '77777777-0000-0000-0000-00000000000b' AND cash_attached_at IS NOT NULL
     FROM patient_payments WHERE id = '77777777-1111-0000-0000-000000000001'));
SET ROLE authenticated;
SET test.uid = '77777777-0000-0000-0000-00000000000b';

SELECT t_raises('272 recepción no pasa cobros a la caja de otra persona',
  $q$SELECT caja_attach_payment('77777777-1111-0000-0000-000000000004',
       (SELECT id FROM t_shift WHERE opened_by = '77777777-0000-0000-0000-00000000000c'))$q$,
  '%tu propia caja%');
SELECT t_raises('272 recepción no pasa cobros de más de 7 días',
  $q$SELECT caja_attach_payment('77777777-1111-0000-0000-000000000002',
       (SELECT id FROM t_shift WHERE opened_by = '77777777-0000-0000-0000-00000000000b'))$q$,
  '%7 días%');
SELECT t_raises('272 recepción no pasa cobros de cuando Caja estaba apagada',
  $q$SELECT caja_attach_payment('77777777-1111-0000-0000-000000000003',
       (SELECT id FROM t_shift WHERE opened_by = '77777777-0000-0000-0000-00000000000b'))$q$,
  '%anterior al módulo Caja%');
SELECT t_raises('272 un cobro ya atribuido no se vuelve a atribuir',
  $q$SELECT caja_attach_payment('77777777-1111-0000-0000-000000000001',
       (SELECT id FROM t_shift WHERE opened_by = '77777777-0000-0000-0000-00000000000b'))$q$,
  '%ya pertenece%');

SET test.uid = '77777777-0000-0000-0000-00000000000d';
SELECT t_raises('272 el doctor no atribuye cobros',
  $q$SELECT caja_attach_payment('77777777-1111-0000-0000-000000000004',
       (SELECT id FROM t_shift WHERE opened_by = '77777777-0000-0000-0000-00000000000c'))$q$,
  '%Tu rol no puede%');

SET test.uid = '88888888-8888-8888-8888-888888888888';
SELECT t_raises('272 otra organización no ve el cobro',
  $q$SELECT caja_attach_payment('77777777-1111-0000-0000-000000000004',
       (SELECT id FROM t_shift WHERE opened_by = '77777777-0000-0000-0000-00000000000c'))$q$,
  '%Pago no encontrado%');

-- Admin: sin el corte de 7 días ni el de "su caja".
SET test.uid = '77777777-0000-0000-0000-00000000000a';
SELECT caja_attach_payment('77777777-1111-0000-0000-000000000002',
  (SELECT id FROM t_shift WHERE opened_by = '77777777-0000-0000-0000-00000000000c'));
RESET ROLE;
SELECT t_ok('272 admin atribuye un cobro viejo a cualquier caja abierta',
  (SELECT cash_shift_id = (SELECT id FROM t_shift WHERE opened_by = '77777777-0000-0000-0000-00000000000c')
     FROM patient_payments WHERE id = '77777777-1111-0000-0000-000000000002'));

-- Caja cerrada: nadie atribuye.
UPDATE cash_shifts SET status = 'closed', closed_at = now(), closed_by = opened_by,
       counted_cash = 0, expected_cash = 0
 WHERE id = (SELECT id FROM t_shift WHERE opened_by = '77777777-0000-0000-0000-00000000000c');
SET ROLE authenticated;
SET test.uid = '77777777-0000-0000-0000-00000000000a';
SELECT t_raises('272 nunca a una caja cerrada',
  $q$SELECT caja_attach_payment('77777777-1111-0000-0000-000000000004',
       (SELECT id FROM t_shift WHERE opened_by = '77777777-0000-0000-0000-00000000000c'))$q$,
  '%caja abierta%');
RESET ROLE;

SELECT 'CAJA 272: TODAS LAS PRUEBAS PASARON' AS resultado;
