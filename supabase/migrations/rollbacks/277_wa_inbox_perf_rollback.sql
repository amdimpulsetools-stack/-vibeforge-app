-- Rollback 277: quita el índice del sondeo por diferencias. Sin pérdida de
-- datos; la bandeja sigue funcionando (más lenta en orgs grandes). Idempotente.
DROP INDEX IF EXISTS idx_wa_conv_org_updated;
