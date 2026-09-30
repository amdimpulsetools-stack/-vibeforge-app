-- ═══════════════════════════════════════════════════════════════════
-- Mig 274 "Pre-reserva": invariantes ejecutados, no leídos.
--   P1-P2. Columnas, CHECKs e índices; kinds nuevos de plantillas.
--   P3-P6. Confirmación automática por pago (clinical sí, pos no,
--          traslado sí, nunca bloquea el cobro).
--   P7-P11. RPC appointment_release_hold como `authenticated` (RLS real):
--          libera y borra; bloqueos con mensaje; DELETE directo de
--          recepción sigue prohibido; otra org; privilegios.
-- Corre después de 10_ (reusa t_ids/t_id), pero no depende de sus datos.
-- ═══════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

-- ── Fixture ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS t_ids (k text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid());
GRANT SELECT ON t_ids TO authenticated;
CREATE OR REPLACE FUNCTION t_id(p_k text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM t_ids WHERE k = p_k $$;

INSERT INTO t_ids(k) SELECT unnest(ARRAY['h_org','h_org2','h_admin','h_recep','h_other','hp1','hp2','hp3','h_eco']);
INSERT INTO auth.users(id, email) SELECT t_id(k), k || '@t.pe' FROM unnest(ARRAY['h_admin','h_recep','h_other']) k;
INSERT INTO organizations(id, name, owner_id) VALUES
  (t_id('h_org'), 'Clínica Hold', t_id('h_admin')), (t_id('h_org2'), 'Otra', t_id('h_other'));
INSERT INTO organization_members(user_id, organization_id, role) VALUES
  (t_id('h_admin'), t_id('h_org'), 'admin'),
  (t_id('h_recep'), t_id('h_org'), 'receptionist'),
  (t_id('h_other'), t_id('h_org2'), 'owner');
INSERT INTO services(id, organization_id, name) VALUES (t_id('h_eco'), t_id('h_org'), 'Ecografía');
INSERT INTO patients(id, organization_id) SELECT t_id(k), t_id('h_org') FROM unnest(ARRAY['hp1','hp2','hp3']) k;

-- Cita (pre-reserva si p_minutes no es NULL).
CREATE FUNCTION t_hold(p_minutes int DEFAULT 120, p_status text DEFAULT 'scheduled',
                       p_patient text DEFAULT 'hp1', p_org text DEFAULT 'h_org')
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO appointments(organization_id, patient_id, service_id, appointment_date, status, hold_expires_at)
  VALUES (t_id(p_org), t_id(p_patient), t_id('h_eco'), current_date + 2, p_status,
          CASE WHEN p_minutes IS NULL THEN NULL ELSE now() + make_interval(mins => p_minutes) END)
  RETURNING id
$$;
GRANT EXECUTE ON FUNCTION t_hold(int,text,text,text) TO authenticated;

-- Ejecuta y devuelve el mensaje de error (NULL si no falló). INVOKER.
CREATE FUNCTION t_err(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION t_err(text) TO authenticated;

CREATE FUNCTION t_is_hold(p_appt uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT hold_expires_at IS NOT NULL FROM appointments WHERE id = p_appt
$$;

SELECT set_config('test.uid', t_id('h_recep')::text, false);

-- ═══ P1. Columnas / CHECKs / índice ════════════════════════════════
DO $$
DECLARE s scheduler_settings; e text;
BEGIN
  INSERT INTO scheduler_settings(organization_id) VALUES (t_id('h_org')) RETURNING * INTO s;
  ASSERT s.prereserva_color = '#8b5cf6' AND s.prereserva_default_minutes = 120, 'P1: defaults';

  e := t_err(format('UPDATE scheduler_settings SET prereserva_color = %L WHERE id = %L', 'purple', s.id));
  ASSERT e LIKE '%scheduler_settings_prereserva_color_check%', 'P1: color no hex: ' || coalesce(e, '∅');
  e := t_err(format('UPDATE scheduler_settings SET prereserva_color = %L WHERE id = %L', '#12345', s.id));
  ASSERT e LIKE '%prereserva_color_check%', 'P1: color corto';
  e := t_err(format('UPDATE scheduler_settings SET prereserva_color = NULL WHERE id = %L', s.id));
  ASSERT e LIKE '%null value%', 'P1: color NOT NULL';
  UPDATE scheduler_settings SET prereserva_color = '#AbCdEf' WHERE id = s.id;

  e := t_err(format('UPDATE scheduler_settings SET prereserva_default_minutes = 14 WHERE id = %L', s.id));
  ASSERT e LIKE '%scheduler_settings_prereserva_minutes_check%', 'P1: < 15';
  e := t_err(format('UPDATE scheduler_settings SET prereserva_default_minutes = 10081 WHERE id = %L', s.id));
  ASSERT e LIKE '%prereserva_minutes_check%', 'P1: > 7 días';
  UPDATE scheduler_settings SET prereserva_default_minutes = 15 WHERE id = s.id;
  UPDATE scheduler_settings SET prereserva_default_minutes = 10080 WHERE id = s.id;

  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_appointments_hold_expires'
                  AND indexdef LIKE '%WHERE (hold_expires_at IS NOT NULL)%'), 'P1: índice parcial';
  ASSERT (SELECT count(*) FROM appointments WHERE hold_expires_at IS NOT NULL) = 0,
         'P1: las citas existentes quedan como citas normales';
  RAISE NOTICE 'PASS  P1 columnas con default, CHECK hex #RRGGBB y 15..10080, índice parcial; citas existentes intactas';
END $$;

-- ═══ P2. Kinds de plantillas ═══════════════════════════════════════
DO $$
DECLARE e text; n int;
BEGIN
  INSERT INTO org_whatsapp_clipboard_templates(organization_id, kind, template)
  SELECT t_id('h_org'), k, 'Hola {{NOMBRE}}'
    FROM unnest(ARRAY['post_appointment','second_consultation_followup','budget_followup',
                      'reschedule_notice','reschedule_coordinate','prereserva']) k;
  e := t_err(format('INSERT INTO org_whatsapp_clipboard_templates(organization_id, kind, template) VALUES (%L, %L, %L)',
                    t_id('h_org2'), 'foo', 'x'));
  ASSERT e LIKE '%org_whatsapp_clipboard_templates_kind_check%', 'P2: kind inválido: ' || coalesce(e, '∅');
  SELECT count(*) INTO n FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'kind'
   WHERE c.conrelid = 'org_whatsapp_clipboard_templates'::regclass AND c.contype = 'c' AND c.conkey = ARRAY[a.attnum];
  ASSERT n = 1, 'P2: un solo CHECK sobre kind (' || n || ')';
  RAISE NOTICE 'PASS  P2 los 6 kinds se aceptan (3 viejos + reschedule_notice/reschedule_coordinate/prereserva); otro kind no; un solo CHECK';
END $$;

-- ═══ P3-P6. Confirmación por pago ══════════════════════════════════
DO $$
DECLARE h uuid; a uuid; up timestamptz;
BEGIN
  -- Pago clínico (source por defecto) confirma.
  h := t_hold();
  INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount)
    VALUES (t_id('h_org'), t_id('hp1'), h, 50);
  ASSERT NOT t_is_hold(h), 'P3: pago clínico confirma';
  h := t_hold();
  INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount, source)
    VALUES (t_id('h_org'), t_id('hp1'), h, 50, 'clinical');
  ASSERT NOT t_is_hold(h), 'P3: source=clinical explícito confirma';
  -- Una cita normal no se toca (ni updated_at).
  a := t_hold(NULL);
  UPDATE appointments SET updated_at = now() - interval '1 day' WHERE id = a;
  SELECT updated_at INTO up FROM appointments WHERE id = a;
  INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount) VALUES (t_id('h_org'), t_id('hp1'), a, 80);
  ASSERT (SELECT updated_at FROM appointments WHERE id = a) = up AND NOT t_is_hold(a), 'P3: cita normal intacta';
  RAISE NOTICE 'PASS  P3 pago clínico confirma la pre-reserva; en una cita normal no toca nada (ni updated_at)';

  -- Farmacia (pos) NO confirma; un pago sin cita tampoco.
  h := t_hold();
  INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount, source)
    VALUES (t_id('h_org'), t_id('hp1'), h, 30, 'pos');
  ASSERT t_is_hold(h), 'P4: pos no confirma';
  INSERT INTO patient_payments(organization_id, patient_id, amount) VALUES (t_id('h_org'), t_id('hp1'), 30);
  ASSERT t_is_hold(h), 'P4: pago suelto no confirma';
  RAISE NOTICE 'PASS  P4 un cobro de farmacia (source=pos) o sin cita NO confirma';
END $$;

DO $$
DECLARE h uuid; a uuid; pid uuid; c uuid; res json;
BEGIN
  -- Traslado por UPDATE OF appointment_id (clínico) confirma.
  a := t_hold(NULL);
  h := t_hold();
  INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount)
    VALUES (t_id('h_org'), t_id('hp1'), a, 60) RETURNING id INTO pid;
  UPDATE patient_payments SET notes = 'solo nota' WHERE id = pid;
  ASSERT t_is_hold(h), 'P5: editar otra columna no confirma nada';
  UPDATE patient_payments SET appointment_id = h WHERE id = pid;
  ASSERT NOT t_is_hold(h), 'P5: traslado por UPDATE confirma';
  -- Traslado POS no confirma.
  h := t_hold();
  INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount, source)
    VALUES (t_id('h_org'), t_id('hp1'), a, 20, 'pos') RETURNING id INTO pid;
  UPDATE patient_payments SET appointment_id = h WHERE id = pid;
  ASSERT t_is_hold(h), 'P5: mover un pago pos no confirma';

  -- Con la RPC de la 273: adelanto de una cita cancelada → pre-reserva nueva.
  c := t_hold(NULL, 'scheduled', 'hp2');
  INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount) VALUES (t_id('h_org'), t_id('hp2'), c, 100);
  UPDATE appointments SET status = 'cancelled', cancel_outcome = 'reprogramar', cancel_money = 'a_cuenta' WHERE id = c;
  h := t_hold(120, 'scheduled', 'hp2');
  res := appointment_transfer_payments(c, h);
  ASSERT (res->>'moved_count')::int = 1, 'P5: traslado 273 ' || res::text;
  ASSERT NOT t_is_hold(h), 'P5: appointment_transfer_payments confirma la pre-reserva';
  RAISE NOTICE 'PASS  P5 adelanto trasladado (UPDATE OF appointment_id y RPC 273) confirma; mover pos o editar otra columna no';
END $$;

DO $$
DECLARE h uuid; n int;
BEGIN
  -- Si confirmar falla, el cobro entra igual (WARNING) y la cita sigue en pre-reserva.
  ALTER TABLE appointments ADD CONSTRAINT boom274
    CHECK (hold_expires_at IS NOT NULL OR notes IS DISTINCT FROM 'boom') NOT VALID;
  h := t_hold();
  UPDATE appointments SET notes = 'boom' WHERE id = h;
  INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount) VALUES (t_id('h_org'), t_id('hp1'), h, 70);
  SELECT count(*) INTO n FROM patient_payments WHERE appointment_id = h AND amount = 70;
  ASSERT n = 1, 'P6: el cobro se registró';
  ASSERT t_is_hold(h), 'P6: la cita sigue en pre-reserva';
  ALTER TABLE appointments DROP CONSTRAINT boom274;
  RAISE NOTICE 'PASS  P6 si confirmar falla, el cobro se registra igual (WARNING) y la cita queda en pre-reserva';
END $$;

-- ── Fixture de liberación (superusuario) ───────────────────────────
DO $$
DECLARE h uuid; ts uuid; x uuid;
BEGIN
  -- Feliz: sesión de plan, log de recordatorio (CASCADE), log WhatsApp
  -- (SET NULL), links vencido y anulado, tabla ajena SET NULL.
  h := t_hold(120, 'confirmed', 'hp3');
  INSERT INTO treatment_sessions(organization_id, appointment_id, status) VALUES (t_id('h_org'), h, 'pending') RETURNING id INTO ts;
  UPDATE appointments SET treatment_session_id = ts WHERE id = h;
  INSERT INTO reminder_logs(appointment_id, template_slug) VALUES (h, 'appointment_reminder_24h');
  INSERT INTO whatsapp_message_logs(organization_id, appointment_id) VALUES (t_id('h_org'), h);
  INSERT INTO payment_links(organization_id, appointment_id, status, expires_at) VALUES
    (t_id('h_org'), h, 'pending', now() - interval '1 hour'),
    (t_id('h_org'), h, 'cancelled', now() + interval '1 day');
  CREATE TABLE t_extra_setnull (id serial PRIMARY KEY, appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL);
  INSERT INTO t_extra_setnull(appointment_id) VALUES (h);
  INSERT INTO t_ids(k, id) VALUES ('rel_ok', h), ('rel_ts', ts);

  -- Bloqueos.
  INSERT INTO t_ids(k, id) VALUES ('b_normal', t_hold(NULL));
  INSERT INTO t_ids(k, id) VALUES ('b_cancel', t_hold(120, 'cancelled'));
  INSERT INTO t_ids(k, id) VALUES ('b_done', t_hold(120, 'completed'));
  INSERT INTO t_ids(k, id) VALUES ('b_expired_ok', t_hold(-30));        -- vencida: se puede liberar

  -- Pre-reserva con pago clínico cuya confirmación automática falló (P6):
  -- sigue siendo pre-reserva, pero tiene plata encima.
  h := t_hold();
  ALTER TABLE patient_payments DISABLE TRIGGER trg_patient_payments_confirm_prereserva_insert;
  INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount) VALUES (t_id('h_org'), t_id('hp1'), h, 10);
  ALTER TABLE patient_payments ENABLE TRIGGER trg_patient_payments_confirm_prereserva_insert;
  ASSERT t_is_hold(h), 'fixture b_pay';
  INSERT INTO t_ids(k, id) VALUES ('b_pay', h);
  h := t_hold();
  INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount, source) VALUES (t_id('h_org'), t_id('hp1'), h, 10, 'pos');
  INSERT INTO t_ids(k, id) VALUES ('b_pos', h);
  h := t_hold();
  INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount, transferred_from_appointment_id)
    VALUES (t_id('h_org'), t_id('hp1'), t_hold(NULL), 10, h);
  INSERT INTO t_ids(k, id) VALUES ('b_transf', h);
  h := t_hold(); INSERT INTO clinical_notes(organization_id, appointment_id, body) VALUES (t_id('h_org'), h, 'SOAP');
  INSERT INTO t_ids(k, id) VALUES ('b_note', h);
  h := t_hold(); INSERT INTO einvoices(organization_id, appointment_id) VALUES (t_id('h_org'), h);
  INSERT INTO t_ids(k, id) VALUES ('b_einv', h);
  h := t_hold(); INSERT INTO einvoices(organization_id) VALUES (t_id('h_org')) RETURNING id INTO x;
  UPDATE appointments SET einvoice_id = x WHERE id = h;
  INSERT INTO t_ids(k, id) VALUES ('b_einv2', h);
  h := t_hold(); INSERT INTO prescriptions(organization_id, appointment_id) VALUES (t_id('h_org'), h);
  INSERT INTO t_ids(k, id) VALUES ('b_rx', h);
  h := t_hold(); INSERT INTO exam_orders(organization_id, appointment_id) VALUES (t_id('h_org'), h);
  INSERT INTO t_ids(k, id) VALUES ('b_exam', h);
  h := t_hold(); INSERT INTO payment_links(organization_id, appointment_id, status) VALUES (t_id('h_org'), h, 'pending');
  INSERT INTO t_ids(k, id) VALUES ('b_link', h);
  h := t_hold(); INSERT INTO payment_links(organization_id, appointment_id, status, expires_at)
    VALUES (t_id('h_org'), h, 'processing', now() - interval '1 hour');
  INSERT INTO t_ids(k, id) VALUES ('b_link2', h);
  h := t_hold(); INSERT INTO treatment_sessions(organization_id, appointment_id, status) VALUES (t_id('h_org'), h, 'completed');
  INSERT INTO t_ids(k, id) VALUES ('b_sess', h);
  -- Tabla que el repo no conoce, con CASCADE: la red dinámica la ve.
  CREATE TABLE t_extra_cascade (id serial PRIMARY KEY, appointment_id uuid REFERENCES appointments(id) ON DELETE CASCADE);
  h := t_hold(); INSERT INTO t_extra_cascade(appointment_id) VALUES (h);
  INSERT INTO t_ids(k, id) VALUES ('b_extra', h);

  INSERT INTO t_ids(k, id) VALUES ('b_direct', t_hold()), ('b_admin', t_hold()), ('b_other', t_hold());
END $$;
GRANT SELECT ON t_extra_setnull, t_extra_cascade TO authenticated;

-- ═══ P7-P9. Como recepción (`authenticated`, RLS real) ══════════════
SET ROLE authenticated;
SELECT set_config('test.uid', t_id('h_recep')::text, false);

DO $$
DECLARE res json; h uuid := t_id('rel_ok'); ts treatment_sessions;
BEGIN
  res := appointment_release_hold(h);
  ASSERT (res->>'released')::boolean AND (res->>'appointment_id')::uuid = h, 'P7: respuesta ' || res::text;
  ASSERT NOT EXISTS (SELECT 1 FROM appointments WHERE id = h), 'P7: la cita se borró';
  SELECT * INTO ts FROM treatment_sessions WHERE id = t_id('rel_ts');
  ASSERT ts.status = 'pending' AND ts.appointment_id IS NULL, 'P7: sesión liberada';
  ASSERT (SELECT count(*) FROM payment_links WHERE appointment_id IS NULL) = 2, 'P7: links vencido/anulado quedan sin cita';
  -- Vencida también se libera.
  res := appointment_release_hold(t_id('b_expired_ok'));
  ASSERT (res->>'released')::boolean, 'P7: pre-reserva vencida';
  RAISE NOTICE 'PASS  P7 recepción libera (vigente o vencida): borra la cita, libera la sesión del plan; links vencidos/anulados no bloquean';
END $$;

DO $$
DECLARE r record; e text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('b_normal', '%ya no es una pre-reserva%'),
    ('b_cancel', '%pre-reserva pendiente: esta cita está cancelada%'),
    ('b_done',   '%está atendida%'),
    ('b_pay',    '%pagos registrados%'),
    ('b_pos',    '%pagos registrados%'),
    ('b_transf', '%pagos registrados%'),
    ('b_note',   '%nota clínica%'),
    ('b_einv',   '%comprobante electrónico%'),
    ('b_einv2',  '%comprobante electrónico%'),
    ('b_rx',     '%recetas%'),
    ('b_exam',   '%órdenes de exámenes%'),
    ('b_link',   '%link de pago activo%'),
    ('b_link2',  '%link de pago activo%'),
    ('b_sess',   '%marcada como realizada%'),
    ('b_extra',  '%datos vinculados en t_extra_cascade%')
  ) AS t(k, pat)
  LOOP
    e := t_err(format('SELECT appointment_release_hold(%L)', t_id(r.k)));
    ASSERT e LIKE r.pat, 'P8: ' || r.k || ' → ' || coalesce(e, 'NO FALLÓ');
    ASSERT EXISTS (SELECT 1 FROM appointments WHERE id = t_id(r.k)), 'P8: ' || r.k || ' sigue existiendo';
  END LOOP;
  -- La receta es invisible para recepción, pero bloquea igual (helper DEFINER).
  ASSERT (SELECT count(*) FROM prescriptions) = 0, 'P8: recepción no ve recetas';
  e := t_err('SELECT appointment_release_hold(NULL)');
  ASSERT e LIKE '%Elige la pre-reserva%', 'P8: NULL';
  e := t_err(format('SELECT appointment_release_hold(%L)', gen_random_uuid()));
  ASSERT e LIKE '%Cita no encontrada%', 'P8: inexistente';
  RAISE NOTICE 'PASS  P8 no libera: cita normal, cancelada/atendida, con pagos (clínico, pos, trasladado), nota, comprobante, receta (invisible por RLS), orden de examen, link activo, sesión realizada, FK CASCADE ajena';
END $$;

DO $$
DECLARE n int; e text;
BEGIN
  -- DELETE directo de recepción (sin la RPC): 0 filas, como hoy.
  DELETE FROM appointments WHERE id = t_id('b_direct');
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0 AND EXISTS (SELECT 1 FROM appointments WHERE id = t_id('b_direct')), 'P9: DELETE directo';
  DELETE FROM appointments WHERE id = t_id('b_normal');
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'P9: cita normal';
  ASSERT coalesce(current_setting('vibeforge.release_hold_id', true), '') = '', 'P9: la llave no queda puesta';
  RAISE NOTICE 'PASS  P9 recepción sigue sin poder borrar citas directo (solo vía la RPC); la llave del GUC no queda puesta';
END $$;

-- Admin: la RPC funciona igual; su DELETE directo de siempre también.
SELECT set_config('test.uid', t_id('h_admin')::text, false);
DO $$
DECLARE res json; n int;
BEGIN
  res := appointment_release_hold(t_id('b_admin'));
  ASSERT (res->>'released')::boolean, 'P9: admin libera';
  DELETE FROM appointments WHERE id = t_id('b_normal');
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'P9: admin sigue pudiendo borrar citas';
  RAISE NOTICE 'PASS  P9 admin libera por la RPC y conserva su DELETE de siempre';
END $$;

-- Otra org no ve ni libera nada.
SELECT set_config('test.uid', t_id('h_other')::text, false);
DO $$
DECLARE e text;
BEGIN
  e := t_err(format('SELECT appointment_release_hold(%L)', t_id('b_other')));
  ASSERT e LIKE '%Cita no encontrada%', 'P10: RPC otra org → ' || coalesce(e, 'NO FALLÓ');
  e := t_err(format('SELECT appointment_hold_release_blocker(%L)', t_id('b_note')));
  ASSERT e LIKE '%Cita no encontrada%', 'P10: helper otra org → ' || coalesce(e, 'NO FALLÓ');
  RAISE NOTICE 'PASS  P10 otra org: "Cita no encontrada" (RPC y helper)';
END $$;
RESET ROLE;

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM appointments WHERE id = t_id('b_other')), 'P10: sigue';
  ASSERT (SELECT count(*) FROM prescriptions WHERE appointment_id = t_id('b_rx')) = 1, 'P8: receta intacta';
  ASSERT (SELECT count(*) FROM clinical_notes WHERE appointment_id = t_id('b_note')) = 1, 'P8: nota intacta';
  ASSERT (SELECT count(*) FROM reminder_logs) = 0, 'P7: el log de recordatorio se fue con la cita (CASCADE)';
  ASSERT (SELECT count(*) FROM whatsapp_message_logs WHERE appointment_id IS NULL) = 1, 'P7: log WhatsApp queda (SET NULL)';
  ASSERT (SELECT count(*) FROM t_extra_setnull WHERE appointment_id IS NULL) = 1, 'P7: FK SET NULL ajena no bloquea';

  ASSERT NOT has_function_privilege('anon', 'appointment_release_hold(uuid)', 'EXECUTE'), 'P11: anon';
  ASSERT has_function_privilege('authenticated', 'appointment_release_hold(uuid)', 'EXECUTE'), 'P11: authenticated';
  ASSERT NOT has_function_privilege('anon', 'appointment_hold_release_blocker(uuid)', 'EXECUTE'), 'P11: anon helper';
  ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE proname = 'appointment_release_hold'), 'P11: RPC INVOKER';
  ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE proname = 'patient_payments_confirm_prereserva'), 'P11: trigger INVOKER';
  ASSERT (SELECT count(*) FROM pg_proc WHERE proname IN ('appointment_release_hold','patient_payments_confirm_prereserva',
            'appointment_hold_release_blocker') AND proconfig @> ARRAY['search_path=public, pg_temp']) = 3, 'P11: search_path';
  RAISE NOTICE 'PASS  P11 anon sin EXECUTE; RPC y trigger INVOKER; search_path fijo';
END $$;

DROP TABLE t_extra_cascade;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM appointments WHERE hold_expires_at IS NOT NULL;
  ASSERT n > 0, 'fixture: deben quedar pre-reservas para probar el rollback';
  RAISE NOTICE 'TODAS las pruebas de la 274 pasaron (% pre-reservas quedan para el rollback)', n;
END $$;
