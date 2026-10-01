-- Pendiente de aplicar en producción.
--
-- ═══════════════════════════════════════════════════════════════════
-- 275: Conversaciones — bandeja de WhatsApp (CRM WhatsApp + Captación)
--      MVP. Diseño: docs/research/whatsapp-inbox-crm-2026-09.md
--
-- ADITIVA. No toca appointments, patients, patient_payments ni nada de
-- la agenda: ni triggers, ni columnas, ni políticas. Solo:
--   · columnas NUEVAS en wa_conversations (mig 206), todas con default,
--     que captacion_summary no lee (sus cifras no cambian);
--   · tablas NUEVAS wa_* / org_tags;
--   · funciones NUEVAS (las de escritura, solo service_role).
--
-- ── Qué agrega ────────────────────────────────────────────────────
--   wa_messages             línea de tiempo única: entrantes, salientes
--                           y notas internas. wamid UNIQUE (idempotencia
--                           ante reintentos de Meta), client_msg_id
--                           UNIQUE por org (anti doble envío; viaja como
--                           biz_opaque_callback_data).
--   wa_inbox_settings       por org: doctores con acceso (off por
--                           defecto), modelo de IA (Haiku / Sonnet), voz.
--   org_tags + wa_conversation_tags   etiquetas para filtrar.
--   wa_quick_replies        respuestas rápidas con /atajo.
--   wa_scheduled_messages   mensajes / plantillas programados.
--   wa_kb_entries           base de conocimientos editable (Yendy IA).
--   wa_kb_gaps              "bandeja de brechas": lo que la IA no supo.
--   wa_ai_suggestions       registro de cada sugerencia (uso, costo).
--
-- ── Quién ve qué ──────────────────────────────────────────────────
-- wa_inbox_can_access(org): miembro ACTIVO de la org y, si es doctor,
-- solo cuando la clínica activó "Doctores pueden ver Conversaciones".
-- Escrituras de mensajes, programados y sugerencias: SOLO por API
-- (service role) tras validar sesión, membresía, addon y rol.
--
-- ── Anti-PGRST201 (CLAUDE.md, incidente 30-sep) ───────────────────
-- Cada par de tablas tiene a lo sumo UNA FK. Los rastros
-- (last_message_id, sent_message_id, scheduled_id, ai_suggestion_id,
-- sent_by, created_by…) son uuid SIN FK.
--
-- Rollback: rollbacks/275_whatsapp_inbox_rollback.sql
-- Pruebas:  runuser -u postgres -- bash supabase/tests/inbox/run.sh
-- ═══════════════════════════════════════════════════════════════════

SET lock_timeout = '5s';

-- ── 0. wa_conversations: estado de bandeja ────────────────────────
ALTER TABLE wa_conversations
  ADD COLUMN IF NOT EXISTS inbox_status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS assigned_to uuid,            -- SIN FK (rastro)
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz, -- ventana 24 h
  ADD COLUMN IF NOT EXISTS last_outbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_id uuid,        -- SIN FK (rastro)
  ADD COLUMN IF NOT EXISTS last_message_preview text,
  ADD COLUMN IF NOT EXISTS last_message_dir text,
  ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'wa_conversations_inbox_status_check'
                    AND conrelid = 'public.wa_conversations'::regclass) THEN
    ALTER TABLE wa_conversations ADD CONSTRAINT wa_conversations_inbox_status_check
      CHECK (inbox_status IN ('open', 'closed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'wa_conversations_last_dir_check'
                    AND conrelid = 'public.wa_conversations'::regclass) THEN
    ALTER TABLE wa_conversations ADD CONSTRAINT wa_conversations_last_dir_check
      CHECK (last_message_dir IS NULL OR last_message_dir IN ('in', 'out', 'internal'));
  END IF;
END $$;

-- Lista de la bandeja: por org, ordenada por último mensaje (el índice
-- de la 206 idx_wa_conv_org_last ya cubre el orden); no leídos:
CREATE INDEX IF NOT EXISTS idx_wa_conv_unread
  ON wa_conversations (organization_id)
  WHERE unread_count > 0;

-- ── 1. Ajustes por org ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_inbox_settings (
  organization_id  uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  doctors_enabled  boolean NOT NULL DEFAULT false,
  ai_enabled       boolean NOT NULL DEFAULT true,
  ai_model         text NOT NULL DEFAULT 'claude-haiku-4-5'
                   CHECK (ai_model IN ('claude-haiku-4-5', 'claude-sonnet-5-5')),
  -- Voz de la clínica para la IA: tuteo/usted, emojis, firma.
  ai_tone          text NOT NULL DEFAULT 'calido'
                   CHECK (ai_tone IN ('calido', 'formal')),
  ai_use_emojis    boolean NOT NULL DEFAULT true,
  ai_signature     text,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid                                   -- SIN FK
);

-- ── 2. Acceso a la bandeja ─────────────────────────────────────────
-- DEFINER solo para leer organization_members / settings sin depender
-- de sus RLS; devuelve un booleano sobre el PROPIO usuario.
CREATE OR REPLACE FUNCTION wa_inbox_can_access(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM organization_members m
     WHERE m.user_id = auth.uid()
       AND m.organization_id = p_org
       AND COALESCE(m.is_active, true)
       AND (
         m.role <> 'doctor'
         OR COALESCE((SELECT s.doctors_enabled FROM wa_inbox_settings s
                       WHERE s.organization_id = p_org), false)
       )
  )
$$;

REVOKE ALL ON FUNCTION wa_inbox_can_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION wa_inbox_can_access(uuid) TO authenticated, service_role;

-- Lectura de las tablas de captura (206) con la misma regla que la
-- bandeja: la 275 pone texto de mensajes (también salientes) en
-- wa_conversations.last_message_preview, así que un doctor sin permiso o
-- un miembro inactivo no debe poder leerlas por PostgREST. Ninguna
-- pantalla las lee desde el navegador (Captación usa captacion_summary,
-- SECURITY DEFINER vía service role), así que no cambia nada visible.
DROP POLICY IF EXISTS "Members read own org wa_conversations" ON wa_conversations;
DROP POLICY IF EXISTS wa_conversations_select ON wa_conversations;
CREATE POLICY wa_conversations_select ON wa_conversations FOR SELECT TO authenticated
  USING (wa_inbox_can_access(organization_id));
DROP POLICY IF EXISTS "Members read own org wa_inbound_messages" ON wa_inbound_messages;
DROP POLICY IF EXISTS wa_inbound_messages_select ON wa_inbound_messages;
CREATE POLICY wa_inbound_messages_select ON wa_inbound_messages FOR SELECT TO authenticated
  USING (wa_inbox_can_access(organization_id));

ALTER TABLE wa_inbox_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_inbox_settings_select ON wa_inbox_settings;
CREATE POLICY wa_inbox_settings_select ON wa_inbox_settings FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids()));
DROP POLICY IF EXISTS wa_inbox_settings_write ON wa_inbox_settings;
CREATE POLICY wa_inbox_settings_write ON wa_inbox_settings FOR ALL TO authenticated
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

-- ── 3. Mensajes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
  direction        text NOT NULL CHECK (direction IN ('in', 'out', 'internal')),
  source           text NOT NULL CHECK (source IN ('patient', 'agent', 'scheduler', 'ai_agent', 'history_sync', 'business_app_echo')),
  wamid            text UNIQUE,
  client_msg_id    uuid,
  type             text NOT NULL DEFAULT 'text',
  body             text,
  template_name    text,
  template_lang    text,
  template_vars    jsonb,
  reply_to_wamid   text,
  meta_media_id    text,
  media_mime       text,
  media_caption    text,
  status           text NOT NULL CHECK (status IN ('received', 'sending', 'sent', 'delivered', 'read', 'failed', 'unknown')),
  sent_at          timestamptz,
  delivered_at     timestamptz,
  read_at          timestamptz,
  failed_at        timestamptz,
  error_code       text,
  error_title      text,
  sent_by          uuid,          -- SIN FK (rastro; estampado en servidor)
  scheduled_id     uuid,          -- SIN FK (rastro)
  ai_suggestion_id uuid,          -- SIN FK (rastro)
  ts               timestamptz NOT NULL,   -- orden de la línea de tiempo
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, client_msg_id),
  CHECK (direction <> 'internal' OR wamid IS NULL)   -- una nota jamás sale
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_conv_ts ON wa_messages (conversation_id, ts DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_org_ts ON wa_messages (organization_id, ts DESC);

ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_messages_select ON wa_messages;
CREATE POLICY wa_messages_select ON wa_messages FOR SELECT TO authenticated
  USING (wa_inbox_can_access(organization_id));
-- Sin políticas de escritura: todo pasa por la API (service role).

-- Backfill: lo que el capturador (F1) ya guardó pasa a la línea de
-- tiempo. Idempotente por wamid.
INSERT INTO wa_messages (organization_id, conversation_id, direction, source,
                         wamid, type, body, status, ts, created_at)
SELECT i.organization_id, i.conversation_id, 'in', 'patient',
       i.wamid, COALESCE(i.message_type, 'text'), i.body, 'received',
       i.received_at, i.created_at
  FROM wa_inbound_messages i
ON CONFLICT (wamid) DO NOTHING;

UPDATE wa_conversations c
   SET last_inbound_at = x.last_in,
       last_message_id = x.id,
       last_message_preview = left(COALESCE(x.body, '[' || x.type || ']'), 120),
       last_message_dir = 'in'
  FROM (
    SELECT DISTINCT ON (conversation_id)
           conversation_id, id, ts AS last_in, body, type
      FROM wa_messages
     WHERE direction = 'in'
     ORDER BY conversation_id, ts DESC
  ) x
 WHERE x.conversation_id = c.id
   AND c.last_inbound_at IS NULL;

-- ── 4. Etiquetas ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_tags (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  color            text NOT NULL DEFAULT '#10b981' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by       uuid,          -- SIN FK
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS org_tags_org_name_uq ON org_tags (organization_id, lower(name));

CREATE TABLE IF NOT EXISTS wa_conversation_tags (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
  tag_id           uuid NOT NULL REFERENCES org_tags(id) ON DELETE CASCADE,
  created_by       uuid,          -- SIN FK
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_wa_conv_tags_tag ON wa_conversation_tags (organization_id, tag_id);

ALTER TABLE org_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_tags_select ON org_tags;
CREATE POLICY org_tags_select ON org_tags FOR SELECT TO authenticated
  USING (wa_inbox_can_access(organization_id));
DROP POLICY IF EXISTS org_tags_insert ON org_tags;
CREATE POLICY org_tags_insert ON org_tags FOR INSERT TO authenticated
  WITH CHECK (wa_inbox_can_access(organization_id));
DROP POLICY IF EXISTS org_tags_update ON org_tags;
CREATE POLICY org_tags_update ON org_tags FOR UPDATE TO authenticated
  USING (is_org_admin(organization_id)) WITH CHECK (is_org_admin(organization_id));
DROP POLICY IF EXISTS org_tags_delete ON org_tags;
CREATE POLICY org_tags_delete ON org_tags FOR DELETE TO authenticated
  USING (is_org_admin(organization_id));

ALTER TABLE wa_conversation_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_conv_tags_select ON wa_conversation_tags;
CREATE POLICY wa_conv_tags_select ON wa_conversation_tags FOR SELECT TO authenticated
  USING (wa_inbox_can_access(organization_id));
DROP POLICY IF EXISTS wa_conv_tags_insert ON wa_conversation_tags;
CREATE POLICY wa_conv_tags_insert ON wa_conversation_tags FOR INSERT TO authenticated
  WITH CHECK (
    wa_inbox_can_access(organization_id)
    AND EXISTS (SELECT 1 FROM wa_conversations c
                 WHERE c.id = conversation_id AND c.organization_id = wa_conversation_tags.organization_id)
    AND EXISTS (SELECT 1 FROM org_tags t
                 WHERE t.id = tag_id AND t.organization_id = wa_conversation_tags.organization_id)
  );
DROP POLICY IF EXISTS wa_conv_tags_delete ON wa_conversation_tags;
CREATE POLICY wa_conv_tags_delete ON wa_conversation_tags FOR DELETE TO authenticated
  USING (wa_inbox_can_access(organization_id));

-- ── 5. Respuestas rápidas ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_quick_replies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shortcut         text NOT NULL CHECK (shortcut ~ '^[a-z0-9_-]{1,30}$'),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 60),
  body             text NOT NULL CHECK (length(body) BETWEEN 1 AND 4096),
  usage_count      integer NOT NULL DEFAULT 0,
  created_by       uuid,          -- SIN FK
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, shortcut)
);

ALTER TABLE wa_quick_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_quick_replies_select ON wa_quick_replies;
CREATE POLICY wa_quick_replies_select ON wa_quick_replies FOR SELECT TO authenticated
  USING (wa_inbox_can_access(organization_id));
DROP POLICY IF EXISTS wa_quick_replies_write ON wa_quick_replies;
CREATE POLICY wa_quick_replies_write ON wa_quick_replies FOR ALL TO authenticated
  USING (wa_inbox_can_access(organization_id))
  WITH CHECK (wa_inbox_can_access(organization_id));

-- ── 6. Programados ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_scheduled_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('text', 'template')),
  body             text,
  template_id      uuid,          -- SIN FK (whatsapp_templates; rastro)
  template_vars    jsonb,
  send_at          timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled', 'needs_template')),
  attempts         integer NOT NULL DEFAULT 0,
  last_error       text,
  sent_message_id  uuid,          -- SIN FK (rastro)
  created_by       uuid,          -- SIN FK
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'text' AND body IS NOT NULL AND length(body) BETWEEN 1 AND 4096)
      OR (kind = 'template' AND template_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_wa_sched_due ON wa_scheduled_messages (send_at) WHERE status IN ('pending', 'sending');
CREATE INDEX IF NOT EXISTS idx_wa_sched_conv ON wa_scheduled_messages (conversation_id, send_at);

ALTER TABLE wa_scheduled_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_sched_select ON wa_scheduled_messages;
CREATE POLICY wa_sched_select ON wa_scheduled_messages FOR SELECT TO authenticated
  USING (wa_inbox_can_access(organization_id));
-- Escritura solo por API (valida ventana 24 h / plantilla / org).

-- Toma atómica de vencidos (worker). Solo service_role.
CREATE OR REPLACE FUNCTION wa_claim_due_scheduled(p_limit integer DEFAULT 25, p_org uuid DEFAULT NULL)
RETURNS SETOF wa_scheduled_messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE wa_scheduled_messages s
     SET status = 'sending', attempts = s.attempts + 1, updated_at = now()
   WHERE s.id IN (
     SELECT id FROM wa_scheduled_messages
      WHERE send_at <= now()
        AND (p_org IS NULL OR organization_id = p_org)
        -- 'sending' de más de 10 min = el envío murió a medias (timeout).
        -- Retomarlo es seguro: client_msg_id = id del programado, así que
        -- si ya salió, el UNIQUE de wa_messages lo detecta y no se duplica.
        AND (status = 'pending'
             OR (status = 'sending' AND updated_at < now() - interval '10 minutes'))
      ORDER BY send_at
      LIMIT GREATEST(1, LEAST(p_limit, 100))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING s.*
$$;
REVOKE ALL ON FUNCTION wa_claim_due_scheduled(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_claim_due_scheduled(integer, uuid) TO service_role;

-- ── 7. Contadores atómicos de la conversación (solo service_role) ─
CREATE OR REPLACE FUNCTION wa_inbox_touch(
  p_conversation uuid,
  p_message uuid,
  p_dir text,
  p_ts timestamptz,
  p_preview text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE wa_conversations c
     SET last_message_at = GREATEST(c.last_message_at, p_ts),
         last_inbound_at = CASE WHEN p_dir = 'in'
                                THEN GREATEST(COALESCE(c.last_inbound_at, p_ts), p_ts)
                                ELSE c.last_inbound_at END,
         last_outbound_at = CASE WHEN p_dir = 'out'
                                 THEN GREATEST(COALESCE(c.last_outbound_at, p_ts), p_ts)
                                 ELSE c.last_outbound_at END,
         unread_count = CASE WHEN p_dir = 'in' THEN c.unread_count + 1 ELSE c.unread_count END,
         inbox_status = CASE WHEN p_dir = 'in' THEN 'open' ELSE c.inbox_status END,
         last_message_id = CASE WHEN p_ts >= c.last_message_at OR c.last_message_id IS NULL
                                THEN p_message ELSE c.last_message_id END,
         last_message_preview = CASE WHEN p_ts >= c.last_message_at OR c.last_message_preview IS NULL
                                     THEN left(p_preview, 120) ELSE c.last_message_preview END,
         last_message_dir = CASE WHEN p_ts >= c.last_message_at OR c.last_message_dir IS NULL
                                 THEN p_dir ELSE c.last_message_dir END,
         updated_at = now()
   WHERE c.id = p_conversation
$$;
REVOKE ALL ON FUNCTION wa_inbox_touch(uuid, uuid, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_inbox_touch(uuid, uuid, text, timestamptz, text) TO service_role;

-- ── 8. Base de conocimientos (capa editable) ───────────────────────
-- La capa AUTOMÁTICA (servicios, precios, doctores, sedes) se arma en
-- vivo desde las tablas del sistema: nunca se copia ni se redacta.
CREATE TABLE IF NOT EXISTS wa_kb_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind             text NOT NULL DEFAULT 'faq'
                   CHECK (kind IN ('faq', 'policy', 'service_info', 'preparation', 'general')),
  title            text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  content          text NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  service_id       uuid,          -- SIN FK (rastro: ficha de un servicio)
  is_active        boolean NOT NULL DEFAULT true,
  updated_by       uuid,          -- SIN FK
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_kb_org ON wa_kb_entries (organization_id) WHERE is_active;

ALTER TABLE wa_kb_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_kb_select ON wa_kb_entries;
CREATE POLICY wa_kb_select ON wa_kb_entries FOR SELECT TO authenticated
  USING (wa_inbox_can_access(organization_id));
DROP POLICY IF EXISTS wa_kb_write ON wa_kb_entries;
CREATE POLICY wa_kb_write ON wa_kb_entries FOR ALL TO authenticated
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

CREATE TABLE IF NOT EXISTS wa_kb_gaps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id  uuid,          -- SIN FK (rastro)
  question         text NOT NULL CHECK (length(question) BETWEEN 1 AND 500),
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'dismissed')),
  kb_entry_id      uuid,          -- SIN FK: ficha creada al responderla
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  resolved_by      uuid           -- SIN FK
);
CREATE INDEX IF NOT EXISTS idx_wa_kb_gaps_open ON wa_kb_gaps (organization_id, created_at DESC) WHERE status = 'open';

ALTER TABLE wa_kb_gaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_kb_gaps_select ON wa_kb_gaps;
CREATE POLICY wa_kb_gaps_select ON wa_kb_gaps FOR SELECT TO authenticated
  USING (wa_inbox_can_access(organization_id));
DROP POLICY IF EXISTS wa_kb_gaps_update ON wa_kb_gaps;
CREATE POLICY wa_kb_gaps_update ON wa_kb_gaps FOR UPDATE TO authenticated
  USING (is_org_admin(organization_id)) WITH CHECK (is_org_admin(organization_id));

-- ── 9. Registro de sugerencias de IA ───────────────────────────────
CREATE TABLE IF NOT EXISTS wa_ai_suggestions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
  model            text NOT NULL,
  draft            text,
  flags            jsonb NOT NULL DEFAULT '{}'::jsonb,   -- alarma, brecha, fuentes
  input_tokens     integer,
  output_tokens    integer,
  cache_read_tokens integer,
  latency_ms       integer,
  used             boolean NOT NULL DEFAULT false,       -- pasó al cuadro de texto
  requested_by     uuid,          -- SIN FK
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_ai_org_created ON wa_ai_suggestions (organization_id, created_at DESC);

ALTER TABLE wa_ai_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_ai_select ON wa_ai_suggestions;
CREATE POLICY wa_ai_select ON wa_ai_suggestions FOR SELECT TO authenticated
  USING (is_org_admin(organization_id));
-- Escritura solo por API.

COMMENT ON TABLE wa_messages IS
  'Mig 275: línea de tiempo de la bandeja (entrantes, salientes, notas internas). Escritura solo service role vía API/webhook.';
COMMENT ON FUNCTION wa_inbox_can_access(uuid) IS
  'Mig 275: miembro activo de la org; doctor solo si wa_inbox_settings.doctors_enabled.';

RESET lock_timeout;
