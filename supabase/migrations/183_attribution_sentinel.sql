-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 183: segunda pasada centinela en la atribución de citas
--
-- `compute_appointment_attribution` (mig 129) solo sabe cerrar un
-- seguimiento cuando el servicio de la cita agendada tiene mapeo
-- canónico (`organization_service_canonical_mapping`). Ese mapeo es
-- 100% manual y solo existe para las orgs del Pack Fertilidad, así que
-- para una org core el trigger hacía early return con 'organica' y
-- NINGÚN seguimiento se cerraba jamás: la bandeja se volvería un
-- cementerio.
--
-- Esta migración es un CREATE OR REPLACE aditivo que conserva la
-- lógica de mig 129 tal cual y le añade una segunda pasada:
--
--   1. (existente) service_id → mapeo → category_key → seguimiento
--      abierto con ese target        ← fertilidad, sin cambios
--   2. (nuevo) si la pasada 1 no encontró seguimiento — incluido el
--      caso "servicio sin mapeo", que antes era early return —
--      buscar el seguimiento abierto más antiguo del mismo paciente
--      con target 'core.next_visit' (categoría centinela, mig 182)
--   3. clasificación Cat A / Cat B idéntica según first_contact_at
--   4. sin match → 'organica'        ← comportamiento actual
--
-- CERO regresión para las orgs con addon: sus seguimientos nunca llevan
-- `target_category_canonical = 'core.next_visit'` (las reglas de
-- fertilidad siempre apuntan a `fertility.*`), así que la pasada 2
-- nunca encuentra nada para ellas y el resultado es byte-idéntico.
--
-- Única diferencia estructural respecto a mig 129: el seguimiento
-- encontrado se guarda en dos variables escalares en vez de un RECORD.
-- Con RECORD, leer `v_followup.id` sin haber ejecutado nunca el SELECT
-- INTO (que es justo el camino "servicio sin mapeo" que ahora sigue
-- ejecutando) lanza "record is not assigned yet" — lo tragaría el
-- EXCEPTION y la pasada centinela quedaría muerta en silencio.
--
-- Reglas duras conservadas de mig 129:
-- - SECURITY INVOKER (no DEFINER). Confía en RLS.
-- - El trigger NUNCA debe bloquear el INSERT de la cita; cualquier
--   excepción se loguea como WARNING y la cita queda como 'organica'.
-- - attribution_set_at = NOW() siempre.
-- - Los UPDATE filtran también por organization_id (defense-in-depth).
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION compute_appointment_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_category_key TEXT;
  v_followup_id UUID;
  v_first_contact_at TIMESTAMPTZ;
BEGIN
  -- Default conservador. Si algo falla, la cita queda como orgánica.
  NEW.attribution_set_at := NOW();
  NEW.linked_followup_id := NULL;
  IF NEW.attribution_source IS NULL THEN
    NEW.attribution_source := 'organica';
  END IF;

  -- Si la cita no tiene patient_id no podemos atribuir; respetamos el
  -- default 'organica'.
  IF NEW.patient_id IS NULL OR NEW.service_id IS NULL OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Paso 1: categoría canónica del servicio agendado.
  SELECT m.category_key INTO v_category_key
  FROM organization_service_canonical_mapping m
  WHERE m.organization_id = NEW.organization_id
    AND m.service_id = NEW.service_id
  LIMIT 1;

  -- Paso 2 (pasada 1): buscar el seguimiento activo más antiguo que
  -- coincida con la categoría del servicio. Si hay múltiples
  -- coincidencias, cerramos solo el más antiguo y dejamos los demás
  -- abiertos (spec sec. 12.1 caso 6).
  IF v_category_key IS NOT NULL THEN
    SELECT cf.id, cf.first_contact_at
      INTO v_followup_id, v_first_contact_at
    FROM clinical_followups cf
    WHERE cf.organization_id = NEW.organization_id
      AND cf.patient_id = NEW.patient_id
      AND cf.target_category_canonical = v_category_key
      AND cf.status IN ('pendiente','contactado')
    ORDER BY cf.created_at ASC
    LIMIT 1;
  END IF;

  -- Paso 2b (pasada centinela, mig 183): sin mapeo canónico, o con
  -- mapeo pero sin seguimiento de esa categoría, preguntamos lo único
  -- que una org general necesita saber: "¿este paciente volvió a
  -- agendar algo?". El seguimiento core lleva target 'core.next_visit'.
  IF v_followup_id IS NULL THEN
    SELECT cf.id, cf.first_contact_at
      INTO v_followup_id, v_first_contact_at
    FROM clinical_followups cf
    WHERE cf.organization_id = NEW.organization_id
      AND cf.patient_id = NEW.patient_id
      AND cf.target_category_canonical = 'core.next_visit'
      AND cf.status IN ('pendiente','contactado')
    ORDER BY cf.created_at ASC
    LIMIT 1;
  END IF;

  IF v_followup_id IS NULL THEN
    -- Categoría C — no había seguimiento activo coincidente (ni por
    -- categoría del servicio ni centinela).
    NEW.attribution_source := 'organica';
    NEW.linked_followup_id := NULL;
    RETURN NEW;
  END IF;

  -- Paso 3: hay match. Vincular cita.
  NEW.linked_followup_id := v_followup_id;

  -- Paso 4: clasificar según first_contact_at. La atribución sigue
  -- siendo honesta también en la vía centinela: un cierre sin contacto
  -- previo se registra como Cat B y no infla recuperaciones.
  IF v_first_contact_at IS NOT NULL
     AND v_first_contact_at <= NOW() THEN
    -- Categoría A — recuperada con contacto.
    NEW.attribution_source := 'recovered_with_contact';
    -- Defense-in-depth: filtramos también por organization_id aunque
    -- RLS ya lo haga, para evitar cruces multi-tenant en triggers.
    UPDATE clinical_followups
    SET status = 'agendado_via_contacto',
        closure_reason = 'agendado_via_contacto',
        closed_at = NOW(),
        is_resolved = true,
        resolved_at = NOW()
    WHERE id = v_followup_id
      AND organization_id = NEW.organization_id;
  ELSE
    -- Categoría B — agendado sin contacto previo.
    NEW.attribution_source := 'agendado_sin_contacto';
    UPDATE clinical_followups
    SET status = 'agendado_organico_dentro_ventana',
        closure_reason = 'agendado_organico_dentro_ventana',
        closed_at = NOW(),
        is_resolved = true,
        resolved_at = NOW()
    WHERE id = v_followup_id
      AND organization_id = NEW.organization_id;
  END IF;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- La cita NUNCA debe fallar por la atribución. Loggeamos y
    -- caemos en 'organica' como fallback seguro.
    RAISE WARNING 'compute_appointment_attribution failed for appointment patient=% service=% org=%: % / %',
      NEW.patient_id, NEW.service_id, NEW.organization_id, SQLSTATE, SQLERRM;
    NEW.attribution_source := 'organica';
    NEW.linked_followup_id := NULL;
    NEW.attribution_set_at := NOW();
    RETURN NEW;
END;
$$;

-- El trigger de mig 129 sigue apuntando a la misma función; lo
-- recreamos igual para que la migración sea autosuficiente e
-- idempotente si se aplica sobre una base sin mig 129 vigente.
DROP TRIGGER IF EXISTS trg_appointments_attribution ON appointments;
CREATE TRIGGER trg_appointments_attribution
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION compute_appointment_attribution();
