-- Rollback 275: quita la bandeja de WhatsApp (tablas wa_* nuevas,
-- etiquetas, funciones y columnas nuevas de wa_conversations).
-- ⚠ Borra mensajes salientes, notas internas, etiquetas, respuestas
-- rápidas, programados, base de conocimientos y registro de IA. Los
-- mensajes ENTRANTES no se pierden: siguen en wa_inbound_messages
-- (la 275 solo los copió). Captación no se ve afectada.
-- Idempotente.

DROP FUNCTION IF EXISTS wa_claim_due_scheduled(integer, uuid);
DROP FUNCTION IF EXISTS wa_inbox_touch(uuid, uuid, text, timestamptz, text);

DROP TABLE IF EXISTS wa_ai_suggestions;
DROP TABLE IF EXISTS wa_kb_gaps;
DROP TABLE IF EXISTS wa_kb_entries;
DROP TABLE IF EXISTS wa_scheduled_messages;
DROP TABLE IF EXISTS wa_quick_replies;
DROP TABLE IF EXISTS wa_conversation_tags;
DROP TABLE IF EXISTS org_tags;
DROP TABLE IF EXISTS wa_messages;

-- Devuelve la lectura de captura a la política original de la 206.
DROP POLICY IF EXISTS wa_conversations_select ON wa_conversations;
DROP POLICY IF EXISTS "Members read own org wa_conversations" ON wa_conversations;
CREATE POLICY "Members read own org wa_conversations"
  ON wa_conversations FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));
DROP POLICY IF EXISTS wa_inbound_messages_select ON wa_inbound_messages;
DROP POLICY IF EXISTS "Members read own org wa_inbound_messages" ON wa_inbound_messages;
CREATE POLICY "Members read own org wa_inbound_messages"
  ON wa_inbound_messages FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

DROP FUNCTION IF EXISTS wa_inbox_can_access(uuid);
DROP TABLE IF EXISTS wa_inbox_settings;

DROP INDEX IF EXISTS idx_wa_conv_unread;
ALTER TABLE wa_conversations
  DROP CONSTRAINT IF EXISTS wa_conversations_inbox_status_check,
  DROP CONSTRAINT IF EXISTS wa_conversations_last_dir_check,
  DROP COLUMN IF EXISTS inbox_status,
  DROP COLUMN IF EXISTS assigned_to,
  DROP COLUMN IF EXISTS last_inbound_at,
  DROP COLUMN IF EXISTS last_outbound_at,
  DROP COLUMN IF EXISTS last_message_id,
  DROP COLUMN IF EXISTS last_message_preview,
  DROP COLUMN IF EXISTS last_message_dir,
  DROP COLUMN IF EXISTS unread_count,
  DROP COLUMN IF EXISTS updated_at;
