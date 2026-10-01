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
