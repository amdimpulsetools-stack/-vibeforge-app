-- Pendiente de aplicar en producción (la aplica el fundador desde el SQL Editor)
--
-- 277: Rendimiento de Conversaciones — índice para el sondeo por diferencias.
--
-- La bandeja deja de bajar las 300 conversaciones cada 8 s y pasa a pedir
-- solo "lo que cambió desde la última vez" (organization_id + updated_at).
-- Sin este índice esa consulta recorre toda la tabla (lo detectó el banco
-- de pruebas supabase/tests/inbox/perf: Seq Scan sobre wa_conversations),
-- y wa_conversations es compartida por todas las clínicas.
--
-- Solo un índice: sin tablas, columnas, FKs ni políticas nuevas.
-- Rollback: rollbacks/277_wa_inbox_perf_rollback.sql
-- ═══════════════════════════════════════════════════════════════════

SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_wa_conv_org_updated
  ON wa_conversations (organization_id, updated_at DESC);

COMMENT ON INDEX idx_wa_conv_org_updated IS
  'Mig 277: sondeo por diferencias de la bandeja (WHERE organization_id = ? AND updated_at > ?).';

RESET lock_timeout;
