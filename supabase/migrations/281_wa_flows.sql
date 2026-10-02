-- Pendiente de aplicar en producción (la aplica el fundador desde el SQL Editor)
--
-- 281: Conversaciones — Flows (automatizaciones con nodos), base + motor.
--
-- Diseño: docs/research/conversaciones-flows-2026-10.md (§3 reglas duras,
-- §4 arquitectura). Un flow = UN disparador + un grafo de nodos. El motor
-- corre en el servidor (al llegar un mensaje y en el tick por minuto que
-- ya mueve los programados); el editor (fase 2) y el modo Probar (fase 3)
-- usan el mismo motor puro.
--
--   · wa_flows: el borrador (definition) + estado; wa_flow_versions: lo
--     publicado, inmutable; los runs quedan fijados a su versión.
--   · wa_flow_runs: una ejecución por conversación como máximo (índice
--     único parcial): dos flows nunca se pisan. Escribe solo el servidor.
--   · wa_flow_run_events: rastro por nodo (contadores de la fase 3).
--   · wa_conversations.bot_paused_until / bot_opted_out: "una persona
--     manda" (cualquier mensaje del equipo pausa el bot) y STOP/BAJA.
--   · wa_messages: source 'flow' + columna interactive (botones / lista
--     enviados y la respuesta con su id).
--   · wa_inbox_settings: flows_enabled, horas de pausa, horario silencioso
--     y aviso de "asistente virtual" (política de Meta).
--   · RPCs de toma atómica (FOR UPDATE SKIP LOCKED) solo para service_role.
--
-- Anti-PGRST201 (CLAUDE.md): dos FKs nuevas, cada una en un par que no
-- tenía ninguna y que no se lee junto en un embed: wa_flow_runs →
-- wa_conversations y wa_flow_run_events → wa_flow_runs (wa_flow_versions →
-- wa_flows idem). flow_id / flow_version_id / published_version_id /
-- last_sent_message_id / created_by: rastros uuid SIN FK.
-- Rollback: rollbacks/281_wa_flows_rollback.sql
-- Pruebas:  runuser -u postgres -- bash supabase/tests/inbox/run.sh (FL1, FL2)
-- ═══════════════════════════════════════════════════════════════════

SET lock_timeout = '5s';

-- ── 1. Conversación: pausa del bot y opt-out ───────────────────────
ALTER TABLE wa_conversations
  ADD COLUMN IF NOT EXISTS bot_paused_until timestamptz,
  ADD COLUMN IF NOT EXISTS bot_opted_out    boolean NOT NULL DEFAULT false;

-- ── 2. Ajustes de flows ────────────────────────────────────────────
ALTER TABLE wa_inbox_settings
  ADD COLUMN IF NOT EXISTS flows_enabled     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS flows_pause_hours integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS flows_quiet_start time,
  ADD COLUMN IF NOT EXISTS flows_quiet_end   time,
  ADD COLUMN IF NOT EXISTS flows_disclosure  text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wa_inbox_settings_flows_pause_hours_check'
                    AND conrelid = 'public.wa_inbox_settings'::regclass) THEN
    ALTER TABLE wa_inbox_settings ADD CONSTRAINT wa_inbox_settings_flows_pause_hours_check
      CHECK (flows_pause_hours BETWEEN 1 AND 168);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wa_inbox_settings_flows_disclosure_check'
                    AND conrelid = 'public.wa_inbox_settings'::regclass) THEN
    ALTER TABLE wa_inbox_settings ADD CONSTRAINT wa_inbox_settings_flows_disclosure_check
      CHECK (flows_disclosure IS NULL OR length(flows_disclosure) <= 300);
  END IF;
END $$;

-- ── 3. Mensajes: origen 'flow' e interactivos ──────────────────────
ALTER TABLE wa_messages DROP CONSTRAINT IF EXISTS wa_messages_source_check;
ALTER TABLE wa_messages ADD CONSTRAINT wa_messages_source_check
  CHECK (source IN ('patient', 'agent', 'scheduler', 'ai_agent', 'history_sync', 'business_app_echo', 'flow'));
ALTER TABLE wa_messages ADD COLUMN IF NOT EXISTS interactive jsonb;

-- ── 4. Flows ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_flows (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                 text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  priority             integer NOT NULL DEFAULT 100,
  trigger              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(trigger) = 'object'),
  definition           jsonb NOT NULL DEFAULT '{}'::jsonb
                       CHECK (jsonb_typeof(definition) = 'object' AND pg_column_size(definition) <= 262144),
  version              integer NOT NULL DEFAULT 0,
  published_version_id uuid,            -- SIN FK (rastro → wa_flow_versions)
  created_by           uuid,            -- SIN FK
  updated_by           uuid,            -- SIN FK
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_flows_org ON wa_flows (organization_id, status, priority);

CREATE TABLE IF NOT EXISTS wa_flow_versions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,       -- SIN FK (la org ya está en wa_flows; evita un segundo camino de cascada)
  flow_id          uuid NOT NULL REFERENCES wa_flows(id) ON DELETE CASCADE,
  version          integer NOT NULL,
  trigger          jsonb NOT NULL,
  definition       jsonb NOT NULL CHECK (pg_column_size(definition) <= 262144),
  published_by     uuid,                -- SIN FK
  published_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, version)
);

CREATE TABLE IF NOT EXISTS wa_flow_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id      uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
  flow_id              uuid NOT NULL,   -- SIN FK (rastro: el flow puede borrarse; el run queda)
  flow_version_id      uuid,            -- SIN FK
  status               text NOT NULL DEFAULT 'running'
                       CHECK (status IN ('running', 'waiting_reply', 'waiting_delay', 'handed_off', 'done', 'failed')),
  current_node_id      text,
  context              jsonb NOT NULL DEFAULT '{}'::jsonb,
  wake_at              timestamptz,
  steps                integer NOT NULL DEFAULT 0,
  trigger_kind         text,
  last_inbound_wamid   text,
  last_sent_message_id uuid,            -- SIN FK (rastro)
  is_test              boolean NOT NULL DEFAULT false,
  claimed_at           timestamptz,
  started_at           timestamptz NOT NULL DEFAULT now(),
  ended_at             timestamptz,
  end_reason           text
);
-- Regla dura 1: un bot activo por conversación.
CREATE UNIQUE INDEX IF NOT EXISTS wa_flow_runs_one_active
  ON wa_flow_runs (conversation_id) WHERE status IN ('running', 'waiting_reply', 'waiting_delay');
CREATE INDEX IF NOT EXISTS idx_wa_flow_runs_due
  ON wa_flow_runs (wake_at) WHERE status IN ('running', 'waiting_reply', 'waiting_delay');
CREATE INDEX IF NOT EXISTS idx_wa_flow_runs_flow ON wa_flow_runs (flow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_flow_runs_conv ON wa_flow_runs (conversation_id, started_at DESC);

CREATE TABLE IF NOT EXISTS wa_flow_run_events (
  id               bigserial PRIMARY KEY,
  organization_id  uuid NOT NULL,       -- SIN FK (misma razón que wa_flow_versions)
  run_id           uuid NOT NULL REFERENCES wa_flow_runs(id) ON DELETE CASCADE,
  node_id          text,
  kind             text NOT NULL,
  payload          jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_flow_run_events_run ON wa_flow_run_events (run_id, id);

-- ── 5. RLS ─────────────────────────────────────────────────────────
ALTER TABLE wa_flows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_flows_select ON wa_flows;
CREATE POLICY wa_flows_select ON wa_flows FOR SELECT TO authenticated
  USING (wa_inbox_can_access(organization_id));
DROP POLICY IF EXISTS wa_flows_write ON wa_flows;
CREATE POLICY wa_flows_write ON wa_flows FOR ALL TO authenticated
  USING (is_org_admin(organization_id)) WITH CHECK (is_org_admin(organization_id));

ALTER TABLE wa_flow_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_flow_versions_select ON wa_flow_versions;
CREATE POLICY wa_flow_versions_select ON wa_flow_versions FOR SELECT TO authenticated
  USING (wa_inbox_can_access(organization_id));
DROP POLICY IF EXISTS wa_flow_versions_insert ON wa_flow_versions;
CREATE POLICY wa_flow_versions_insert ON wa_flow_versions FOR INSERT TO authenticated
  WITH CHECK (is_org_admin(organization_id)
              AND EXISTS (SELECT 1 FROM wa_flows f WHERE f.id = flow_id AND f.organization_id = wa_flow_versions.organization_id));
-- Inmutable: sin UPDATE ni DELETE (la cascada del flow sí la borra).

ALTER TABLE wa_flow_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_flow_runs_select ON wa_flow_runs;
CREATE POLICY wa_flow_runs_select ON wa_flow_runs FOR SELECT TO authenticated
  USING (wa_inbox_can_access(organization_id));
-- Escritura solo service role (motor).

ALTER TABLE wa_flow_run_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_flow_run_events_select ON wa_flow_run_events;
CREATE POLICY wa_flow_run_events_select ON wa_flow_run_events FOR SELECT TO authenticated
  USING (wa_inbox_can_access(organization_id));

-- ── 6. Toma atómica (solo motor) ───────────────────────────────────
-- Runs vencidos (esperas y tiempos agotados) y 'running' colgados > 2 min
-- (el proceso murió a medias; retomar es seguro: los envíos son
-- idempotentes por client_msg_id).
CREATE OR REPLACE FUNCTION wa_flow_claim_due(p_limit integer DEFAULT 25, p_org uuid DEFAULT NULL)
RETURNS SETOF wa_flow_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE wa_flow_runs r
     SET status = 'running', claimed_at = now(),
         context = r.context || jsonb_build_object('resume_from', r.status)
   WHERE r.id IN (
     SELECT id FROM wa_flow_runs
      WHERE (p_org IS NULL OR organization_id = p_org)
        AND ((status IN ('waiting_delay', 'waiting_reply') AND wake_at IS NOT NULL AND wake_at <= now())
             OR (status = 'running' AND claimed_at IS NOT NULL AND claimed_at < now() - interval '2 minutes'))
      ORDER BY wake_at NULLS FIRST
      LIMIT GREATEST(1, LEAST(p_limit, 100))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING r.*
$$;
REVOKE ALL ON FUNCTION wa_flow_claim_due(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_flow_claim_due(integer, uuid) TO service_role;

-- Llegó un entrante: el run que esperaba respuesta avanza UNA sola vez
-- (dos entrantes en el mismo segundo no avanzan dos veces).
CREATE OR REPLACE FUNCTION wa_flow_claim_for_inbound(p_conversation uuid, p_wamid text)
RETURNS SETOF wa_flow_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE wa_flow_runs r
     SET status = 'running', claimed_at = now(), last_inbound_wamid = p_wamid,
         context = r.context || jsonb_build_object('resume_from', 'waiting_reply')
   WHERE r.id IN (
     SELECT id FROM wa_flow_runs
      WHERE conversation_id = p_conversation
        AND status = 'waiting_reply'
        AND last_inbound_wamid IS DISTINCT FROM p_wamid
      FOR UPDATE SKIP LOCKED
   )
  RETURNING r.*
$$;
REVOKE ALL ON FUNCTION wa_flow_claim_for_inbound(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_flow_claim_for_inbound(uuid, text) TO service_role;

COMMENT ON TABLE wa_flows IS 'Mig 281: automatizaciones con nodos de Conversaciones (borrador + estado). Publicar crea una wa_flow_versions inmutable.';
COMMENT ON TABLE wa_flow_runs IS 'Mig 281: una ejecución de un flow sobre una conversación; a lo sumo una activa por conversación. Escribe solo el motor.';
COMMENT ON COLUMN wa_conversations.bot_paused_until IS 'Mig 281: hasta cuándo el bot no escribe en este chat (cualquier mensaje del equipo lo pausa).';
COMMENT ON COLUMN wa_conversations.bot_opted_out IS 'Mig 281: la paciente pidió no recibir mensajes automáticos (STOP / BAJA). El bot nunca más escribe aquí.';

RESET lock_timeout;
