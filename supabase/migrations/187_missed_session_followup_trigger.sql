-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 187: sesión de plan perdida → seguimiento (Fase 2a)
--
-- Ver docs/research/seguimientos-genericos-core.md §4 ("Sesiones
-- perdidas — la mejor señal genérica desaprovechada").
--
-- Una `treatment_sessions` que pasa a 'missed' es la señal más limpia
-- del producto: sesión de un plan (normalmente ya pagada) que el
-- paciente no vino a hacer. Cero ambigüedad, cero configuración, y
-- genérica de verdad — vale igual para fisioterapia, odontología,
-- dermatología o nutrición. Hoy se escribe en producción y no genera
-- absolutamente nada.
--
-- ── ¿Por qué un trigger de DB y no código de servidor? ────────────
-- Porque el estado 'missed' se escribe desde DOS rutas distintas y
-- ambas desde el cliente, sin pasar por un único endpoint:
--   1. app/(dashboard)/scheduler/appointment-sidebar.tsx:678-683 —
--      al pasar la cita vinculada a 'no_show', espeja la sesión.
--   2. app/api/treatment-plans/[id]/route.ts:61-75 — PATCH de sesión
--      con `status` del `sessionUpdateSchema` (que admite 'missed').
-- Poner la creación en un solo sitio dejaría la otra ruta muda, y
-- duplicarla invita a que diverjan. El trigger las cubre a las dos.
--
-- ── SECURITY INVOKER (decisión, con el análisis de la RLS real) ───
-- La escritura de 'missed' la hace el USUARIO (cliente Supabase con su
-- sesión), no el service role, así que el INSERT en `clinical_followups`
-- tiene que pasar la RLS de esa tabla. Política real (mig 053:159-160):
--
--     CREATE POLICY "clinical_followups_insert" ON clinical_followups
--       FOR INSERT WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
--
-- Es decir: INSERT permitido a CUALQUIER miembro de la org, sin
-- restricción de rol. Y para llegar hasta aquí el usuario tuvo que pasar
-- antes la política de UPDATE de `treatment_sessions` (mig 053:61-62),
-- que es exactamente el mismo predicado sobre la misma org:
--
--     FOR UPDATE USING (organization_id IN (SELECT get_user_org_ids()));
--
-- Ambas usan `get_user_org_ids()`, así que quien puede marcar la sesión
-- puede, por construcción, insertar el seguimiento de esa misma org.
-- → INVOKER es suficiente y NO hace falta SECURITY DEFINER.
--
-- Se descarta DEFINER a propósito: elevar privilegios aquí abriría un
-- camino de escritura cross-tenant que hoy no existe (una fila de
-- `treatment_sessions` que apuntara a un plan de otra org insertaría
-- seguimientos en esa otra org saltándose la RLS), a cambio de cero
-- beneficio. Mismo criterio que mig 129/183.
--
-- ── El trigger NUNCA bloquea la escritura de la sesión ────────────
-- `EXCEPTION WHEN OTHERS` que loguea WARNING y devuelve. Marcar una
-- sesión como perdida es la operación importante; el seguimiento es un
-- efecto secundario deseable. Mismo patrón que mig 129/183.
--
-- ── CERO regresión ────────────────────────────────────────────────
-- Lee `organization_followup_settings` (mig 185) con COALESCE a false.
-- Vitra y la Dra. Patricia NO tienen fila (esa migración no hace
-- backfill a propósito) → el trigger sale sin escribir nada. Para ellas
-- esta migración es un no-op observable.
--
-- Aditiva e idempotente.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION create_missed_session_followup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id     UUID;
  v_patient_id UUID;
  v_doctor_id  UUID;
  v_title      TEXT;
  v_enabled    BOOLEAN;
  v_delay_days INTEGER;
  v_reason     TEXT;
BEGIN
  -- 1. Contexto desde el plan. `treatment_sessions` tiene su propio
  --    `organization_id`, pero la fuente de verdad de paciente y médico
  --    es el plan, así que leemos los cuatro campos de la misma fila
  --    para que no puedan quedar descuadrados entre sí.
  SELECT tp.organization_id, tp.patient_id, tp.doctor_id, tp.title
    INTO v_org_id, v_patient_id, v_doctor_id, v_title
  FROM treatment_plans tp
  WHERE tp.id = NEW.treatment_plan_id;

  -- Sin plan visible (RLS) o sin paciente no hay seguimiento posible.
  IF v_org_id IS NULL OR v_patient_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Ajustes de la org. Si NO hay fila, v_enabled queda NULL y el
  --    COALESCE lo resuelve como false: todo apagado. Ese es el
  --    contrato de la mig 185 y la garantía de no-regresión.
  SELECT s.missed_session_followup, s.missed_session_delay_days
    INTO v_enabled, v_delay_days
  FROM organization_followup_settings s
  WHERE s.organization_id = v_org_id;

  IF NOT COALESCE(v_enabled, false) THEN
    RETURN NEW;
  END IF;

  v_delay_days := COALESCE(v_delay_days, 3);

  -- 3. Guard de idempotencia. Marcar la sesión como perdida dos veces
  --    (o el espejo cita→sesión concurrente con el PATCH del plan) no
  --    debe producir dos seguimientos. La clave es el par polimórfico
  --    de la mig 184, servido por idx_clinical_followups_source.
  --    Solo bloquean los seguimientos ABIERTOS: si el anterior ya se
  --    cerró y la sesión vuelve a perderse, se crea uno nuevo, que es
  --    el comportamiento correcto.
  IF EXISTS (
    SELECT 1 FROM clinical_followups cf
    WHERE cf.organization_id = v_org_id
      AND cf.source_type = 'treatment_session'
      AND cf.source_id = NEW.id
      AND cf.status IN ('pendiente', 'contactado', 'pospuesto')
  ) THEN
    RETURN NEW;
  END IF;

  -- 4. Motivo en español, con el número de sesión y el título del plan.
  v_reason := CASE
    WHEN v_title IS NOT NULL AND btrim(v_title) <> ''
      THEN format('Sesión %s del plan «%s» perdida — reagendar',
                  NEW.session_number, v_title)
    ELSE format('Sesión %s del plan de tratamiento perdida — reagendar',
                NEW.session_number)
  END;

  -- 5. Crear el seguimiento.
  --    - `doctor_id` puede ser NULL: `treatment_plans.doctor_id` es NOT
  --      NULL hoy, pero `clinical_followups.doctor_id` dejó de serlo en
  --      la mig 182 y no queremos que un plan sin médico (futuro) rompa
  --      el trigger.
  --    - `target_category_canonical = 'core.next_visit'` (centinela de
  --      mig 182): la pasada centinela de `compute_appointment_attribution`
  --      (mig 183) lo cierra en cuanto el paciente agenda CUALQUIER cita
  --      — que es exactamente "reagendó la sesión".
  --    - `source = 'system'` (permitido por el CHECK de mig 128): no lo
  --      creó una persona ni una regla de `followup_rules`, lo creó la
  --      plataforma.
  INSERT INTO clinical_followups (
    organization_id,
    patient_id,
    doctor_id,
    priority,
    reason,
    source,
    source_type,
    source_id,
    rule_key,
    target_category_canonical,
    expected_by,
    follow_up_date,
    status
  ) VALUES (
    v_org_id,
    v_patient_id,
    v_doctor_id,
    'yellow',
    v_reason,
    'system',
    'treatment_session',
    NEW.id,
    'core.missed_session',
    'core.next_visit',
    now() + (v_delay_days || ' days')::interval,
    (now() + (v_delay_days || ' days')::interval)::date,
    'pendiente'
  );

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Marcar la sesión como perdida NUNCA debe fallar por esto.
    RAISE WARNING 'create_missed_session_followup failed for session=% plan=%: % / %',
      NEW.id, NEW.treatment_plan_id, SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION create_missed_session_followup() IS
  'Crea un clinical_followups (rule_key=core.missed_session, source_type=treatment_session) cuando una sesión de plan pasa a ''missed''. Apagado salvo que la org tenga fila en organization_followup_settings con missed_session_followup=true (mig 185). SECURITY INVOKER: la política INSERT de clinical_followups (mig 053) admite a cualquier miembro de la org, el mismo predicado que la política UPDATE de treatment_sessions.';

-- La condición de transición vive en el WHEN del trigger (no dentro de
-- la función) para que Postgres ni siquiera invoque el plpgsql en los
-- UPDATE que no cambian el estado — que son la mayoría (notas,
-- appointment_id, completed_at).
DROP TRIGGER IF EXISTS trg_treatment_sessions_missed_followup ON treatment_sessions;
CREATE TRIGGER trg_treatment_sessions_missed_followup
  AFTER UPDATE ON treatment_sessions
  FOR EACH ROW
  WHEN (NEW.status = 'missed' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION create_missed_session_followup();
