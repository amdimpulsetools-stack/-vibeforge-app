-- Rollback 279: quita la bandeja de casos candidatos. ⚠ Borra los
-- candidatos pendientes y el historial de decisiones; los casos ya
-- APROBADOS no se pierden (viven en wa_kb_cases). Idempotente.

DROP TABLE IF EXISTS wa_kb_case_candidates;
DROP INDEX IF EXISTS idx_wa_conv_to_mine;
ALTER TABLE wa_conversations DROP COLUMN IF EXISTS mined_at;
ALTER TABLE wa_inbox_settings DROP COLUMN IF EXISTS ai_mined_at;
