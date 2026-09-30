-- ═══════════════════════════════════════════════════════════════════
-- Mig 273 "Por reprogramar": invariantes ejecutados, no leídos.
--   A. Tarjeta (creación, dedupe, cierre, reactivación) — superusuario
--      con auth.uid() = recepción (la RLS se prueba en C).
--   B. RPC appointment_transfer_payments (dinero).
--   C. Lo mismo en la piel de `authenticated` (RLS real, INVOKER).
--   D. Los triggers nunca bloquean la cita.
-- Cada bloque imprime PASS; cualquier ASSERT roto corta la corrida.
-- ═══════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

-- ── Fixture ────────────────────────────────────────────────────────
CREATE TABLE t_ids (k text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid());
GRANT SELECT ON t_ids TO authenticated;
CREATE FUNCTION t_id(p_k text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM t_ids WHERE k = p_k $$;
-- "Hoy" de Lima calculado aparte (no con la función bajo prueba).
CREATE FUNCTION t_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'America/Lima')::date $$;

INSERT INTO t_ids(k) SELECT unnest(ARRAY[
  'org1','org2','admin','recep','other','d1','d2','eco','con','lab','svc2',
  'p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11','p12','p13','p14']);

INSERT INTO auth.users(id, email) SELECT t_id(k), k || '@t.pe' FROM unnest(ARRAY['admin','recep','other']) k;
INSERT INTO organizations(id, name, owner_id, timezone) VALUES
  (t_id('org1'), 'Vitra',  t_id('admin'), 'America/Lima'),
  (t_id('org2'), 'Tokio',  t_id('other'), 'Asia/Tokyo');
INSERT INTO organization_members(user_id, organization_id, role) VALUES
  (t_id('admin'), t_id('org1'), 'admin'),
  (t_id('recep'), t_id('org1'), 'receptionist'),
  (t_id('other'), t_id('org2'), 'owner');
INSERT INTO doctors(id, organization_id, full_name) VALUES
  (t_id('d1'), t_id('org1'), 'Dra. Pérez'), (t_id('d2'), t_id('org2'), 'Dr. Sato');
INSERT INTO services(id, organization_id, name) VALUES
  (t_id('eco'), t_id('org1'), 'Ecografía'), (t_id('con'), t_id('org1'), 'Consulta'),
  (t_id('lab'), t_id('org1'), 'Laboratorio'), (t_id('svc2'), t_id('org2'), 'Control');
INSERT INTO patients(id, organization_id)
  SELECT t_id(k), t_id('org1') FROM unnest(ARRAY['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11','p12','p13','p14']) k;

CREATE FUNCTION t_appt(p_patient text, p_service text, p_date date,
                       p_status text DEFAULT 'scheduled', p_from uuid DEFAULT NULL,
                       p_org text DEFAULT 'org1', p_time time DEFAULT '10:30')
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO appointments(organization_id, patient_id, doctor_id, service_id,
                           appointment_date, start_time, status, rescheduled_from_id)
  VALUES (t_id(p_org), t_id(p_patient), CASE WHEN p_org = 'org1' THEN t_id('d1') ELSE t_id('d2') END,
          t_id(p_service), p_date, p_time, p_status, p_from)
  RETURNING id
$$;
GRANT EXECUTE ON FUNCTION t_appt(text,text,date,text,uuid,text,time) TO authenticated;

CREATE FUNCTION t_cancel(p_appt uuid, p_outcome text, p_money text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  UPDATE appointments SET status = 'cancelled', cancel_outcome = p_outcome, cancel_money = p_money
   WHERE id = p_appt
$$;
GRANT EXECUTE ON FUNCTION t_cancel(uuid,text,text) TO authenticated;

CREATE FUNCTION t_open(p_source uuid) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT count(*)::int FROM clinical_followups
   WHERE rule_key = 'core.reschedule_pending' AND source_id = p_source
     AND status IN ('pendiente','contactado','pospuesto')
$$;
GRANT EXECUTE ON FUNCTION t_open(uuid) TO authenticated;

SELECT set_config('test.uid', t_id('recep')::text, false);

-- ═══ A. Tarjeta ══════════════════════════════════════════════════════
DO $$
DECLARE a uuid; b uuid; n int;
BEGIN
  -- Cancelar sin elegir / "No vuelve" / "Fue un error" → no hay tarjeta.
  a := t_appt('p1', 'eco', t_today() + 5);  PERFORM t_cancel(a, NULL);
  b := t_appt('p1', 'eco', t_today() + 6);  PERFORM t_cancel(b, 'no_vuelve');
  a := t_appt('p1', 'eco', t_today() + 7);  PERFORM t_cancel(a, 'error_registro');
  SELECT count(*) INTO n FROM clinical_followups; ASSERT n = 0, 'A1: sin reprogramar no hay tarjeta';
  RAISE NOTICE 'PASS  A1 cancelar con no_vuelve / error_registro / sin elegir no crea tarjeta';
END $$;

DO $$
DECLARE a uuid; r clinical_followups; ap appointments; ev jsonb;
BEGIN
  a := t_appt('p2', 'eco', t_today() + 3, 'scheduled', NULL, 'org1', '09:15');
  UPDATE appointments SET status = 'cancelled', cancel_outcome = 'reprogramar', cancel_money = 'a_cuenta' WHERE id = a;
  INSERT INTO t_ids(k, id) VALUES ('A2', a);

  SELECT * INTO ap FROM appointments WHERE id = a;
  ASSERT ap.cancelled_at IS NOT NULL AND ap.cancelled_by = t_id('recep'), 'A2: cancelled_at/by estampados';

  ASSERT t_open(a) = 1, 'A2: una tarjeta';
  SELECT * INTO r FROM clinical_followups WHERE source_id = a;
  ASSERT r.rule_key = 'core.reschedule_pending' AND r.source = 'system' AND r.source_type = 'appointment'
     AND r.status = 'pendiente' AND NOT r.is_resolved AND r.priority = 'yellow'
     AND r.organization_id = t_id('org1') AND r.patient_id = t_id('p2') AND r.doctor_id = t_id('d1')
     AND r.max_attempts = 99 AND r.target_category_canonical IS NULL, 'A2: campos';
  ASSERT r.follow_up_date IS NULL AND r.appointment_id IS NULL, 'A2: follow_up_date y appointment_id NULL';
  ASSERT r.reason = 'Cita del ' || to_char(t_today() + 3, 'DD/MM')
                    || ' 09:15 · Ecografía · Dra. Pérez cancelada — pendiente de reprogramar',
         'A2: motivo = ' || r.reason;
  -- Vence hoy(Lima) + 2 a las 12:00 hora de Lima.
  ASSERT (r.expected_by AT TIME ZONE 'America/Lima') = (t_today() + 2) + time '12:00',
         'A2: expected_by = ' || r.expected_by;
  ev := r.contact_events -> 0;
  ASSERT jsonb_array_length(r.contact_events) = 1 AND ev->>'type' = 'created_from_cancel'
     AND (ev->>'by_user_id')::uuid = t_id('recep') AND ev ? 'at', 'A2: contact_events';
  RAISE NOTICE 'PASS  A2 reprogramar crea 1 tarjeta con campos exactos (follow_up_date/appointment_id NULL, max 99, vence hoy+2 12:00 Lima)';
END $$;

DO $$
DECLARE a uuid; r clinical_followups;
BEGIN
  -- Zona de la org, no UTC: Tokio vence a mediodía de Tokio.
  a := t_appt('p2', 'svc2', t_today() + 10, 'scheduled', NULL, 'org2');
  PERFORM t_cancel(a, 'reprogramar');
  SELECT * INTO r FROM clinical_followups WHERE source_id = a;
  ASSERT (r.expected_by AT TIME ZONE 'Asia/Tokyo')
         = ((now() AT TIME ZONE 'Asia/Tokyo')::date + 2) + time '12:00', 'A3: zona de la org';
  ASSERT r.organization_id = t_id('org2') AND r.doctor_id = t_id('d2'), 'A3: org2';
  RAISE NOTICE 'PASS  A3 expected_by en la zona de CADA org (Asia/Tokyo)';
END $$;

DO $$
DECLARE a uuid; b uuid;
BEGIN
  -- Dos citas canceladas de la misma paciente → dos tarjetas.
  a := t_appt('p1', 'eco', t_today() + 2);
  b := t_appt('p1', 'con', t_today() + 2, 'scheduled', NULL, 'org1', '11:00');
  PERFORM t_cancel(a, 'reprogramar'); PERFORM t_cancel(b, 'reprogramar');
  ASSERT t_open(a) = 1 AND t_open(b) = 1, 'A4: dos tarjetas';
  INSERT INTO t_ids(k, id) VALUES ('A4eco', a), ('A4con', b);
  RAISE NOTICE 'PASS  A4 dos citas canceladas de la misma paciente = dos tarjetas';
END $$;

DO $$
DECLARE fut uuid; a uuid; b uuid;
BEGIN
  -- Ya tenía cita futura viva del mismo servicio → no tarjeta; de otro servicio → sí.
  fut := t_appt('p3', 'eco', t_today() + 20);
  a := t_appt('p3', 'eco', t_today() + 1);  PERFORM t_cancel(a, 'reprogramar');
  ASSERT t_open(a) = 0, 'A5: ya tiene cita futura del mismo servicio';
  b := t_appt('p3', 'con', t_today() + 1);  PERFORM t_cancel(b, 'reprogramar');
  ASSERT t_open(b) = 1, 'A5: cita futura de OTRO servicio no evita la tarjeta';
  -- Una cita que ya reprograma a esta (rescheduled_from_id) también la evita.
  a := t_appt('p3', 'lab', t_today() + 1);
  PERFORM t_appt('p3', 'con', t_today() + 9, 'scheduled', a);
  PERFORM t_cancel(a, 'reprogramar');
  ASSERT t_open(a) = 0, 'A5: ya hay una cita hija';
  -- Una cita PASADA del mismo servicio no cuenta como "futura".
  PERFORM t_appt('p3', 'lab', t_today() - 3, 'completed');
  a := t_appt('p3', 'lab', t_today() + 2);  PERFORM t_cancel(a, 'reprogramar');
  ASSERT t_open(a) = 1, 'A5: una cita pasada no evita la tarjeta';
  RAISE NOTICE 'PASS  A5 cita futura viva del mismo servicio (o hija) evita la tarjeta; otro servicio o pasada, no';
END $$;

DO $$
DECLARE a uuid := t_id('A2'); n int;
BEGIN
  -- Re-disparos: editar la cancelada, re-elegir el mismo outcome, ir y volver.
  UPDATE appointments SET notes = 'llamar martes' WHERE id = a;
  UPDATE appointments SET cancel_outcome = 'reprogramar' WHERE id = a;
  UPDATE appointments SET cancel_outcome = 'no_vuelve' WHERE id = a;
  UPDATE appointments SET cancel_outcome = 'reprogramar' WHERE id = a;
  SELECT count(*) INTO n FROM clinical_followups WHERE source_id = a;
  ASSERT n = 1, 'A6: re-disparo no duplica (' || n || ')';
  -- Marcar DESPUÉS de cancelar (flujo con devolución) sí crea.
  a := t_appt('p4', 'eco', t_today() + 4);
  UPDATE appointments SET status = 'cancelled' WHERE id = a;
  ASSERT t_open(a) = 0, 'A6: aún sin outcome';
  UPDATE appointments SET cancel_outcome = 'reprogramar' WHERE id = a;
  ASSERT t_open(a) = 1, 'A6: outcome después de cancelar';
  INSERT INTO t_ids(k, id) VALUES ('A6', a);
  RAISE NOTICE 'PASS  A6 re-disparos no duplican; elegir "Reprogramará" después de cancelar sí crea';
END $$;

DO $$
DECLARE a_eco uuid := t_id('A4eco'); a_con uuid := t_id('A4con'); nw uuid; r clinical_followups; ev jsonb;
BEGIN
  -- Cierre por rescheduled_from_id aunque cambie el servicio (eco → lab).
  nw := t_appt('p1', 'lab', t_today() + 8, 'scheduled', a_eco);
  SELECT * INTO r FROM clinical_followups WHERE source_id = a_eco;
  ASSERT r.status = 'cerrado_manual' AND r.closure_reason = 'reprogramada' AND r.is_resolved
     AND r.closed_at IS NOT NULL AND r.resolved_at IS NOT NULL, 'A7: cierre por vínculo';
  ev := r.contact_events -> -1;
  ASSERT ev->>'type' = 'reprogramada' AND (ev->>'new_appointment_id')::uuid = nw
     AND (ev->>'by_user_id')::uuid = t_id('recep') AND jsonb_array_length(r.contact_events) = 2,
     'A7: contact_events ' || r.contact_events::text;
  ASSERT t_open(a_con) = 1, 'A7: la otra tarjeta (Consulta) sigue abierta';
  RAISE NOTICE 'PASS  A7 cierre por rescheduled_from_id con otro servicio; solo esa tarjeta';

  -- Cierre por mismo servicio sin vínculo.
  PERFORM t_appt('p1', 'con', t_today());   -- hoy cuenta
  SELECT * INTO r FROM clinical_followups WHERE source_id = a_con;
  ASSERT r.status = 'cerrado_manual' AND r.closure_reason = 'reprogramada', 'A8: mismo servicio';
  RAISE NOTICE 'PASS  A8 cierre por cita viva del mismo servicio sin vínculo (fecha = hoy org)';
END $$;

DO $$
DECLARE a uuid := t_id('A6'); nw uuid;
BEGIN
  -- p4 tiene tarjeta de Ecografía abierta.
  PERFORM t_appt('p4', 'lab', t_today() + 3);                        -- otro servicio, sin vínculo
  ASSERT t_open(a) = 1, 'A9: otro servicio sin vínculo no cierra';
  PERFORM t_appt('p4', 'eco', t_today() - 1, 'completed');           -- retroactiva
  PERFORM t_appt('p4', 'eco', t_today() - 1, 'scheduled', a);        -- retroactiva con vínculo
  ASSERT t_open(a) = 1, 'A9: cita pasada no cierra';
  PERFORM t_appt('p4', 'svc2', t_today() + 3, 'scheduled', NULL, 'org2');  -- otra org
  INSERT INTO appointments(organization_id, patient_id, service_id, appointment_date)
    VALUES (t_id('org2'), t_id('p4'), t_id('eco'), t_today() + 3);            -- otra org, mismo service_id
  ASSERT t_open(a) = 1, 'A9: otra org no cierra';
  PERFORM t_appt('p4', 'eco', t_today() + 3, 'cancelled');           -- nace cancelada
  PERFORM t_appt('p4', 'eco', t_today() + 3, 'no_show');
  ASSERT t_open(a) = 1, 'A9: cita no viva no cierra';
  PERFORM t_appt('p5', 'eco', t_today() + 3);                        -- otra paciente
  ASSERT t_open(a) = 1, 'A9: otra paciente no cierra';
  -- Vincular DESPUÉS de guardar (UPDATE de rescheduled_from_id) sí cierra.
  nw := t_appt('p4', 'lab', t_today() + 12);
  ASSERT t_open(a) = 1, 'A9: aún sin vínculo';
  UPDATE appointments SET rescheduled_from_id = a WHERE id = nw;
  ASSERT t_open(a) = 0, 'A9: vínculo por UPDATE cierra';
  RAISE NOTICE 'PASS  A9 no cierran: otro servicio sin vínculo, cita pasada, otra org, cita no viva, otra paciente; el vínculo por UPDATE sí';
END $$;

DO $$
DECLARE x uuid; y uuid; ap appointments; r clinical_followups;
BEGIN
  -- Reactivar cierra SOLO su tarjeta y limpia la estampa.
  x := t_appt('p5', 'con', t_today() + 5);  y := t_appt('p5', 'lab', t_today() + 6);
  PERFORM t_cancel(x, 'reprogramar', 'a_cuenta'); PERFORM t_cancel(y, 'reprogramar');
  UPDATE appointments SET status = 'scheduled' WHERE id = x;
  SELECT * INTO r FROM clinical_followups WHERE source_id = x;
  ASSERT r.status = 'cerrado_manual' AND r.closure_reason = 'reactivada' AND r.is_resolved
     AND r.contact_events -> -1 ->> 'type' = 'reactivada', 'A10: reactivada';
  ASSERT t_open(y) = 1, 'A10: la otra sigue abierta';
  SELECT * INTO ap FROM appointments WHERE id = x;
  ASSERT ap.cancelled_at IS NULL AND ap.cancelled_by IS NULL
     AND ap.cancel_outcome IS NULL AND ap.cancel_money IS NULL, 'A10: estampa limpia';
  -- Volver a cancelarla abre un ciclo nuevo.
  PERFORM t_cancel(x, 'reprogramar');
  ASSERT t_open(x) = 1, 'A10: nuevo ciclo';
  SELECT * INTO ap FROM appointments WHERE id = x;
  ASSERT ap.cancelled_at IS NOT NULL, 'A10: re-estampada';
  RAISE NOTICE 'PASS  A10 reactivar cierra solo su tarjeta (reactivada) y limpia cancelled_*/cancel_*; re-cancelar abre otra';
END $$;

DO $$
DECLARE a uuid; b uuid; r clinical_followups;
BEGIN
  -- "Sin respuesta" reciente → reprogramada_tarde; vieja (> 60 días) no se toca.
  a := t_appt('p6', 'eco', t_today() + 1);  PERFORM t_cancel(a, 'reprogramar');
  b := t_appt('p6', 'eco', t_today() + 1, 'scheduled', NULL, 'org1', '12:00');
  -- b nace viva del mismo servicio: cerraría a. Se reabre a a mano para el caso.
  UPDATE clinical_followups SET status = 'desistido_silencioso', closure_reason = 'desistido_silencioso',
         closed_at = now() - interval '10 days' WHERE source_id = a;
  PERFORM t_cancel(b, 'reprogramar');
  UPDATE clinical_followups SET status = 'vencido', closed_at = now() - interval '90 days' WHERE source_id = b;
  PERFORM t_appt('p6', 'eco', t_today() + 15);
  SELECT * INTO r FROM clinical_followups WHERE source_id = a;
  ASSERT r.status = 'cerrado_manual' AND r.closure_reason = 'reprogramada_tarde' AND r.is_resolved,
         'A11: reprogramada_tarde (' || r.status || '/' || r.closure_reason || ')';
  SELECT * INTO r FROM clinical_followups WHERE source_id = b;
  ASSERT r.status = 'vencido', 'A11: vencido viejo intacto';
  RAISE NOTICE 'PASS  A11 desistido_silencioso reciente se cierra como reprogramada_tarde; > 60 días no';
END $$;

DO $$
DECLARE a uuid; n int;
BEGIN
  -- Sin paciente: nada, y la cita se cancela igual. Seguimiento de otra regla intacto.
  INSERT INTO appointments(organization_id, service_id, appointment_date) VALUES (t_id('org1'), t_id('eco'), t_today()+2)
    RETURNING id INTO a;
  PERFORM t_cancel(a, 'reprogramar');
  ASSERT (SELECT status FROM appointments WHERE id = a) = 'cancelled' AND t_open(a) = 0, 'A12: sin paciente';
  INSERT INTO clinical_followups(organization_id, patient_id, reason, rule_key, status)
    VALUES (t_id('org1'), t_id('p7'), 'otro', 'core.service_followup', 'pendiente');
  a := t_appt('p7', 'eco', t_today() + 2); PERFORM t_cancel(a, 'reprogramar');
  PERFORM t_appt('p7', 'eco', t_today() + 9);
  SELECT count(*) INTO n FROM clinical_followups WHERE rule_key = 'core.service_followup' AND status = 'pendiente';
  ASSERT n = 1 AND t_open(a) = 0, 'A12: otra regla intacta';
  RAISE NOTICE 'PASS  A12 sin paciente no crea; seguimientos de otras reglas no se tocan';
END $$;

-- ═══ B. RPC appointment_transfer_payments ═══════════════════════════
DO $$
DECLARE
  o uuid; nw uuid; o2 uuid; n2 uuid; closed_shift uuid; e1 uuid; e_pos uuid; e2 uuid;
  res json; pp patient_payments; ap appointments; n int; total_before numeric; total_after numeric;
BEGIN
  o  := t_appt('p8', 'eco', t_today() + 1, 'scheduled', NULL, 'org1', '08:00');
  nw := t_appt('p8', 'eco', t_today() + 9, 'scheduled', NULL, 'org1', '16:30');
  INSERT INTO einvoices(organization_id, appointment_id, total) VALUES (t_id('org1'), o, 100) RETURNING id INTO e1;
  INSERT INTO einvoices(organization_id, appointment_id, total) VALUES (t_id('org1'), o, 30) RETURNING id INTO e_pos;
  UPDATE appointments SET einvoice_id = e1 WHERE id = o;
  INSERT INTO cash_shifts(organization_id, opened_by, status) VALUES (t_id('org1'), t_id('recep'), 'closed')
    RETURNING id INTO closed_shift;
  INSERT INTO patient_payments(id, organization_id, patient_id, appointment_id, amount, einvoice_id, notes, payment_date) VALUES
    ('b1000000-0000-0000-0000-000000000001', t_id('org1'), t_id('p8'), o, 100, e1, 'Yape', current_date - 3);
  INSERT INTO patient_payments(id, organization_id, patient_id, appointment_id, amount, cash_shift_id, payment_date) VALUES
    ('b1000000-0000-0000-0000-000000000002', t_id('org1'), t_id('p8'), o, 50, closed_shift, current_date - 2);  -- turno cerrado
  INSERT INTO patient_payments(id, organization_id, patient_id, appointment_id, amount, source, einvoice_id) VALUES
    ('b1000000-0000-0000-0000-000000000003', t_id('org1'), t_id('p8'), o, 30, 'pos', e_pos);                    -- farmacia
  INSERT INTO patient_payments(id, organization_id, patient_id, appointment_id, amount, treatment_plan_id) VALUES
    ('b1000000-0000-0000-0000-000000000004', t_id('org1'), t_id('p8'), o, 40, gen_random_uuid());               -- plan
  -- Un cobro de tratamiento no puede vivir en una cita (CHECK single container).
  BEGIN
    INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount, treatment_id)
      VALUES (t_id('org1'), t_id('p8'), o, 10, gen_random_uuid());
    RAISE EXCEPTION 'B1: el CHECK single container no saltó';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM t_cancel(o, 'reprogramar', 'a_cuenta');
  SELECT sum(amount) INTO total_before FROM patient_payments WHERE patient_id = t_id('p8');

  res := appointment_transfer_payments(o, nw);
  ASSERT (res->>'moved_count')::int = 2 AND (res->>'amount')::numeric = 150
     AND (res->>'einvoices_moved')::int = 1, 'B1: resultado ' || res::text;

  SELECT * INTO pp FROM patient_payments WHERE id = 'b1000000-0000-0000-0000-000000000001';
  ASSERT pp.appointment_id = nw AND pp.transferred_from_appointment_id = o
     AND pp.transferred_at IS NOT NULL AND pp.transferred_by = t_id('recep')
     AND pp.amount = 100 AND pp.payment_date = current_date - 3
     AND pp.notes = 'Yape · [Adelanto trasladado]: desde la cita del ' || to_char(t_today() + 1, 'DD/MM') || ' 08:00',
     'B1: pago 1 ' || coalesce(pp.notes, '∅');
  SELECT * INTO pp FROM patient_payments WHERE id = 'b1000000-0000-0000-0000-000000000002';
  ASSERT pp.appointment_id = nw AND pp.cash_shift_id = closed_shift AND pp.amount = 50,
     'B1: pago de turno cerrado se traslada sin tocar monto/turno';
  SELECT count(*) INTO n FROM patient_payments
   WHERE id IN ('b1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000004') AND appointment_id = o;
  ASSERT n = 2, 'B1: farmacia y plan se quedan';
  ASSERT (SELECT appointment_id FROM einvoices WHERE id = e1) = nw, 'B1: la boleta viaja (mismo servicio)';
  ASSERT (SELECT appointment_id FROM einvoices WHERE id = e_pos) = o, 'B1: el comprobante de farmacia no viaja';
  SELECT * INTO ap FROM appointments WHERE id = o;
  ASSERT ap.notes LIKE '[Adelanto trasladado]: S/150.00 a la cita del ' || to_char(t_today() + 9, 'DD/MM') || ' 16:30 (con su comprobante) — %'
     AND ap.einvoice_id IS NULL, 'B1: nota origen ' || coalesce(ap.notes, '∅');
  SELECT * INTO ap FROM appointments WHERE id = nw;
  ASSERT ap.notes LIKE '[Adelanto trasladado]: S/150.00 desde la cita cancelada del ' || to_char(t_today() + 1, 'DD/MM') || ' 08:00%'
     AND ap.einvoice_id = e1, 'B1: nota destino ' || coalesce(ap.notes, '∅');
  SELECT sum(amount) INTO total_after FROM patient_payments WHERE patient_id = t_id('p8');
  ASSERT total_before = total_after, 'B1: el total cobrado a la paciente no cambia';

  -- Idempotente.
  res := appointment_transfer_payments(o, nw);
  ASSERT (res->>'moved_count')::int = 0 AND (res->>'amount')::numeric = 0, 'B2: segunda llamada ' || res::text;
  ASSERT (SELECT count(*) FROM appointments WHERE id = nw AND notes LIKE '%[Adelanto trasladado]%[Adelanto trasladado]%') = 0,
         'B2: sin nota duplicada';
  RAISE NOTICE 'PASS  B1 traslada solo filas clínicas sin plan/tratamiento, enteras, con rastro y boleta (mismo servicio); total intacto';
  RAISE NOTICE 'PASS  B2 segunda llamada mueve 0';

  -- Otro servicio: el pago viaja, la boleta no.
  o2 := t_appt('p8', 'con', t_today() + 1);
  n2 := t_appt('p8', 'lab', t_today() + 9);
  INSERT INTO einvoices(organization_id, appointment_id, total) VALUES (t_id('org1'), o2, 80) RETURNING id INTO e2;
  INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount, einvoice_id)
    VALUES (t_id('org1'), t_id('p8'), o2, 80, e2);
  PERFORM t_cancel(o2, 'reprogramar');   -- cancel_money NULL (flujo viejo) también es trasladable
  res := appointment_transfer_payments(o2, n2);
  ASSERT (res->>'moved_count')::int = 1 AND (res->>'einvoices_moved')::int = 0, 'B3: ' || res::text;
  ASSERT (SELECT appointment_id FROM einvoices WHERE id = e2) = o2, 'B3: boleta se queda';
  RAISE NOTICE 'PASS  B3 servicio distinto: el pago viaja, la boleta no';
END $$;

DO $$
DECLARE o uuid; nw uuid; other uuid; live uuid; canc uuid; res json; ok boolean;
BEGIN
  nw := t_appt('p9', 'eco', t_today() + 9);
  -- penalidad / devuelto: no se trasladan.
  FOREACH ok IN ARRAY ARRAY[true, false] LOOP
    o := t_appt('p9', 'eco', t_today() + 1);
    INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount) VALUES (t_id('org1'), t_id('p9'), o, 60);
    PERFORM t_cancel(o, 'reprogramar', CASE WHEN ok THEN 'penalidad' ELSE 'devuelto' END);
    BEGIN
      PERFORM appointment_transfer_payments(o, nw);
      RAISE EXCEPTION 'B4: debió rechazar %', CASE WHEN ok THEN 'penalidad' ELSE 'devuelto' END;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    ASSERT (SELECT count(*) FROM patient_payments WHERE appointment_id = o) = 1, 'B4: no se movió';
  END LOOP;

  -- Otra paciente / origen no cancelado / destino cancelado / misma cita.
  o := t_appt('p9', 'eco', t_today() + 1);  PERFORM t_cancel(o, 'reprogramar', 'a_cuenta');
  other := t_appt('p10', 'eco', t_today() + 9);
  live  := t_appt('p9', 'con', t_today() + 2);
  canc  := t_appt('p9', 'con', t_today() + 3); PERFORM t_cancel(canc, 'no_vuelve');
  BEGIN PERFORM appointment_transfer_payments(o, other); RAISE EXCEPTION 'B5: otra paciente';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN PERFORM appointment_transfer_payments(live, nw); RAISE EXCEPTION 'B5: origen vivo';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN PERFORM appointment_transfer_payments(o, canc); RAISE EXCEPTION 'B5: destino cancelado';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN PERFORM appointment_transfer_payments(o, o); RAISE EXCEPTION 'B5: misma cita';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM appointment_transfer_payments(o, gen_random_uuid()); RAISE EXCEPTION 'B5: destino inexistente';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  RAISE NOTICE 'PASS  B4 penalidad / devuelto no se trasladan';
  RAISE NOTICE 'PASS  B5 rechaza otra paciente, origen no cancelado, destino cancelado, misma cita, cita inexistente';
END $$;

-- Devolución en Caja hecha en el turno del ADMIN: recepción no la ve por
-- RLS, pero el traslado igual no mueve nada.
DO $$
DECLARE o uuid; nw uuid; sh uuid;
BEGIN
  o  := t_appt('p11', 'eco', t_today() + 1);
  nw := t_appt('p11', 'eco', t_today() + 9);
  INSERT INTO t_ids(k, id) VALUES ('B6o', o), ('B6n', nw);
  INSERT INTO patient_payments(id, organization_id, patient_id, appointment_id, amount, created_at) VALUES
    ('b6000000-0000-0000-0000-000000000001', t_id('org1'), t_id('p11'), o, 100, now() - interval '2 hours'),
    ('b6000000-0000-0000-0000-000000000002', t_id('org1'), t_id('p11'), o, 50,  now() - interval '1 hour');
  INSERT INTO cash_shifts(organization_id, opened_by) VALUES (t_id('org1'), t_id('admin')) RETURNING id INTO sh;
  -- appointment_cancel_refund liga la devolución al ÚLTIMO pago aunque devuelva más.
  INSERT INTO cash_movements(organization_id, shift_id, movement_type, amount, payment_id, created_by)
    VALUES (t_id('org1'), sh, 'devolucion', -120, 'b6000000-0000-0000-0000-000000000002', t_id('admin'));
  PERFORM t_cancel(o, 'reprogramar', 'a_cuenta');
END $$;

-- ═══ C. Como `authenticated` (RLS real) ═════════════════════════════
SET ROLE authenticated;
SELECT set_config('test.uid', t_id('recep')::text, false);

DO $$
DECLARE res json; n int;
BEGIN
  SELECT count(*) INTO n FROM cash_movements; ASSERT n = 0, 'C1: recepción no ve la caja del admin';
  res := appointment_transfer_payments(t_id('B6o'), t_id('B6n'));
  ASSERT (res->>'moved_count')::int = 0 AND res->>'skipped' = 'devolucion', 'C1: ' || res::text;
  SELECT count(*) INTO n FROM patient_payments WHERE appointment_id = t_id('B6o'); ASSERT n = 2, 'C1: nada se movió';
  RAISE NOTICE 'PASS  C1 con devolución en Caja (turno ajeno, invisible por RLS) no se traslada nada';
END $$;

DO $$
DECLARE a uuid; nw uuid; res json; r record;
BEGIN
  -- Recepción cancela → tarjeta; agenda la nueva → se cierra; traslada → ok.
  a := t_appt('p12', 'eco', t_today() + 2);
  INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount) VALUES (t_id('org1'), t_id('p12'), a, 70);
  PERFORM t_cancel(a, 'reprogramar', 'a_cuenta');
  ASSERT t_open(a) = 1, 'C2: tarjeta como authenticated';
  SELECT cancelled_by INTO r FROM appointments WHERE id = a;
  ASSERT r.cancelled_by = t_id('recep'), 'C2: cancelled_by';
  nw := t_appt('p12', 'con', t_today() + 6, 'scheduled', a);
  ASSERT t_open(a) = 0, 'C2: cierre como authenticated';
  res := appointment_transfer_payments(a, nw);
  ASSERT (res->>'moved_count')::int = 1 AND (res->>'amount')::numeric = 70, 'C2: ' || res::text;
  RAISE NOTICE 'PASS  C2 recepción (authenticated, INVOKER) crea, cierra y traslada';
END $$;

-- Otra org no ve ni mueve nada.
SELECT set_config('test.uid', t_id('other')::text, false);
DO $$
DECLARE o uuid; nw uuid;
BEGIN
  SELECT id INTO o FROM t_ids WHERE k = 'B6o'; SELECT id INTO nw FROM t_ids WHERE k = 'B6n';
  BEGIN
    PERFORM appointment_transfer_payments(o, nw);
    RAISE EXCEPTION 'C3: otra org pudo llamar al traslado';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  ASSERT appointment_has_cash_refund(o) = false, 'C3: el helper no filtra info a otra org';
  RAISE NOTICE 'PASS  C3 otra org no ve las citas (no encontrada) y el helper no filtra';
END $$;
RESET ROLE;

-- anon no puede llamar al RPC.
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'appointment_transfer_payments(uuid,uuid)', 'EXECUTE'), 'C4: anon';
  ASSERT has_function_privilege('authenticated', 'appointment_transfer_payments(uuid,uuid)', 'EXECUTE'), 'C4: authenticated';
  ASSERT NOT has_function_privilege('anon', 'appointment_has_cash_refund(uuid)', 'EXECUTE'), 'C4: anon helper';
  RAISE NOTICE 'PASS  C4 GRANT a authenticated; anon sin EXECUTE';
END $$;

-- ═══ D. Nunca bloquea ═══════════════════════════════════════════════
SELECT set_config('test.uid', t_id('recep')::text, false);
DO $$
DECLARE a uuid; b uuid;
BEGIN
  ALTER TABLE clinical_followups ADD CONSTRAINT boom
    CHECK (rule_key IS DISTINCT FROM 'core.reschedule_pending' OR status <> 'pendiente'
           OR closure_reason IS NOT NULL) NOT VALID;
  -- La creación falla por dentro → WARNING; la cancelación pasa.
  a := t_appt('p13', 'eco', t_today() + 2);
  PERFORM t_cancel(a, 'reprogramar');
  ASSERT (SELECT status FROM appointments WHERE id = a) = 'cancelled' AND t_open(a) = 0, 'D1: cancelar no se bloquea';
  ALTER TABLE clinical_followups DROP CONSTRAINT boom;

  -- El cierre falla por dentro → WARNING; la cita nueva se guarda.
  PERFORM t_cancel(t_appt('p14', 'eco', t_today() + 2), 'reprogramar');
  ALTER TABLE clinical_followups ADD CONSTRAINT boom2
    CHECK (closure_reason IS DISTINCT FROM 'reprogramada') NOT VALID;
  b := t_appt('p14', 'eco', t_today() + 5);
  ASSERT EXISTS (SELECT 1 FROM appointments WHERE id = b), 'D2: agendar no se bloquea';
  ASSERT (SELECT count(*) FROM clinical_followups WHERE patient_id = t_id('p14') AND status = 'pendiente') = 1,
         'D2: la tarjeta sigue abierta';
  ALTER TABLE clinical_followups DROP CONSTRAINT boom2;
  RAISE NOTICE 'PASS  D1/D2 si la tarjeta no se puede crear o cerrar, la cita se cancela / agenda igual';
END $$;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM clinical_followups
   WHERE rule_key = 'core.reschedule_pending' AND status IN ('pendiente','contactado','pospuesto');
  ASSERT n > 0, 'fixture: debe quedar alguna tarjeta abierta para probar el rollback';
  RAISE NOTICE 'TODAS las pruebas de la 273 pasaron (% tarjetas abiertas quedan para el rollback)', n;
END $$;
