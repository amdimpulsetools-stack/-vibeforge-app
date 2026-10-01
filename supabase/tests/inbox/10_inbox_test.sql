\set ON_ERROR_STOP on
-- Fixture: 2 orgs; en A hay admin, recepción y doctor; en B un owner.
CREATE TABLE t_ids (k text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid());
GRANT SELECT ON t_ids TO authenticated;
CREATE FUNCTION t_id(p text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM t_ids WHERE k = p $$;
INSERT INTO t_ids(k, id) VALUES
  ('orgA', '00000000-0000-0000-0000-00000000000a'), ('orgB', '00000000-0000-0000-0000-00000000000b'),
  ('convA', '00000000-0000-0000-0000-0000000000ca'), ('convB', '00000000-0000-0000-0000-0000000000cb');
INSERT INTO t_ids(k) SELECT unnest(ARRAY['admin','recep','doc','ownerB']);
INSERT INTO organization_members(user_id, organization_id, role) VALUES
  (t_id('admin'), t_id('orgA'), 'admin'), (t_id('recep'), t_id('orgA'), 'receptionist'),
  (t_id('doc'), t_id('orgA'), 'doctor'), (t_id('ownerB'), t_id('orgB'), 'owner');

DO $$
DECLARE n int;
BEGIN
  -- Backfill: el entrante que ya estaba en wa_inbound_messages aparece en wa_messages.
  SELECT count(*) INTO n FROM wa_messages WHERE wamid = 'wamid.pre';
  ASSERT n = 1, 'B1: backfill desde wa_inbound_messages';
  ASSERT (SELECT last_inbound_at IS NOT NULL AND last_message_dir = 'in'
            FROM wa_conversations WHERE id = t_id('convA')), 'B1: contadores rellenados';
  ASSERT (SELECT unread_count FROM wa_conversations WHERE id = t_id('convA')) = 0, 'B1: no leídos arrancan en 0';
  ASSERT (SELECT c.last_message_id = m.id FROM wa_conversations c JOIN wa_messages m ON m.wamid = 'wamid.pre'
           WHERE c.id = t_id('convA')), 'B1: last_message_id apunta al último (evita falso "hilo cambió")';
  RAISE NOTICE 'PASS  B1 backfill de entrantes y contadores';
END $$;

-- Toque atómico (service role).
DO $$
DECLARE m uuid := gen_random_uuid();
BEGIN
  PERFORM wa_inbox_touch(t_id('convA'), m, 'in', now(), 'Hola, ¿precio?');
  PERFORM wa_inbox_touch(t_id('convA'), m, 'in', now(), 'Hola de nuevo');
  ASSERT (SELECT unread_count FROM wa_conversations WHERE id = t_id('convA')) = 2, 'T1: +1 por entrante';
  PERFORM wa_inbox_touch(t_id('convA'), m, 'out', now() - interval '1 day', 'viejo');
  ASSERT (SELECT last_message_preview FROM wa_conversations WHERE id = t_id('convA')) = 'Hola de nuevo',
         'T1: un mensaje más viejo no pisa el último';
  RAISE NOTICE 'PASS  T1 contadores atómicos y orden por ts';
END $$;

SET ROLE authenticated;
-- Recepción ve su org y no la ajena.
SELECT set_config('test.uid', t_id('recep')::text, false);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM wa_messages) >= 1, 'R1: recepción ve mensajes de su org';
  ASSERT NOT EXISTS (SELECT 1 FROM wa_messages WHERE organization_id = t_id('orgB')), 'R1: no ve otra org';
  INSERT INTO org_tags(organization_id, name) VALUES (t_id('orgA'), 'Nuevo lead');
  INSERT INTO wa_conversation_tags(organization_id, conversation_id, tag_id)
    SELECT t_id('orgA'), t_id('convA'), id FROM org_tags WHERE name = 'Nuevo lead';
  RAISE NOTICE 'PASS  R1 recepción: lee su org, etiqueta';
END $$;
DO $$
DECLARE e text;
BEGIN
  BEGIN
    INSERT INTO wa_conversation_tags(organization_id, conversation_id, tag_id)
      SELECT t_id('orgA'), t_id('convB'), id FROM org_tags WHERE name = 'Nuevo lead';
    RAISE EXCEPTION 'R2: etiquetó una conversación de otra org';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO wa_messages(organization_id, conversation_id, direction, source, status, ts)
      VALUES (t_id('orgA'), t_id('convA'), 'out', 'agent', 'sent', now());
    RAISE EXCEPTION 'R2: escribió un mensaje directo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM wa_inbox_touch(t_id('convA'), gen_random_uuid(), 'in', now(), 'x');
    RAISE EXCEPTION 'R2: ejecutó un RPC de service_role';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO wa_kb_entries(organization_id, title, content) VALUES (t_id('orgA'), 't', 'c');
    RAISE EXCEPTION 'R2: recepción editó la base de conocimientos';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS  R2 recepción no cruza orgs, no escribe mensajes ni KB ni llama RPCs internos';
END $$;

-- Doctor: sin acceso por defecto; con el toggle, sí.
SELECT set_config('test.uid', t_id('doc')::text, false);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM wa_messages) = 0, 'D1: doctor sin toggle no ve mensajes';
  ASSERT NOT wa_inbox_can_access(t_id('orgA')), 'D1: helper false';
  ASSERT (SELECT count(*) FROM wa_conversations) = 0, 'D1: doctor sin toggle no lee wa_conversations (previews)';
  ASSERT (SELECT count(*) FROM wa_inbound_messages) = 0, 'D1: doctor sin toggle no lee wa_inbound_messages';
  RAISE NOTICE 'PASS  D1 doctor sin acceso por defecto';
END $$;
SELECT set_config('test.uid', t_id('admin')::text, false);
INSERT INTO wa_inbox_settings(organization_id, doctors_enabled) VALUES (t_id('orgA'), true);
INSERT INTO wa_kb_entries(organization_id, title, content) VALUES (t_id('orgA'), 'Horario', 'L-V 9 a 18');
SELECT set_config('test.uid', t_id('doc')::text, false);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM wa_messages) >= 1, 'D2: doctor con toggle ve mensajes';
  RAISE NOTICE 'PASS  D2 toggle "Doctores pueden ver Conversaciones"';
END $$;
RESET ROLE;

-- Programados: toma atómica, sin doble toma.
DO $$
DECLARE n1 int; n2 int;
BEGIN
  INSERT INTO wa_scheduled_messages(organization_id, conversation_id, kind, body, send_at)
    VALUES (t_id('orgA'), t_id('convA'), 'text', 'Recordatorio', now() - interval '1 minute'),
           (t_id('orgA'), t_id('convA'), 'text', 'Futuro', now() + interval '1 day');
  SELECT count(*) INTO n1 FROM wa_claim_due_scheduled(25, NULL);
  SELECT count(*) INTO n2 FROM wa_claim_due_scheduled(25, NULL);
  ASSERT n1 = 1 AND n2 = 0, 'S1: toma solo vencidos y una sola vez';
  -- Un envío que murió a medias ('sending' > 10 min) se retoma.
  UPDATE wa_scheduled_messages SET updated_at = now() - interval '11 minutes' WHERE status = 'sending';
  SELECT count(*) INTO n1 FROM wa_claim_due_scheduled(25, NULL);
  ASSERT n1 = 1, 'S1: retoma un sending colgado';
  ASSERT NOT has_function_privilege('authenticated', 'wa_claim_due_scheduled(integer, uuid)', 'EXECUTE'), 'S1: grants';
  ASSERT NOT has_function_privilege('anon', 'wa_inbox_can_access(uuid)', 'EXECUTE'), 'S1: anon';
  RAISE NOTICE 'PASS  S1 programados: toma atómica + grants';
END $$;

-- Reglas de Yendy + prueba sin conversación.
DO $$
BEGIN
  UPDATE wa_inbox_settings SET ai_rules = 'No ofrecer descuentos', ai_hidden_service_ids = ARRAY[gen_random_uuid()]
   WHERE organization_id = t_id('orgA');
  ASSERT (SELECT cardinality(ai_hidden_service_ids) FROM wa_inbox_settings WHERE organization_id = t_id('orgA')) = 1, 'Y1: servicios ocultos';
  BEGIN
    UPDATE wa_inbox_settings SET ai_rules = repeat('x', 2001) WHERE organization_id = t_id('orgA');
    RAISE EXCEPTION 'Y1: aceptó reglas de más de 2000 caracteres';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO wa_ai_suggestions(organization_id, conversation_id, model, draft, flags)
    VALUES (t_id('orgA'), NULL, 'claude-haiku-4-5', 'hola', '{"test": true}');
  RAISE NOTICE 'PASS  Y1 reglas, servicios ocultos y pruebas sin conversación';
END $$;

-- 276: fichas por servicio, casos reales y guía de conversación.
SET ROLE authenticated;
SELECT set_config('test.uid', t_id('recep')::text, false);
DO $$
DECLARE e text;
BEGIN
  -- Recepción crea un caso (desde el chat) …
  INSERT INTO wa_kb_cases(organization_id, intent, title, patient_message, ideal_reply, guidance, created_by)
    VALUES (t_id('orgA'), 'precio', 'Precio consulta', '¿Cuánto cuesta la consulta?', 'Hola, la consulta cuesta S/ 150.00. ¿Te reservo un horario esta semana?', 'Ofrecer dos franjas', t_id('recep'));
  -- … pero no lo edita ni lo borra (RLS filtra en silencio: 0 filas).
  UPDATE wa_kb_cases SET ideal_reply = 'cambiado' WHERE organization_id = t_id('orgA');
  ASSERT (SELECT ideal_reply FROM wa_kb_cases WHERE title = 'Precio consulta') <> 'cambiado', 'Y2: recepción editó un caso';
  DELETE FROM wa_kb_cases WHERE organization_id = t_id('orgA');
  ASSERT (SELECT count(*) FROM wa_kb_cases WHERE organization_id = t_id('orgA')) = 1, 'Y2: recepción borró un caso';
  -- Ni crea casos en otra org.
  BEGIN
    INSERT INTO wa_kb_cases(organization_id, title, patient_message, ideal_reply) VALUES (t_id('orgB'), 't', 'p', 'r');
    RAISE EXCEPTION 'Y2: recepción creó un caso en otra org';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS  Y2 casos: recepción propone, no edita ni cruza orgs';
END $$;
SELECT set_config('test.uid', t_id('admin')::text, false);
DO $$
BEGIN
  UPDATE wa_kb_cases SET ideal_reply = 'editado por admin' WHERE title = 'Precio consulta';
  ASSERT (SELECT ideal_reply FROM wa_kb_cases WHERE title = 'Precio consulta') = 'editado por admin', 'Y3: admin edita casos';
  -- Ficha por servicio con tipo nuevo.
  INSERT INTO wa_kb_entries(organization_id, kind, title, content, service_id)
    VALUES (t_id('orgA'), 'objection', 'Está caro', 'Explicar qué incluye y ofrecer la evaluación.', gen_random_uuid());
  BEGIN
    INSERT INTO wa_kb_entries(organization_id, kind, title, content) VALUES (t_id('orgA'), 'inventado', 't', 'c');
    RAISE EXCEPTION 'Y3: aceptó un tipo de ficha inválido';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Guía: solo objetos.
  UPDATE wa_inbox_settings SET ai_playbook = '{"goal":"agendar"}'::jsonb WHERE organization_id = t_id('orgA');
  BEGIN
    UPDATE wa_inbox_settings SET ai_playbook = '[]'::jsonb WHERE organization_id = t_id('orgA');
    RAISE EXCEPTION 'Y3: aceptó una guía que no es objeto';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS  Y3 admin edita casos, fichas por servicio con tipo nuevo y guía validada';
END $$;
RESET ROLE;

-- ── 278: resultado automático (Agendó / Asistió) desde la agenda ────
DO $$
DECLARE p uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); p3 uuid := gen_random_uuid();
        appt uuid := gen_random_uuid(); appt2 uuid := gen_random_uuid(); old_conv uuid := gen_random_uuid();
        tag_s uuid; tag_a uuid;
BEGIN
  INSERT INTO patients(id, organization_id) VALUES (p, t_id('orgA')), (p2, t_id('orgA')), (p3, t_id('orgA'));
  UPDATE wa_conversations SET patient_id = p WHERE id = t_id('convA');
  -- Cancelada: no cuenta. Paciente sin chat: no pasa nada (ni falla la cita).
  INSERT INTO appointments(organization_id, patient_id, status) VALUES (t_id('orgA'), p, 'cancelled');
  INSERT INTO appointments(organization_id, patient_id, status) VALUES (t_id('orgA'), p2, 'scheduled');
  INSERT INTO appointments(organization_id, patient_id) VALUES (t_id('orgA'), NULL);
  ASSERT (SELECT outcome FROM wa_conversations WHERE id = t_id('convA')) IS NULL, 'O1: cancelada no etiqueta';
  ASSERT (SELECT count(*) FROM org_tags WHERE system_key IS NOT NULL) = 0, 'O1: sin chat no crea etiquetas';
  -- Agendó.
  INSERT INTO appointments(id, organization_id, patient_id, status) VALUES (appt, t_id('orgA'), p, 'scheduled');
  ASSERT (SELECT outcome FROM wa_conversations WHERE id = t_id('convA')) = 'scheduled', 'O1: agendó';
  ASSERT (SELECT outcome_appointment_id FROM wa_conversations WHERE id = t_id('convA')) = appt, 'O1: rastro de la cita';
  SELECT id INTO tag_s FROM org_tags WHERE organization_id = t_id('orgA') AND system_key = 'scheduled';
  ASSERT tag_s IS NOT NULL AND (SELECT name FROM org_tags WHERE id = tag_s) = 'Agendó', 'O1: etiqueta Agendó creada sola';
  ASSERT EXISTS (SELECT 1 FROM wa_conversation_tags WHERE conversation_id = t_id('convA') AND tag_id = tag_s), 'O1: etiqueta aplicada';
  ASSERT (SELECT count(*) FROM org_tags WHERE organization_id = t_id('orgB')) = 0, 'O1: no cruza orgs';
  -- Asistió (botón "Llegó" de la agenda).
  UPDATE appointments SET arrived_at = now() WHERE id = appt;
  ASSERT (SELECT outcome FROM wa_conversations WHERE id = t_id('convA')) = 'attended', 'O1: asistió por llegada';
  SELECT id INTO tag_a FROM org_tags WHERE organization_id = t_id('orgA') AND system_key = 'attended';
  ASSERT EXISTS (SELECT 1 FROM wa_conversation_tags WHERE conversation_id = t_id('convA') AND tag_id = tag_a), 'O1: etiqueta Asistió';
  ASSERT EXISTS (SELECT 1 FROM wa_conversation_tags WHERE conversation_id = t_id('convA') AND tag_id = tag_s), 'O1: conserva Agendó';
  -- Otra cita después no retrocede; completar la misma no duplica.
  INSERT INTO appointments(id, organization_id, patient_id, status) VALUES (appt2, t_id('orgA'), p, 'confirmed');
  UPDATE appointments SET status = 'completed' WHERE id = appt;
  ASSERT (SELECT outcome FROM wa_conversations WHERE id = t_id('convA')) = 'attended', 'O1: no retrocede a agendó';
  ASSERT (SELECT count(*) FROM wa_conversation_tags ct JOIN org_tags t ON t.id = ct.tag_id
            WHERE ct.conversation_id = t_id('convA') AND t.system_key IS NOT NULL) = 2, 'O1: sin etiquetas duplicadas';
  ASSERT (SELECT count(*) FROM org_tags WHERE organization_id = t_id('orgA') AND system_key IS NOT NULL) = 2, 'O1: una etiqueta por tipo';
  -- Chat viejo (sin actividad en 60 días): no se etiqueta.
  INSERT INTO wa_conversations(id, organization_id, phone_normalized, patient_id, last_message_at)
    VALUES (old_conv, t_id('orgA'), '51987000009', p3, now() - interval '90 days');
  INSERT INTO appointments(organization_id, patient_id, status) VALUES (t_id('orgA'), p3, 'scheduled');
  ASSERT (SELECT outcome FROM wa_conversations WHERE id = old_conv) IS NULL, 'O1: chat viejo no se etiqueta';
  -- Etiqueta manual con el mismo nombre en otra org: el sistema la adopta.
  INSERT INTO org_tags(organization_id, name, color) VALUES (t_id('orgB'), 'agendó', '#64748b');
  INSERT INTO patients(id, organization_id) VALUES ('00000000-0000-0000-0000-0000000000fb', t_id('orgB'));
  UPDATE wa_conversations SET patient_id = '00000000-0000-0000-0000-0000000000fb' WHERE id = t_id('convB');
  INSERT INTO appointments(organization_id, patient_id, status) VALUES (t_id('orgB'), '00000000-0000-0000-0000-0000000000fb', 'scheduled');
  ASSERT (SELECT system_key FROM org_tags WHERE organization_id = t_id('orgB') AND name = 'agendó') = 'scheduled', 'O1: adopta la etiqueta manual';
  ASSERT (SELECT count(*) FROM org_tags WHERE organization_id = t_id('orgB')) = 1, 'O1: no duplica la etiqueta adoptada';
  RAISE NOTICE 'PASS  O1 resultado automático: Agendó / Asistió desde la agenda, sin cruzar orgs ni retroceder';
END $$;

-- Etiquetas del sistema: ni admin las borra ni renombra; color sí; quitarla de un chat sí.
SET ROLE authenticated;
SELECT set_config('test.uid', t_id('admin')::text, false);
DO $$
DECLARE tag_s uuid;
BEGIN
  SELECT id INTO tag_s FROM org_tags WHERE organization_id = t_id('orgA') AND system_key = 'scheduled';
  BEGIN
    DELETE FROM org_tags WHERE id = tag_s;
    RAISE EXCEPTION 'O2: borró una etiqueta del sistema';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE org_tags SET name = 'Otra' WHERE id = tag_s;
    RAISE EXCEPTION 'O2: renombró una etiqueta del sistema';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO org_tags(organization_id, name, color, system_key) VALUES (t_id('orgA'), 'Falsa', '#000000', 'attended');
    RAISE EXCEPTION 'O2: creó una etiqueta del sistema a mano';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE org_tags SET system_key = 'attended' WHERE organization_id = t_id('orgA') AND system_key IS NULL;
    RAISE EXCEPTION 'O2: convirtió una etiqueta normal en del sistema';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE org_tags SET color = '#ef4444' WHERE id = tag_s;
  ASSERT (SELECT color FROM org_tags WHERE id = tag_s) = '#ef4444', 'O2: el color sí se cambia';
  DELETE FROM wa_conversation_tags WHERE conversation_id = t_id('convA') AND tag_id = tag_s;
  ASSERT NOT EXISTS (SELECT 1 FROM wa_conversation_tags WHERE conversation_id = t_id('convA') AND tag_id = tag_s), 'O2: se puede quitar de un chat';
  RAISE NOTICE 'PASS  O2 etiquetas del sistema: no se borran ni renombran; color y quitar del chat sí';
END $$;
RESET ROLE;

-- Pulgar: solo -1 / 1, nota ≤ 500; recepción no lee el registro de IA.
DO $$
DECLARE s uuid;
BEGIN
  INSERT INTO wa_ai_suggestions(organization_id, conversation_id, model, draft) VALUES (t_id('orgA'), t_id('convA'), 'test', 'borrador')
    RETURNING id INTO s;
  UPDATE wa_ai_suggestions SET rating = 1, rated_at = now(), final_text = 'texto enviado' WHERE id = s;
  BEGIN
    UPDATE wa_ai_suggestions SET rating = 2 WHERE id = s;
    RAISE EXCEPTION 'F1: aceptó una valoración fuera de -1/1';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE wa_ai_suggestions SET rating_note = repeat('x', 501) WHERE id = s;
    RAISE EXCEPTION 'F1: aceptó una nota de más de 500';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS  F1 pulgar: valoración -1/1, nota acotada, texto final guardado';
END $$;

-- ── 279: casos candidatos ───────────────────────────────────────────
DO $$
DECLARE cand uuid;
BEGIN
  -- convA cerró (O1): está pendiente de minar; convB también, old_conv no (sin outcome).
  ASSERT (SELECT count(*) FROM wa_conversations WHERE organization_id = t_id('orgA') AND outcome IS NOT NULL AND mined_at IS NULL) = 1, 'M1: convA pendiente de minar';
  INSERT INTO wa_kb_case_candidates(organization_id, conversation_id, outcome, intent, title, patient_message, ideal_reply, guidance, rationale, model)
    VALUES (t_id('orgA'), t_id('convA'), 'attended', 'precio', 'Está caro', 'Está caro, lo voy a pensar', 'Te entiendo…', 'Ofrecer evaluación', 'Validó y ofreció un primer paso', 'test')
    RETURNING id INTO cand;
  UPDATE wa_conversations SET mined_at = now() WHERE id = t_id('convA');
  ASSERT (SELECT count(*) FROM wa_conversations WHERE organization_id = t_id('orgA') AND outcome IS NOT NULL AND mined_at IS NULL) = 0, 'M1: ya no está pendiente';
  BEGIN
    INSERT INTO wa_kb_case_candidates(organization_id, conversation_id, outcome, title, patient_message, ideal_reply)
      VALUES (t_id('orgA'), t_id('convA'), 'attended', 'dup', 'x', 'y');
    RAISE EXCEPTION 'M1: aceptó dos candidatos del mismo chat';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE wa_kb_case_candidates SET status = 'inventado' WHERE id = cand;
    RAISE EXCEPTION 'M1: aceptó un estado inválido';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS  M1 candidatos: uno por chat, marca de minado, estados acotados';
END $$;

-- Admin ve y borra candidatos; no inserta ni edita (eso es de la API); recepción no los ve.
SET ROLE authenticated;
SELECT set_config('test.uid', t_id('recep')::text, false);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM wa_kb_case_candidates) = 0, 'M2: recepción no ve candidatos';
END $$;
SELECT set_config('test.uid', t_id('admin')::text, false);
DO $$
DECLARE n int;
BEGIN
  ASSERT (SELECT count(*) FROM wa_kb_case_candidates) = 1, 'M2: admin ve candidatos de su org';
  UPDATE wa_kb_case_candidates SET status = 'approved';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'M2: admin no edita candidatos directamente';
  BEGIN
    INSERT INTO wa_kb_case_candidates(organization_id, conversation_id, outcome, title, patient_message, ideal_reply)
      VALUES (t_id('orgA'), t_id('convB'), 'scheduled', 't', 'x', 'y');
    RAISE EXCEPTION 'M2: admin insertó un candidato a mano';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  DELETE FROM wa_kb_case_candidates;
  ASSERT (SELECT count(*) FROM wa_kb_case_candidates) = 0, 'M2: admin borra candidatos';
  RAISE NOTICE 'PASS  M2 candidatos: solo admin los ve y borra; inserta y decide la API';
END $$;
RESET ROLE;

-- Anti-PGRST201: ningún par de tablas con más de una FK entre sí.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT LEAST(conrelid, confrelid), GREATEST(conrelid, confrelid)
      FROM pg_constraint WHERE contype = 'f'
     GROUP BY 1, 2 HAVING count(*) > 1) x;
  ASSERT n = 0, 'P1: pares con varias FKs';
  RAISE NOTICE 'PASS  P1 sin pares de tablas con varias FKs';
END $$;
