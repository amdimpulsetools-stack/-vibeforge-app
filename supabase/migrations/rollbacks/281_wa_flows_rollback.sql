-- Rollback 281: quita Flows. ⚠ Borra flows, versiones, ejecuciones y su
-- rastro; quita la pausa del bot y el opt-out de las conversaciones (los
-- mensajes ya enviados por el bot se conservan como salientes, con
-- source 'flow' reescrito a 'scheduler' para que el CHECK original
-- vuelva a entrar). Idempotente.

DROP FUNCTION IF EXISTS wa_flow_claim_for_inbound(uuid, text);
DROP FUNCTION IF EXISTS wa_flow_claim_due(integer, uuid);

DROP TABLE IF EXISTS wa_flow_run_events;
DROP TABLE IF EXISTS wa_flow_runs;
DROP TABLE IF EXISTS wa_flow_versions;
DROP TABLE IF EXISTS wa_flows;

UPDATE wa_messages SET source = 'scheduler' WHERE source = 'flow';
ALTER TABLE wa_messages DROP CONSTRAINT IF EXISTS wa_messages_source_check;
ALTER TABLE wa_messages ADD CONSTRAINT wa_messages_source_check
  CHECK (source IN ('patient', 'agent', 'scheduler', 'ai_agent', 'history_sync', 'business_app_echo'));
ALTER TABLE wa_messages DROP COLUMN IF EXISTS interactive;

ALTER TABLE wa_inbox_settings DROP CONSTRAINT IF EXISTS wa_inbox_settings_flows_pause_hours_check;
ALTER TABLE wa_inbox_settings DROP CONSTRAINT IF EXISTS wa_inbox_settings_flows_disclosure_check;
ALTER TABLE wa_inbox_settings
  DROP COLUMN IF EXISTS flows_enabled,
  DROP COLUMN IF EXISTS flows_pause_hours,
  DROP COLUMN IF EXISTS flows_quiet_start,
  DROP COLUMN IF EXISTS flows_quiet_end,
  DROP COLUMN IF EXISTS flows_disclosure;

ALTER TABLE wa_conversations
  DROP COLUMN IF EXISTS bot_paused_until,
  DROP COLUMN IF EXISTS bot_opted_out;
