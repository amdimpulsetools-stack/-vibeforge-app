-- Pendiente de aplicar en producción (la aplica el fundador desde el SQL Editor)
--
-- 276: Base de conocimientos robusta para Yendy IA — fichas por servicio,
--      casos reales y guía de conversación.
--
-- Pedido del fundador (1-oct-2026): "que la base de conocimientos tenga
-- secciones por tratamiento o servicio, una sección de casos donde yo
-- añado mensajes que me envían las propias pacientes y una posible
-- respuesta hacia dónde encauzarlo, y una fórmula para guiar la
-- conversación: cálida, closer pero sin ser fría".
--
-- Qué agrega (todo aditivo; nada se borra ni se renombra):
--   1. wa_kb_entries.kind admite tipos de ficha POR SERVICIO: qué incluye,
--      para quién, beneficios, después del procedimiento, objeción. La
--      columna service_id (sin FK, rastro) ya existía desde la 275.
--   2. wa_kb_cases: casos reales ("la paciente escribió X → respondemos Y →
--      luego Z"). Son los ejemplos con los que la IA aprende el tono y el
--      encauce. Recepción puede crearlos (desde el chat, "Guardar como
--      caso"); editar y borrar es de owner/admin.
--   3. wa_inbox_settings.ai_playbook: la guía de conversación (objetivo,
--      apertura, cierre, objeciones, evitar/siempre) como jsonb. La forma
--      la valida la app (lib/inbox/playbook.ts); la base solo exige objeto.
--
-- Anti-PGRST201 (CLAUDE.md): ninguna FK nueva. service_id y los rastros a
-- conversación/mensaje son uuid SIN FK.
--
-- Rollback: rollbacks/276_wa_kb_playbook_rollback.sql
-- Pruebas:  runuser -u postgres -- bash supabase/tests/inbox/run.sh
-- ═══════════════════════════════════════════════════════════════════

SET lock_timeout = '5s';

-- ── 1. Tipos de ficha por servicio ────────────────────────────────
-- El CHECK de la 275 era inline → nombre automático wa_kb_entries_kind_check.
ALTER TABLE wa_kb_entries DROP CONSTRAINT IF EXISTS wa_kb_entries_kind_check;
ALTER TABLE wa_kb_entries ADD CONSTRAINT wa_kb_entries_kind_check CHECK (kind IN (
  -- generales (275)
  'faq', 'policy', 'service_info', 'preparation', 'general',
  -- por servicio (276)
  'includes',   -- qué incluye
  'for_whom',   -- para quién es / cuándo se indica
  'benefits',   -- beneficios y resultado esperado (sin promesas clínicas)
  'aftercare',  -- después del procedimiento
  'objection'   -- objeción frecuente y cómo responderla
));

CREATE INDEX IF NOT EXISTS idx_wa_kb_service
  ON wa_kb_entries (organization_id, service_id)
  WHERE is_active AND service_id IS NOT NULL;

COMMENT ON COLUMN wa_kb_entries.service_id IS
  'Ficha de un servicio concreto (services.id, SIN FK). NULL = ficha general. Yendy la lee debajo del servicio en el catálogo.';

-- ── 2. Casos reales ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_kb_cases (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_id             uuid,          -- SIN FK (rastro)
  intent                 text NOT NULL DEFAULT 'otro'
                         CHECK (intent IN ('precio', 'agendar', 'reprogramar', 'informacion', 'resultado', 'queja', 'saludo', 'objecion', 'otro')),
  title                  text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  patient_message        text NOT NULL CHECK (length(btrim(patient_message)) BETWEEN 1 AND 1500),
  ideal_reply            text NOT NULL CHECK (length(btrim(ideal_reply)) BETWEEN 1 AND 2000),
  guidance               text CHECK (guidance IS NULL OR length(guidance) <= 600),  -- hacia dónde encauzar después
  source_conversation_id uuid,          -- SIN FK (rastro: de qué chat salió)
  source_message_id      uuid,          -- SIN FK (rastro)
  is_active              boolean NOT NULL DEFAULT true,
  created_by             uuid,          -- SIN FK
  updated_by             uuid,          -- SIN FK
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_kb_cases_org ON wa_kb_cases (organization_id, updated_at DESC) WHERE is_active;

ALTER TABLE wa_kb_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_kb_cases_select ON wa_kb_cases;
CREATE POLICY wa_kb_cases_select ON wa_kb_cases FOR SELECT TO authenticated
  USING (wa_inbox_can_access(organization_id));
-- Recepción propone casos desde el chat (es quien conoce las respuestas
-- reales); corregir o borrar es de administración.
DROP POLICY IF EXISTS wa_kb_cases_insert ON wa_kb_cases;
CREATE POLICY wa_kb_cases_insert ON wa_kb_cases FOR INSERT TO authenticated
  WITH CHECK (wa_inbox_can_access(organization_id));
DROP POLICY IF EXISTS wa_kb_cases_update ON wa_kb_cases;
CREATE POLICY wa_kb_cases_update ON wa_kb_cases FOR UPDATE TO authenticated
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));
DROP POLICY IF EXISTS wa_kb_cases_delete ON wa_kb_cases;
CREATE POLICY wa_kb_cases_delete ON wa_kb_cases FOR DELETE TO authenticated
  USING (is_org_admin(organization_id));

COMMENT ON TABLE wa_kb_cases IS
  'Yendy IA: casos reales (mensaje de la paciente → respuesta ideal → hacia dónde encauzar). Ejemplos de tono y encauce para los borradores. Inserta cualquier miembro con acceso a Conversaciones; edita/borra owner/admin.';

-- ── 3. Guía de conversación ───────────────────────────────────────
ALTER TABLE wa_inbox_settings
  ADD COLUMN IF NOT EXISTS ai_playbook jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE wa_inbox_settings DROP CONSTRAINT IF EXISTS wa_inbox_settings_ai_playbook_check;
ALTER TABLE wa_inbox_settings ADD CONSTRAINT wa_inbox_settings_ai_playbook_check
  CHECK (jsonb_typeof(ai_playbook) = 'object' AND pg_column_size(ai_playbook) <= 16384);

COMMENT ON COLUMN wa_inbox_settings.ai_playbook IS
  'Guía de conversación de Yendy IA: {goal, opening, closing, objections[{objection,response}], avoid[], always[]}. Vacío = la app usa la fórmula sugerida.';

RESET lock_timeout;
