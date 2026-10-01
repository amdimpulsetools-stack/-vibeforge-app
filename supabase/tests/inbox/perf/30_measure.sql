-- Mediciones de las consultas de Conversaciones sobre la semilla
-- (1 000 conversaciones / 50 000 mensajes en la org A).
--
-- Cada consulta se ejecuta con EXPLAIN (ANALYZE) y se exige:
--   · que NO haga un recorrido completo (Seq Scan) de wa_conversations
--     ni de wa_messages: con el índice correcto el costo no crece con el
--     tamaño de la tabla;
--   · un tope de tiempo generoso (en Supabase las cifras cambian; lo que
--     importa es la forma del plan y el orden de magnitud).
\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION perf_check(p_label text, p_sql text, p_max_ms numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  j jsonb; plan_text text; ms numeric; rows_out numeric;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) ' || p_sql INTO j;
  ms := (j->0->>'Execution Time')::numeric;
  rows_out := (j->0->'Plan'->>'Actual Rows')::numeric;
  plan_text := j::text;
  IF plan_text ~ '"Node Type": "Seq Scan", "Parallel Aware": (true|false), "Async Capable": (true|false), "Relation Name": "(wa_messages|wa_conversations)"'
     OR plan_text ~ '"Relation Name": "(wa_messages|wa_conversations)"[^}]*"Node Type": "Seq Scan"' THEN
    RAISE EXCEPTION 'PERF % — recorrido completo de tabla: %', p_label, plan_text;
  END IF;
  IF plan_text LIKE '%"Node Type": "Seq Scan"%' AND (plan_text LIKE '%"Relation Name": "wa_messages"%' OR plan_text LIKE '%"Relation Name": "wa_conversations"%') THEN
    -- Comprobación fina: ¿el Seq Scan es sobre una de las dos tablas grandes?
    PERFORM 1 FROM jsonb_path_query(j, '$.** ? (@."Node Type" == "Seq Scan" && (@."Relation Name" == "wa_messages" || @."Relation Name" == "wa_conversations"))');
    IF FOUND THEN
      RAISE EXCEPTION 'PERF % — Seq Scan sobre tabla grande. Plan: %', p_label, plan_text;
    END IF;
  END IF;
  IF ms > p_max_ms THEN
    RAISE EXCEPTION 'PERF % — % ms supera el tope de % ms. Plan: %', p_label, round(ms, 2), p_max_ms, plan_text;
  END IF;
  RAISE NOTICE 'PERF  %  %  ms  (filas %)', rpad(p_label, 44), lpad(round(ms, 2)::text, 7), rows_out;
END $$;

DO $$
DECLARE org uuid := t_id('orgA'); conv uuid := '00000000-0000-0000-00c0-000000000001'; kb_bytes bigint; list_bytes bigint;
BEGIN
  -- 1. Lista: como hoy (300 filas) y primera página (100).
  PERFORM perf_check('lista 300 (hoy)',
    format($q$SELECT id, phone_normalized, display_name, patient_id, inbox_status, last_message_at, last_inbound_at, last_message_preview, last_message_dir, unread_count, first_referral_headline
              FROM wa_conversations WHERE organization_id = %L ORDER BY last_message_at DESC LIMIT 300$q$, org), 30);
  PERFORM perf_check('lista página 100',
    format($q$SELECT id, phone_normalized, display_name, patient_id, inbox_status, last_message_at, last_inbound_at, last_message_preview, last_message_dir, unread_count, first_referral_headline
              FROM wa_conversations WHERE organization_id = %L ORDER BY last_message_at DESC LIMIT 100$q$, org), 20);
  -- 2. Lista: sondeo por diferencias (lo que cambió en los últimos 10 s).
  PERFORM perf_check('lista delta updated_at > hace 10 s',
    format($q$SELECT id, unread_count, last_message_at FROM wa_conversations WHERE organization_id = %L AND updated_at > now() - interval '10 seconds' ORDER BY updated_at DESC LIMIT 200$q$, org), 20);
  -- 3. Embeds de la lista (PostgREST los resuelve por lote de ids).
  PERFORM perf_check('etiquetas de 100 conversaciones',
    format($q$SELECT conversation_id, tag_id FROM wa_conversation_tags WHERE conversation_id IN (SELECT id FROM wa_conversations WHERE organization_id = %L ORDER BY last_message_at DESC LIMIT 100)$q$, org), 20);
  PERFORM perf_check('fichas de 100 conversaciones',
    format($q$SELECT p.id FROM patients p WHERE p.id IN (SELECT patient_id FROM wa_conversations WHERE organization_id = %L ORDER BY last_message_at DESC LIMIT 100)$q$, org), 20);
  -- 4. Chat: últimos 50, cargar anteriores (cursor) y delta.
  PERFORM perf_check('chat últimos 50',
    format($q$SELECT id, direction, type, body, ts, status FROM wa_messages WHERE conversation_id = %L ORDER BY ts DESC, id DESC LIMIT 50$q$, conv), 10);
  PERFORM perf_check('chat últimos 150 (hoy)',
    format($q$SELECT id, direction, type, body, ts, status FROM wa_messages WHERE conversation_id = %L ORDER BY ts DESC, id DESC LIMIT 150$q$, conv), 10);
  PERFORM perf_check('chat cargar anteriores (cursor)',
    format($q$SELECT id, direction, type, body, ts, status FROM wa_messages WHERE conversation_id = %L AND ts < now() - interval '1 day' ORDER BY ts DESC, id DESC LIMIT 50$q$, conv), 10);
  PERFORM perf_check('chat delta ts > hace 10 s',
    format($q$SELECT id, direction, type, body, ts, status FROM wa_messages WHERE conversation_id = %L AND ts > now() - interval '10 seconds' ORDER BY ts ASC LIMIT 100$q$, conv), 10);
  -- 5. Lo que lee Yendy por sugerencia.
  PERFORM perf_check('yendy: fichas activas (≤400)',
    format($q$SELECT id, kind, title, content, service_id FROM wa_kb_entries WHERE organization_id = %L AND is_active ORDER BY kind LIMIT 400$q$, org), 20);
  PERFORM perf_check('yendy: casos (≤60)',
    format($q$SELECT id, intent, title, patient_message, ideal_reply, guidance, service_id FROM wa_kb_cases WHERE organization_id = %L AND is_active ORDER BY updated_at DESC LIMIT 60$q$, org), 20);
  PERFORM perf_check('yendy: últimos 20 del chat',
    format($q$SELECT direction, type, body, media_caption, ts FROM wa_messages WHERE conversation_id = %L AND direction <> 'internal' ORDER BY ts DESC LIMIT 20$q$, conv), 10);
  -- 5b. Lo único que lee el trigger de la agenda (mig 278) por cada cita.
  PERFORM perf_check('agenda: trigger busca chat de la paciente',
    format($q$SELECT id FROM wa_conversations WHERE organization_id = %L AND patient_id = %L AND last_message_at >= now() - interval '60 days' ORDER BY last_message_at DESC LIMIT 1$q$, org, '00000000-0000-0000-00a0-000000000007'), 5);
  -- 5c. Selección de chats cerrados por minar (mig 279).
  PERFORM perf_check('minería: chats cerrados sin revisar',
    format($q$SELECT id FROM wa_conversations WHERE organization_id = %L AND outcome IS NOT NULL AND mined_at IS NULL ORDER BY outcome_at DESC LIMIT 10$q$, org), 5);
  -- 5d. Panel de medición (mig 280): una llamada, como admin de la org A.
  INSERT INTO organization_members(user_id, organization_id, role) VALUES ('00000000-0000-0000-0000-0000000000ad', org, 'admin') ON CONFLICT DO NOTHING;
  PERFORM set_config('test.uid', '00000000-0000-0000-0000-0000000000ad', false);
  PERFORM perf_check('medición: wa_inbox_metrics 30 días', format($q$SELECT wa_inbox_metrics(%L, 30)$q$, org), 150);
  PERFORM perf_check('medición: wa_inbox_metrics 90 días', format($q$SELECT wa_inbox_metrics(%L, 90)$q$, org), 250);
  -- 6. Programados vencidos (tick por minuto, todas las orgs).
  PERFORM perf_check('tick: programados vencidos',
    $q$SELECT id FROM wa_scheduled_messages WHERE send_at <= now() AND (status = 'pending' OR (status = 'sending' AND updated_at < now() - interval '10 minutes')) ORDER BY send_at LIMIT 50$q$, 10);

  -- 7. Tamaño del paquete que viaja al navegador.
  SELECT sum(octet_length(row_to_json(r)::text)) INTO list_bytes FROM (
    SELECT id, phone_normalized, display_name, patient_id, inbox_status, last_message_at, last_inbound_at, last_message_preview, last_message_dir, unread_count, first_referral_headline
    FROM wa_conversations WHERE organization_id = org ORDER BY last_message_at DESC LIMIT 300) r;
  SELECT sum(octet_length(content)) + (SELECT sum(octet_length(patient_message) + octet_length(ideal_reply)) FROM wa_kb_cases WHERE organization_id = org AND is_active)
    INTO kb_bytes FROM wa_kb_entries WHERE organization_id = org AND is_active;
  RAISE NOTICE 'SIZE  lista 300 filas ≈ % KB por sondeo (sin etiquetas ni fichas)', round(list_bytes / 1024.0, 1);
  RAISE NOTICE 'SIZE  base de conocimientos de Yendy ≈ % KB de texto (≈ % k tokens, en caché)', round(kb_bytes / 1024.0, 1), round(kb_bytes / 4000.0, 1);
  RAISE NOTICE 'PASS  PERF todas las consultas usan índice y están dentro del tope';
END $$;
