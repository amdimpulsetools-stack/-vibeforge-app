-- Pendiente de aplicar en producción (la aplica el fundador desde el SQL Editor)
--
-- 278: Conversaciones — señales para mejorar a Yendy IA.
--
--   1. Pulgar arriba / abajo en cada sugerencia y el texto que de verdad se
--      envió: wa_ai_suggestions.rating (-1 | 1), rating_note, rated_by,
--      rated_at, final_text. Con esto se sabe qué sugirió la IA, qué
--      corrigió recepción y si gustó (base de los casos candidatos y del
--      panel de medición).
--   2. Resultado de la conversación, automático desde la agenda:
--      wa_conversations.outcome ('scheduled' = Agendó, 'attended' = Asistió),
--      outcome_at y outcome_appointment_id (rastro uuid SIN FK), más las
--      etiquetas del sistema "Agendó" / "Asistió" (org_tags.system_key) que
--      se crean solas por clínica y no se pueden borrar ni renombrar.
--   3. Trigger en appointments (AFTER INSERT y AFTER UPDATE OF status,
--      arrived_at). Reglas:
--        · NUNCA bloquea la cita: EXCEPTION WHEN OTHERS → WARNING y sigue.
--        · Costo: UNA lectura por el índice (organization_id, patient_id) de
--          wa_conversations; si la paciente no escribió por WhatsApp en los
--          últimos 60 días (120 para "asistió"), termina ahí. La agenda no
--          se entera de que existe la bandeja.
--        · SECURITY DEFINER: quien agenda (un doctor) puede no tener acceso
--          a la bandeja; la función solo toca filas de la misma org.
--        · Un chat con "Asistió" nunca retrocede a "Agendó".
--
-- Sin FKs nuevas (anti-PGRST201): outcome_appointment_id, rated_by son
-- rastros uuid sin FK. Consulta 1 de multi_fk_pairs.sql: idéntica antes
-- y después.
-- Rollback: rollbacks/278_wa_feedback_outcome_rollback.sql
-- Pruebas:  runuser -u postgres -- bash supabase/tests/inbox/run.sh (O1, O2, F1)
-- ═══════════════════════════════════════════════════════════════════

SET lock_timeout = '5s';

-- ── 1. Pulgar y texto final ────────────────────────────────────────
ALTER TABLE wa_ai_suggestions
  ADD COLUMN IF NOT EXISTS rating      smallint,
  ADD COLUMN IF NOT EXISTS rating_note text,
  ADD COLUMN IF NOT EXISTS rated_by    uuid,          -- SIN FK (rastro)
  ADD COLUMN IF NOT EXISTS rated_at    timestamptz,
  ADD COLUMN IF NOT EXISTS final_text  text;          -- lo que se envió (puede diferir del borrador)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'wa_ai_suggestions_rating_check'
                    AND conrelid = 'public.wa_ai_suggestions'::regclass) THEN
    ALTER TABLE wa_ai_suggestions ADD CONSTRAINT wa_ai_suggestions_rating_check
      CHECK (rating IS NULL OR rating IN (-1, 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'wa_ai_suggestions_rating_note_check'
                    AND conrelid = 'public.wa_ai_suggestions'::regclass) THEN
    ALTER TABLE wa_ai_suggestions ADD CONSTRAINT wa_ai_suggestions_rating_note_check
      CHECK (rating_note IS NULL OR length(rating_note) <= 500);
  END IF;
END $$;

-- Sugerencias de un chat (panel de medición y casos candidatos).
CREATE INDEX IF NOT EXISTS idx_wa_ai_conv_created
  ON wa_ai_suggestions (conversation_id, created_at DESC) WHERE conversation_id IS NOT NULL;

-- ── 2. Etiquetas del sistema ───────────────────────────────────────
ALTER TABLE org_tags ADD COLUMN IF NOT EXISTS system_key text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'org_tags_system_key_check'
                    AND conrelid = 'public.org_tags'::regclass) THEN
    ALTER TABLE org_tags ADD CONSTRAINT org_tags_system_key_check
      CHECK (system_key IS NULL OR system_key IN ('scheduled', 'attended'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS org_tags_org_system_uq
  ON org_tags (organization_id, system_key) WHERE system_key IS NOT NULL;

-- Solo el sistema crea o asigna system_key (lo marca con un ajuste local de
-- transacción); nadie borra ni renombra una etiqueta del sistema (el color
-- sí). Si la org se borra, la cascada pasa (la org ya no existe).
CREATE OR REPLACE FUNCTION org_tags_protect_system()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sys boolean := COALESCE(current_setting('wa.system_tag', true), '') = '1';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.system_key IS NOT NULL
       AND EXISTS (SELECT 1 FROM organizations WHERE id = OLD.organization_id) THEN
      RAISE EXCEPTION 'La etiqueta "%" la pone el sistema (Agendó / Asistió) y no se puede borrar', OLD.name
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.system_key IS NOT NULL AND NOT v_sys THEN
      RAISE EXCEPTION 'Las etiquetas automáticas las crea el sistema' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE
  IF NEW.system_key IS DISTINCT FROM OLD.system_key AND NOT v_sys THEN
    RAISE EXCEPTION 'Las etiquetas automáticas las asigna el sistema' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.system_key IS NOT NULL AND NEW.name IS DISTINCT FROM OLD.name THEN
    RAISE EXCEPTION 'La etiqueta "%" es automática: puedes cambiar el color, no el nombre', OLD.name
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_tags_protect_system ON org_tags;
CREATE TRIGGER trg_org_tags_protect_system
  BEFORE INSERT OR UPDATE OR DELETE ON org_tags
  FOR EACH ROW EXECUTE FUNCTION org_tags_protect_system();

-- ── 3. Resultado de la conversación ────────────────────────────────
ALTER TABLE wa_conversations
  ADD COLUMN IF NOT EXISTS outcome                text,
  ADD COLUMN IF NOT EXISTS outcome_at             timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_appointment_id uuid;   -- SIN FK (rastro)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'wa_conversations_outcome_check'
                    AND conrelid = 'public.wa_conversations'::regclass) THEN
    ALTER TABLE wa_conversations ADD CONSTRAINT wa_conversations_outcome_check
      CHECK (outcome IS NULL OR outcome IN ('scheduled', 'attended'));
  END IF;
END $$;
-- La única lectura que hace el trigger de la agenda.
CREATE INDEX IF NOT EXISTS idx_wa_conv_org_patient
  ON wa_conversations (organization_id, patient_id, last_message_at DESC) WHERE patient_id IS NOT NULL;

CREATE OR REPLACE FUNCTION wa_inbox_outcome_from_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind text;
  v_conv uuid;
  v_tag  uuid;
  r      record;
BEGIN
  IF NEW.patient_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- ¿Qué pasó con la cita?
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('scheduled', 'confirmed', 'completed') THEN
      RETURN NULL;
    END IF;
    v_kind := CASE WHEN NEW.status = 'completed' OR NEW.arrived_at IS NOT NULL THEN 'attended' ELSE 'scheduled' END;
  ELSE
    IF (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
       OR (NEW.arrived_at IS NOT NULL AND OLD.arrived_at IS NULL) THEN
      v_kind := 'attended';
    ELSIF NEW.status IN ('scheduled', 'confirmed') AND OLD.status IN ('cancelled', 'no_show') THEN
      v_kind := 'scheduled';   -- reactivada
    ELSE
      RETURN NULL;
    END IF;
  END IF;

  -- La conversación: la que ya lleva esta cita o, si no, la última de la
  -- paciente con actividad reciente (60 días; 120 para "asistió", porque la
  -- cita puede ser semanas después del chat). Sin chat reciente: nada.
  SELECT id INTO v_conv FROM wa_conversations
   WHERE organization_id = NEW.organization_id
     AND patient_id = NEW.patient_id
     AND outcome_appointment_id = NEW.id
   LIMIT 1;
  IF v_conv IS NULL THEN
    SELECT id INTO v_conv FROM wa_conversations
     WHERE organization_id = NEW.organization_id
       AND patient_id = NEW.patient_id
       AND last_message_at >= now() - (CASE WHEN v_kind = 'attended' THEN interval '120 days' ELSE interval '60 days' END)
     ORDER BY last_message_at DESC
     LIMIT 1;
  END IF;
  IF v_conv IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE wa_conversations
     SET outcome                = CASE WHEN outcome = 'attended' THEN 'attended' ELSE v_kind END,
         outcome_at             = CASE WHEN outcome = 'attended' THEN outcome_at ELSE now() END,
         outcome_appointment_id = CASE WHEN v_kind = 'attended' THEN NEW.id ELSE COALESCE(outcome_appointment_id, NEW.id) END,
         updated_at             = now()      -- la bandeja lo ve en el siguiente sondeo
   WHERE id = v_conv;

  -- Etiquetas: "Agendó" siempre; "Asistió" además cuando asistió.
  PERFORM set_config('wa.system_tag', '1', true);
  FOR r IN SELECT * FROM (VALUES ('scheduled', 'Agendó', '#10b981'), ('attended', 'Asistió', '#3b82f6')) t(k, n, c) LOOP
    CONTINUE WHEN r.k = 'attended' AND v_kind <> 'attended';
    SELECT id INTO v_tag FROM org_tags WHERE organization_id = NEW.organization_id AND system_key = r.k;
    IF v_tag IS NULL THEN
      INSERT INTO org_tags (organization_id, name, color, system_key)
        VALUES (NEW.organization_id, r.n, r.c, r.k)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_tag;
    END IF;
    IF v_tag IS NULL THEN
      -- Ya existía una etiqueta manual con ese nombre: se adopta.
      UPDATE org_tags SET system_key = r.k
       WHERE organization_id = NEW.organization_id AND lower(name) = lower(r.n) AND system_key IS NULL
       RETURNING id INTO v_tag;
    END IF;
    IF v_tag IS NOT NULL THEN
      INSERT INTO wa_conversation_tags (organization_id, conversation_id, tag_id)
        VALUES (NEW.organization_id, v_conv, v_tag)
        ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  PERFORM set_config('wa.system_tag', '', true);
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('wa.system_tag', '', true);
    RAISE WARNING 'wa_inbox_outcome_from_appointment(%) appointment=%: % / %', TG_OP, NEW.id, SQLSTATE, SQLERRM;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION wa_inbox_outcome_from_appointment() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_appointments_wa_outcome_insert ON appointments;
CREATE TRIGGER trg_appointments_wa_outcome_insert
  AFTER INSERT ON appointments
  FOR EACH ROW
  WHEN (NEW.patient_id IS NOT NULL AND NEW.status IN ('scheduled', 'confirmed', 'completed'))
  EXECUTE FUNCTION wa_inbox_outcome_from_appointment();

DROP TRIGGER IF EXISTS trg_appointments_wa_outcome_update ON appointments;
CREATE TRIGGER trg_appointments_wa_outcome_update
  AFTER UPDATE OF status, arrived_at ON appointments
  FOR EACH ROW
  WHEN (NEW.patient_id IS NOT NULL
        AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.arrived_at IS DISTINCT FROM OLD.arrived_at))
  EXECUTE FUNCTION wa_inbox_outcome_from_appointment();

COMMENT ON COLUMN wa_conversations.outcome IS
  'Mig 278: scheduled = Agendó, attended = Asistió. Lo estampa el trigger de appointments; nunca retrocede.';
COMMENT ON COLUMN org_tags.system_key IS
  'Mig 278: etiqueta automática (scheduled = Agendó, attended = Asistió). Solo el sistema la crea; no se borra ni renombra.';
COMMENT ON FUNCTION wa_inbox_outcome_from_appointment() IS
  'Mig 278: estampa Agendó/Asistió en la última conversación reciente de la paciente. Nunca bloquea la cita.';

RESET lock_timeout;
