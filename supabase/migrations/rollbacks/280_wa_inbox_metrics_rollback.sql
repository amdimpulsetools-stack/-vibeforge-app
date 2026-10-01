-- Rollback 280: quita la función del panel de medición. Sin pérdida de
-- datos (solo leía). Idempotente.
DROP FUNCTION IF EXISTS wa_inbox_metrics(uuid, integer);
