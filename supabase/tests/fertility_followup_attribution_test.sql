-- ═══════════════════════════════════════════════════════════════════
-- Tests del trigger compute_appointment_attribution (mig 129).
-- Cubre los 8 casos del spec sec. 12.1.
--
-- Ejecutar con (rol postgres / superuser para bypassear RLS de
-- fixtures; el trigger en sí corre SECURITY INVOKER y respeta RLS):
--
--   psql "<conn>" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/fertility_followup_attribution_test.sql
--
-- Cada caso vive en su propio BEGIN/ROLLBACK — no contamina la base.
-- Usamos RAISE EXCEPTION para fallar; si el archivo termina sin
-- error, todos pasaron.
-- ═══════════════════════════════════════════════════════════════════

-- Helper: crea un fixture mínimo y devuelve los IDs.
-- Se define sin ROLLBACK para reusar entre tests dentro del mismo BEGIN.
CREATE OR REPLACE FUNCTION _t_fertility_make_fixture(
  OUT v_org UUID, OUT v_patient UUID, OUT v_doctor UUID,
  OUT v_office UUID, OUT v_service UUID, OUT v_category UUID
)
LANGUAGE plpgsql AS $$
DECLARE
  v_suffix TEXT := substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12);
BEGIN
  v_org := gen_random_uuid();
  v_patient := gen_random_uuid();
  v_doctor := gen_random_uuid();
  v_office := gen_random_uuid();
  v_service := gen_random_uuid();
  v_category := gen_random_uuid();

  INSERT INTO organizations (id, name, slug)
    VALUES (v_org, 'TestOrg ' || v_suffix, 'test-org-' || v_suffix);
  INSERT INTO patients (id, organization_id, first_name, last_name)
    VALUES (v_patient, v_org, 'Test', 'Patient ' || v_suffix);
  INSERT INTO doctors (id, organization_id, full_name, cmp)
    VALUES (v_doctor, v_org, 'Test Doctor ' || v_suffix, 'CMP-' || v_suffix);
  INSERT INTO offices (id, organization_id, name)
    VALUES (v_office, v_org, 'Test Office ' || v_suffix);
  INSERT INTO service_categories (id, organization_id, name)
    VALUES (v_category, v_org, 'TestCat ' || v_suffix);
  INSERT INTO services (id, organization_id, name, category_id, duration_minutes)
    VALUES (v_service, v_org, '2da Consulta ' || v_suffix, v_category, 30);
END;
$$;

\echo '── Test 1: Categoría A clara (followup contactado + cita) ─────'
BEGIN;
DO $$
DECLARE
  f RECORD; v_followup_id UUID; v_appt_id UUID;
  v_attribution TEXT; v_linked UUID; v_status TEXT;
BEGIN
  SELECT * INTO f FROM _t_fertility_make_fixture();
  INSERT INTO organization_service_canonical_mapping (organization_id, category_key, service_id)
    VALUES (f.v_org, 'fertility.second_consultation', f.v_service);

  INSERT INTO clinical_followups (
    organization_id, patient_id, doctor_id, priority, reason,
    source, rule_key, target_category_canonical, status, first_contact_at
  ) VALUES (
    f.v_org, f.v_patient, f.v_doctor, 'green', 'Test 1',
    'rule', 'fertility.first_consultation_lapse',
    'fertility.second_consultation', 'contactado', NOW() - INTERVAL '2 days'
  ) RETURNING id INTO v_followup_id;

  INSERT INTO appointments (
    organization_id, patient_id, patient_name, doctor_id, office_id, service_id,
    appointment_date, start_time, end_time
  ) VALUES (
    f.v_org, f.v_patient, 'Test', f.v_doctor, f.v_office, f.v_service,
    CURRENT_DATE + 7, '10:00', '10:30'
  ) RETURNING id, attribution_source, linked_followup_id
    INTO v_appt_id, v_attribution, v_linked;

  IF v_attribution <> 'recovered_with_contact' THEN
    RAISE EXCEPTION 'Test 1 FAIL: attribution=% (expected recovered_with_contact)', v_attribution;
  END IF;
  IF v_linked IS DISTINCT FROM v_followup_id THEN
    RAISE EXCEPTION 'Test 1 FAIL: linked_followup_id mismatch';
  END IF;
  SELECT status INTO v_status FROM clinical_followups WHERE id = v_followup_id;
  IF v_status <> 'agendado_via_contacto' THEN
    RAISE EXCEPTION 'Test 1 FAIL: followup status=% (expected agendado_via_contacto)', v_status;
  END IF;
  RAISE NOTICE 'Test 1 OK';
END $$;
ROLLBACK;

\echo '── Test 2: Categoría B antes del contacto ─────────────────────'
BEGIN;
DO $$
DECLARE
  f RECORD; v_followup_id UUID; v_attribution TEXT; v_status TEXT;
BEGIN
  SELECT * INTO f FROM _t_fertility_make_fixture();
  INSERT INTO organization_service_canonical_mapping (organization_id, category_key, service_id)
    VALUES (f.v_org, 'fertility.second_consultation', f.v_service);

  INSERT INTO clinical_followups (
    organization_id, patient_id, doctor_id, priority, reason,
    source, rule_key, target_category_canonical, status, first_contact_at
  ) VALUES (
    f.v_org, f.v_patient, f.v_doctor, 'green', 'Test 2',
    'rule', 'fertility.first_consultation_lapse',
    'fertility.second_consultation', 'pendiente', NULL
  ) RETURNING id INTO v_followup_id;

  INSERT INTO appointments (
    organization_id, patient_id, patient_name, doctor_id, office_id, service_id,
    appointment_date, start_time, end_time
  ) VALUES (
    f.v_org, f.v_patient, 'Test', f.v_doctor, f.v_office, f.v_service,
    CURRENT_DATE + 7, '10:00', '10:30'
  ) RETURNING attribution_source INTO v_attribution;

  IF v_attribution <> 'agendado_sin_contacto' THEN
    RAISE EXCEPTION 'Test 2 FAIL: attribution=% (expected agendado_sin_contacto)', v_attribution;
  END IF;
  SELECT status INTO v_status FROM clinical_followups WHERE id = v_followup_id;
  IF v_status <> 'agendado_organico_dentro_ventana' THEN
    RAISE EXCEPTION 'Test 2 FAIL: followup status=%', v_status;
  END IF;
  RAISE NOTICE 'Test 2 OK';
END $$;
ROLLBACK;

\echo '── Test 3: Categoría B con contacto futuro ────────────────────'
BEGIN;
DO $$
DECLARE
  f RECORD; v_attribution TEXT;
BEGIN
  SELECT * INTO f FROM _t_fertility_make_fixture();
  INSERT INTO organization_service_canonical_mapping (organization_id, category_key, service_id)
    VALUES (f.v_org, 'fertility.second_consultation', f.v_service);

  INSERT INTO clinical_followups (
    organization_id, patient_id, doctor_id, priority, reason,
    source, rule_key, target_category_canonical, status,
    expected_by, first_contact_at
  ) VALUES (
    f.v_org, f.v_patient, f.v_doctor, 'green', 'Test 3',
    'rule', 'fertility.first_consultation_lapse',
    'fertility.second_consultation', 'pendiente',
    NOW() + INTERVAL '7 days', NULL
  );

  INSERT INTO appointments (
    organization_id, patient_id, patient_name, doctor_id, office_id, service_id,
    appointment_date, start_time, end_time
  ) VALUES (
    f.v_org, f.v_patient, 'Test', f.v_doctor, f.v_office, f.v_service,
    CURRENT_DATE + 1, '10:00', '10:30'
  ) RETURNING attribution_source INTO v_attribution;

  IF v_attribution <> 'agendado_sin_contacto' THEN
    RAISE EXCEPTION 'Test 3 FAIL: attribution=%', v_attribution;
  END IF;
  RAISE NOTICE 'Test 3 OK';
END $$;
ROLLBACK;

\echo '── Test 4: Categoría C sin seguimiento ─────────────────────────'
BEGIN;
DO $$
DECLARE
  f RECORD; v_attribution TEXT; v_linked UUID;
BEGIN
  SELECT * INTO f FROM _t_fertility_make_fixture();
  INSERT INTO organization_service_canonical_mapping (organization_id, category_key, service_id)
    VALUES (f.v_org, 'fertility.second_consultation', f.v_service);

  INSERT INTO appointments (
    organization_id, patient_id, patient_name, doctor_id, office_id, service_id,
    appointment_date, start_time, end_time
  ) VALUES (
    f.v_org, f.v_patient, 'Test', f.v_doctor, f.v_office, f.v_service,
    CURRENT_DATE + 1, '10:00', '10:30'
  ) RETURNING attribution_source, linked_followup_id INTO v_attribution, v_linked;

  IF v_attribution <> 'organica' THEN
    RAISE EXCEPTION 'Test 4 FAIL: attribution=%', v_attribution;
  END IF;
  IF v_linked IS NOT NULL THEN
    RAISE EXCEPTION 'Test 4 FAIL: linked_followup_id should be NULL';
  END IF;
  RAISE NOTICE 'Test 4 OK';
END $$;
ROLLBACK;

\echo '── Test 5: Servicio no mapeado ────────────────────────────────'
BEGIN;
DO $$
DECLARE
  f RECORD; v_followup_id UUID; v_attribution TEXT; v_linked UUID; v_status TEXT;
BEGIN
  SELECT * INTO f FROM _t_fertility_make_fixture();
  -- INTENCIONALMENTE no insertamos mapping.

  INSERT INTO clinical_followups (
    organization_id, patient_id, doctor_id, priority, reason,
    source, rule_key, target_category_canonical, status
  ) VALUES (
    f.v_org, f.v_patient, f.v_doctor, 'green', 'Test 5',
    'rule', 'fertility.first_consultation_lapse',
    'fertility.second_consultation', 'pendiente'
  ) RETURNING id INTO v_followup_id;

  INSERT INTO appointments (
    organization_id, patient_id, patient_name, doctor_id, office_id, service_id,
    appointment_date, start_time, end_time
  ) VALUES (
    f.v_org, f.v_patient, 'Test', f.v_doctor, f.v_office, f.v_service,
    CURRENT_DATE + 1, '10:00', '10:30'
  ) RETURNING attribution_source, linked_followup_id INTO v_attribution, v_linked;

  IF v_attribution <> 'organica' THEN
    RAISE EXCEPTION 'Test 5 FAIL: attribution=%', v_attribution;
  END IF;
  IF v_linked IS NOT NULL THEN
    RAISE EXCEPTION 'Test 5 FAIL: linked_followup_id should be NULL';
  END IF;
  SELECT status INTO v_status FROM clinical_followups WHERE id = v_followup_id;
  IF v_status <> 'pendiente' THEN
    RAISE EXCEPTION 'Test 5 FAIL: followup was modified (status=%)', v_status;
  END IF;
  RAISE NOTICE 'Test 5 OK';
END $$;
ROLLBACK;

\echo '── Test 6: Múltiples seguimientos (cierra el más antiguo) ─────'
BEGIN;
DO $$
DECLARE
  f RECORD; v_old UUID; v_new UUID; v_linked UUID; v_old_status TEXT; v_new_status TEXT;
BEGIN
  SELECT * INTO f FROM _t_fertility_make_fixture();
  INSERT INTO organization_service_canonical_mapping (organization_id, category_key, service_id)
    VALUES (f.v_org, 'fertility.second_consultation', f.v_service);

  INSERT INTO clinical_followups (
    organization_id, patient_id, doctor_id, priority, reason,
    source, rule_key, target_category_canonical, status, created_at
  ) VALUES (
    f.v_org, f.v_patient, f.v_doctor, 'green', 'Older',
    'rule', 'fertility.first_consultation_lapse',
    'fertility.second_consultation', 'pendiente', NOW() - INTERVAL '10 days'
  ) RETURNING id INTO v_old;

  INSERT INTO clinical_followups (
    organization_id, patient_id, doctor_id, priority, reason,
    source, rule_key, target_category_canonical, status, created_at
  ) VALUES (
    f.v_org, f.v_patient, f.v_doctor, 'green', 'Newer',
    'rule', 'fertility.first_consultation_lapse',
    'fertility.second_consultation', 'pendiente', NOW() - INTERVAL '1 day'
  ) RETURNING id INTO v_new;

  INSERT INTO appointments (
    organization_id, patient_id, patient_name, doctor_id, office_id, service_id,
    appointment_date, start_time, end_time
  ) VALUES (
    f.v_org, f.v_patient, 'Test', f.v_doctor, f.v_office, f.v_service,
    CURRENT_DATE + 1, '10:00', '10:30'
  ) RETURNING linked_followup_id INTO v_linked;

  IF v_linked IS DISTINCT FROM v_old THEN
    RAISE EXCEPTION 'Test 6 FAIL: should link to oldest followup (got %)', v_linked;
  END IF;
  SELECT status INTO v_old_status FROM clinical_followups WHERE id = v_old;
  SELECT status INTO v_new_status FROM clinical_followups WHERE id = v_new;
  IF v_old_status NOT IN ('agendado_via_contacto','agendado_organico_dentro_ventana') THEN
    RAISE EXCEPTION 'Test 6 FAIL: oldest should be closed, got %', v_old_status;
  END IF;
  IF v_new_status <> 'pendiente' THEN
    RAISE EXCEPTION 'Test 6 FAIL: newest should remain pendiente, got %', v_new_status;
  END IF;
  RAISE NOTICE 'Test 6 OK';
END $$;
ROLLBACK;

\echo '── Test 7: Cita reagendada (no recalcular previas) ─────────────'
BEGIN;
DO $$
DECLARE
  f RECORD; v_appt1 UUID; v_attr_before TEXT; v_attr_after TEXT;
BEGIN
  SELECT * INTO f FROM _t_fertility_make_fixture();
  INSERT INTO organization_service_canonical_mapping (organization_id, category_key, service_id)
    VALUES (f.v_org, 'fertility.second_consultation', f.v_service);

  INSERT INTO clinical_followups (
    organization_id, patient_id, doctor_id, priority, reason,
    source, rule_key, target_category_canonical, status, first_contact_at
  ) VALUES (
    f.v_org, f.v_patient, f.v_doctor, 'green', 'Test 7',
    'rule', 'fertility.first_consultation_lapse',
    'fertility.second_consultation', 'contactado', NOW() - INTERVAL '1 day'
  );

  INSERT INTO appointments (
    organization_id, patient_id, patient_name, doctor_id, office_id, service_id,
    appointment_date, start_time, end_time
  ) VALUES (
    f.v_org, f.v_patient, 'Test', f.v_doctor, f.v_office, f.v_service,
    CURRENT_DATE + 7, '10:00', '10:30'
  ) RETURNING id, attribution_source INTO v_appt1, v_attr_before;

  IF v_attr_before <> 'recovered_with_contact' THEN
    RAISE EXCEPTION 'Test 7 setup FAIL: first appt attribution=%', v_attr_before;
  END IF;

  -- Cancelar primera y crear segunda.
  UPDATE appointments SET status = 'cancelled' WHERE id = v_appt1;
  INSERT INTO appointments (
    organization_id, patient_id, patient_name, doctor_id, office_id, service_id,
    appointment_date, start_time, end_time
  ) VALUES (
    f.v_org, f.v_patient, 'Test', f.v_doctor, f.v_office, f.v_service,
    CURRENT_DATE + 14, '11:00', '11:30'
  );

  SELECT attribution_source INTO v_attr_after FROM appointments WHERE id = v_appt1;
  IF v_attr_after <> v_attr_before THEN
    RAISE EXCEPTION 'Test 7 FAIL: first appt attribution changed % → %', v_attr_before, v_attr_after;
  END IF;
  RAISE NOTICE 'Test 7 OK';
END $$;
ROLLBACK;

\echo '── Test 8: Multi-tenant (no cruzar) ───────────────────────────'
BEGIN;
DO $$
DECLARE
  fa RECORD;
  v_org_b UUID := gen_random_uuid();
  v_doctor_b UUID := gen_random_uuid();
  v_office_b UUID := gen_random_uuid();
  v_service_b UUID := gen_random_uuid();
  v_category_b UUID := gen_random_uuid();
  v_followup_a_id UUID;
  v_attribution TEXT; v_linked UUID; v_status TEXT;
  v_suffix TEXT := substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12);
BEGIN
  -- Org A con paciente y followup activo.
  SELECT * INTO fa FROM _t_fertility_make_fixture();
  INSERT INTO clinical_followups (
    organization_id, patient_id, doctor_id, priority, reason,
    source, rule_key, target_category_canonical, status, first_contact_at
  ) VALUES (
    fa.v_org, fa.v_patient, fa.v_doctor, 'green', 'Cross-tenant probe',
    'rule', 'fertility.first_consultation_lapse',
    'fertility.second_consultation', 'contactado', NOW() - INTERVAL '1 day'
  ) RETURNING id INTO v_followup_a_id;

  -- Org B con su propio servicio mapeado a la misma categoría, pero
  -- el paciente de A es ajeno a org B (FK organization_id en patients
  -- impide que un mismo paciente pertenezca a dos orgs; usamos un
  -- paciente NUEVO en org B para simular el escenario multi-tenant).
  INSERT INTO organizations (id, name, slug)
    VALUES (v_org_b, 'TestOrgB ' || v_suffix, 'test-org-b-' || v_suffix);
  INSERT INTO doctors (id, organization_id, full_name, cmp)
    VALUES (v_doctor_b, v_org_b, 'Doc B ' || v_suffix, 'CMP-B-' || v_suffix);
  INSERT INTO offices (id, organization_id, name)
    VALUES (v_office_b, v_org_b, 'Office B');
  INSERT INTO service_categories (id, organization_id, name)
    VALUES (v_category_b, v_org_b, 'Cat B ' || v_suffix);
  INSERT INTO services (id, organization_id, name, category_id, duration_minutes)
    VALUES (v_service_b, v_org_b, '2da B ' || v_suffix, v_category_b, 30);
  INSERT INTO organization_service_canonical_mapping (organization_id, category_key, service_id)
    VALUES (v_org_b, 'fertility.second_consultation', v_service_b);

  -- Insertar cita en org B usando el paciente de org A (reutilizando
  -- el mismo patient_id es un escenario "no debería pasar pero
  -- validamos"). El trigger filtra por organization_id, así que no
  -- debe atribuirse al followup de A.
  INSERT INTO appointments (
    organization_id, patient_id, patient_name, doctor_id, office_id, service_id,
    appointment_date, start_time, end_time
  ) VALUES (
    v_org_b, fa.v_patient, 'Cross', v_doctor_b, v_office_b, v_service_b,
    CURRENT_DATE + 1, '10:00', '10:30'
  ) RETURNING attribution_source, linked_followup_id INTO v_attribution, v_linked;

  IF v_attribution <> 'organica' THEN
    RAISE EXCEPTION 'Test 8 FAIL: cross-tenant attribution=%', v_attribution;
  END IF;
  IF v_linked IS NOT NULL THEN
    RAISE EXCEPTION 'Test 8 FAIL: linked_followup_id should be NULL';
  END IF;
  SELECT status INTO v_status FROM clinical_followups WHERE id = v_followup_a_id;
  IF v_status NOT IN ('pendiente','contactado') THEN
    RAISE EXCEPTION 'Test 8 FAIL: org A followup was modified by org B insert (status=%)', v_status;
  END IF;
  RAISE NOTICE 'Test 8 OK';
END $$;
ROLLBACK;

DROP FUNCTION IF EXISTS _t_fertility_make_fixture();

\echo '── All attribution trigger tests passed ──────────────────────'
