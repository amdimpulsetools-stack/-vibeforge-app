-- Rollback 276: quita casos reales, guía de conversación y los tipos de
-- ficha por servicio. ⚠ Borra wa_kb_cases y ai_playbook. Las fichas con
-- tipo nuevo no se borran: pasan a 'general' para que el CHECK original
-- vuelva a entrar. Idempotente.

DROP TABLE IF EXISTS wa_kb_cases;

ALTER TABLE wa_inbox_settings DROP CONSTRAINT IF EXISTS wa_inbox_settings_ai_playbook_check;
ALTER TABLE wa_inbox_settings DROP COLUMN IF EXISTS ai_playbook;

DROP INDEX IF EXISTS idx_wa_kb_service;
UPDATE wa_kb_entries SET kind = 'general'
 WHERE kind NOT IN ('faq', 'policy', 'service_info', 'preparation', 'general');
ALTER TABLE wa_kb_entries DROP CONSTRAINT IF EXISTS wa_kb_entries_kind_check;
ALTER TABLE wa_kb_entries ADD CONSTRAINT wa_kb_entries_kind_check
  CHECK (kind IN ('faq', 'policy', 'service_info', 'preparation', 'general'));
