-- Banco de pruebas de rendimiento de Conversaciones.
-- Semilla: 1 000 conversaciones y 50 000 mensajes en la org A (más 200
-- conversaciones de "ruido" en la org B), con etiquetas y fichas, para
-- medir las consultas de la bandeja con EXPLAIN ANALYZE.
\set ON_ERROR_STOP on
SET client_min_messages = warning;

-- Pacientes para la mitad de las conversaciones.
INSERT INTO patients(id, organization_id)
SELECT ('00000000-0000-0000-00a0-' || lpad(g::text, 12, '0'))::uuid, t_id('orgA')
FROM generate_series(1, 500) g;

-- 1 000 conversaciones en A, repartidas en 90 días, la mitad con ficha.
INSERT INTO wa_conversations(id, organization_id, phone_normalized, display_name, patient_id, last_message_at, last_inbound_at,
                             last_message_preview, last_message_dir, unread_count, inbox_status, updated_at)
SELECT ('00000000-0000-0000-00c0-' || lpad(g::text, 12, '0'))::uuid,
       t_id('orgA'),
       '519' || lpad(g::text, 8, '0'),
       'Paciente ' || g,
       CASE WHEN g <= 500 THEN ('00000000-0000-0000-00a0-' || lpad(g::text, 12, '0'))::uuid END,
       now() - (g || ' minutes')::interval * 130,
       now() - (g || ' minutes')::interval * 130,
       'Mensaje de prueba ' || g,
       CASE WHEN g % 3 = 0 THEN 'out' ELSE 'in' END,
       CASE WHEN g % 7 = 0 THEN 2 ELSE 0 END,
       CASE WHEN g % 20 = 0 THEN 'closed' ELSE 'open' END,
       now() - (g || ' minutes')::interval * 130
FROM generate_series(1, 1000) g;

-- Ruido: 30 000 conversaciones de otras clínicas (la tabla es compartida;
-- así el planificador decide como en producción, no como con 1 000 filas).
INSERT INTO wa_conversations(organization_id, phone_normalized, last_message_at, last_inbound_at, updated_at)
SELECT t_id('orgB'), '518' || lpad(g::text, 8, '0'), now() - (g || ' minutes')::interval, now() - (g || ' minutes')::interval, now() - (g || ' minutes')::interval
FROM generate_series(1, 30000) g;

-- 50 000 mensajes: 50 por conversación, alternando entrante/saliente.
INSERT INTO wa_messages(organization_id, conversation_id, direction, source, type, wamid, body, status, ts)
SELECT t_id('orgA'),
       ('00000000-0000-0000-00c0-' || lpad(c::text, 12, '0'))::uuid,
       CASE WHEN m % 2 = 0 THEN 'in' ELSE 'out' END,
       CASE WHEN m % 2 = 0 THEN 'patient' ELSE 'agent' END,
       'text',
       'wamid.perf.' || c || '.' || m,
       'Texto del mensaje ' || m || ' de la conversación ' || c,
       CASE WHEN m % 2 = 0 THEN 'received' ELSE 'read' END,
       now() - (c || ' minutes')::interval * 130 - ((50 - m) || ' minutes')::interval
FROM generate_series(1, 1000) c, generate_series(1, 50) m;

-- Etiquetas: 5 etiquetas, 1 de cada 3 conversaciones etiquetada.
INSERT INTO org_tags(id, organization_id, name)
SELECT ('00000000-0000-0000-00e0-' || lpad(g::text, 12, '0'))::uuid, t_id('orgA'), 'Etiqueta ' || g FROM generate_series(1, 5) g;
INSERT INTO wa_conversation_tags(organization_id, conversation_id, tag_id)
SELECT t_id('orgA'), ('00000000-0000-0000-00c0-' || lpad(g::text, 12, '0'))::uuid,
       ('00000000-0000-0000-00e0-' || lpad(((g % 5) + 1)::text, 12, '0'))::uuid
FROM generate_series(1, 1000, 3) g;

-- Base de conocimientos y casos al tope de lo que lee Yendy.
INSERT INTO wa_kb_entries(organization_id, kind, title, content)
SELECT t_id('orgA'), 'faq', 'Pregunta ' || g, repeat('respuesta ', 20) FROM generate_series(1, 400) g;
INSERT INTO wa_kb_cases(organization_id, intent, title, patient_message, ideal_reply)
SELECT t_id('orgA'), 'precio', 'Caso ' || g, repeat('paciente ', 30), repeat('clinica ', 60) FROM generate_series(1, 120) g;

ANALYZE wa_conversations; ANALYZE wa_messages; ANALYZE wa_conversation_tags; ANALYZE patients; ANALYZE wa_kb_entries; ANALYZE wa_kb_cases;
