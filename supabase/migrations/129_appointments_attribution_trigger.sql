-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 129: Trigger BEFORE INSERT en appointments para atribución
-- automática del módulo de Seguimientos Automatizados.
--
-- Implementa el pseudocódigo del spec sec. 4.1:
--   1. Buscar categoría canónica del servicio agendado.
--   2. Buscar seguimiento activo coincidente (mismo paciente + misma
--      categoría destino + status pendiente/contactado).
--   3. Si hay match: vincular cita y clasificar atribución según
--      first_contact_at (Categoría A vs B). Cerrar el seguimiento.
--   4. Si no hay mapeo o no hay seguimiento: 'organica' / NULL.
--   5. Si múltiples seguimientos coinciden: cierra el más antiguo.
--
-- Reglas duras:
-- - SECURITY INVOKER (no DEFINER). Confía en RLS.
-- - El trigger NUNCA debe bloquear el INSERT de la cita; cualquier
--   excepción se loguea como WARNING y la cita queda como 'organica'.
-- - attribution_set_at = NOW() siempre.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION compute_appointment_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_category_key TEXT;
  v_followup RECORD;
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

  IF v_category_key IS NULL THEN
    -- Servicio sin mapeo canónico → orgánica.
    NEW.attribution_source := 'organica';
    NEW.linked_followup_id := NULL;
    RETURN NEW;
  END IF;

  -- Paso 2: buscar el seguimiento activo más antiguo que coincida.
  -- Si hay múltiples coincidencias, cerramos solo el más antiguo y
  -- dejamos los demás abiertos (spec sec. 12.1 caso 6).
  SELECT cf.id, cf.first_contact_at
    INTO v_followup
  FROM clinical_followups cf
  WHERE cf.organization_id = NEW.organization_id
    AND cf.patient_id = NEW.patient_id
    AND cf.target_category_canonical = v_category_key
    AND cf.status IN ('pendiente','contactado')
  ORDER BY cf.created_at ASC
  LIMIT 1;

  IF v_followup.id IS NULL THEN
    -- Categoría C — no había seguimiento activo coincidente.
    NEW.attribution_source := 'organica';
    NEW.linked_followup_id := NULL;
    RETURN NEW;
  END IF;

  -- Paso 3: hay match. Vincular cita.
  NEW.linked_followup_id := v_followup.id;

  -- Paso 4: clasificar según first_contact_at.
  IF v_followup.first_contact_at IS NOT NULL
     AND v_followup.first_contact_at <= NOW() THEN
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
    WHERE id = v_followup.id
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
    WHERE id = v_followup.id
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

DROP TRIGGER IF EXISTS trg_appointments_attribution ON appointments;
CREATE TRIGGER trg_appointments_attribution
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION compute_appointment_attribution();
