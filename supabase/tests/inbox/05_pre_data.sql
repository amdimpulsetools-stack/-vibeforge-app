-- Simula lo capturado por F1 antes de la 275 (ids fijos para el test).
INSERT INTO organizations(id, name) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'pre A'), ('00000000-0000-0000-0000-00000000000b', 'pre B');
INSERT INTO wa_conversations(id, organization_id, phone_normalized, last_message_at) VALUES
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-00000000000a', '51987000001', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-00000000000b', '51987000002', now() - interval '1 hour');
INSERT INTO wa_inbound_messages(conversation_id, organization_id, wamid, body, received_at) VALUES
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-00000000000a', 'wamid.pre', 'Hola', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-00000000000b', 'wamid.preB', 'Hola B', now() - interval '1 hour');
