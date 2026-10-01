-- Pendiente de aplicar en producción (la aplica el fundador desde el SQL Editor)
--
-- 279: Conversaciones — casos candidatos minados de los chats que cerraron.
--
-- Fase 3 de la hoja de ruta de Yendy IA. Cuando un chat termina en cita
-- (outcome Agendó / Asistió, mig 278), la IA lo revisa una sola vez, busca
-- el tramo donde la paciente pasó de dudar a aceptar y lo propone como
-- CASO CANDIDATO (mensaje de la paciente → respuesta real de la clínica →
-- hacia dónde encauzar → por qué funcionó). Nada entra solo a la base:
-- administración aprueba (→ wa_kb_cases, el ejemplo que usa Yendy) o
-- descarta. Un candidato rechazado o un chat sin tramo útil no se vuelve
-- a minar.
--
--   · wa_kb_case_candidates: la bandeja de candidatos (solo admin la ve y
--     decide; la inserta la API con service role).
--   · wa_conversations.mined_at: marca "ya revisado" + índice parcial para
--     que la selección (outcome IS NOT NULL AND mined_at IS NULL) no crezca
--     con el tamaño de la tabla.
--   · wa_inbox_settings.ai_mined_at: última revisión de la org (el
--     automático corre como mucho una vez por semana, al abrir Ajustes).
--
-- Anti-PGRST201 (CLAUDE.md): UNA sola FK nueva, candidatos → conversación
-- (el par no tenía ninguna y no se leen juntos en un embed). service_id,
-- source_message_id, decided_by, approved_case_id: rastros uuid SIN FK.
-- Rollback: rollbacks/279_wa_case_candidates_rollback.sql
-- Pruebas:  runuser -u postgres -- bash supabase/tests/inbox/run.sh (M1, M2)
-- ═══════════════════════════════════════════════════════════════════

SET lock_timeout = '5s';

ALTER TABLE wa_conversations ADD COLUMN IF NOT EXISTS mined_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_wa_conv_to_mine
  ON wa_conversations (organization_id, outcome_at DESC)
  WHERE outcome IS NOT NULL AND mined_at IS NULL;

ALTER TABLE wa_inbox_settings ADD COLUMN IF NOT EXISTS ai_mined_at timestamptz;

CREATE TABLE IF NOT EXISTS wa_kb_case_candidates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id    uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
  outcome            text NOT NULL CHECK (outcome IN ('scheduled', 'attended')),
  score              smallint NOT NULL DEFAULT 3 CHECK (score BETWEEN 1 AND 5),
  intent             text NOT NULL DEFAULT 'otro'
                     CHECK (intent IN ('precio', 'agendar', 'reprogramar', 'informacion', 'resultado', 'queja', 'saludo', 'objecion', 'otro')),
  service_id         uuid,            -- SIN FK (rastro)
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  patient_message    text NOT NULL CHECK (length(btrim(patient_message)) BETWEEN 1 AND 1500),
  ideal_reply        text NOT NULL CHECK (length(btrim(ideal_reply)) BETWEEN 1 AND 2000),
  guidance           text CHECK (guidance IS NULL OR length(guidance) <= 600),
  rationale          text CHECK (rationale IS NULL OR length(rationale) <= 600),   -- por qué la IA cree que ayudó a cerrar
  source_message_id  uuid,            -- SIN FK (rastro: el mensaje de la paciente)
  model              text,
  decided_by         uuid,            -- SIN FK
  decided_at         timestamptz,
  approved_case_id   uuid,            -- SIN FK (rastro → wa_kb_cases)
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id)
);
CREATE INDEX IF NOT EXISTS idx_wa_kb_cand_org_status
  ON wa_kb_case_candidates (organization_id, status, created_at DESC);

ALTER TABLE wa_kb_case_candidates ENABLE ROW LEVEL SECURITY;
-- Curar ejemplos es de administración (como editar/borrar casos).
DROP POLICY IF EXISTS wa_kb_cand_select ON wa_kb_case_candidates;
CREATE POLICY wa_kb_cand_select ON wa_kb_case_candidates FOR SELECT TO authenticated
  USING (is_org_admin(organization_id));
DROP POLICY IF EXISTS wa_kb_cand_delete ON wa_kb_case_candidates;
CREATE POLICY wa_kb_cand_delete ON wa_kb_case_candidates FOR DELETE TO authenticated
  USING (is_org_admin(organization_id));
-- INSERT y UPDATE solo por API (service role): aprobar crea el caso y
-- marca el candidato en un mismo paso.

COMMENT ON TABLE wa_kb_case_candidates IS
  'Mig 279: casos propuestos por la IA a partir de chats que terminaron en cita. Admin aprueba (→ wa_kb_cases) o descarta.';
COMMENT ON COLUMN wa_conversations.mined_at IS
  'Mig 279: cuándo la IA revisó este chat cerrado en busca de un caso candidato (NULL = pendiente de revisar).';

RESET lock_timeout;
