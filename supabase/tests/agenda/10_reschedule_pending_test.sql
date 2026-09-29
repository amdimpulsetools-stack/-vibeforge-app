-- Mig 273: invariantes de "pendiente de reprogramar" (como superusuario).
DO $$
DECLARE
  o uuid := gen_random_uuid(); o2 uuid := gen_random_uuid();
  p uuid; p2 uuid; d uuid; s uuid; a1 uuid; a2 uuid; a3 uuid; a4 uuid; n int; r record;
BEGIN
  INSERT INTO patients(organization_id) VALUES (o) RETURNING id INTO p;
  INSERT INTO patients(organization_id) VALUES (o) RETURNING id INTO p2;
  INSERT INTO doctors DEFAULT VALUES RETURNING id INTO d;
  INSERT INTO services(name) VALUES ('Ecografía') RETURNING id INTO s;
  INSERT INTO appointments(organization_id,patient_id,doctor_id,service_id,appointment_date)
    VALUES (o,p,d,s,'2026-10-12') RETURNING id INTO a1;
  INSERT INTO appointments(organization_id,patient_id,doctor_id,service_id,appointment_date)
    VALUES (o,p,d,s,'2026-10-20') RETURNING id INTO a2;

  -- 1. Cancelar SIN marca → nada.
  UPDATE appointments SET status='cancelled' WHERE id=a2;
  SELECT count(*) INTO n FROM clinical_followups; ASSERT n=0, '1: cancelar sin marca no crea';

  -- 2. Cancelar CON marca (mismo UPDATE) → 1 seguimiento correcto.
  UPDATE appointments SET status='cancelled', reschedule_pending=true WHERE id=a1;
  SELECT * INTO r FROM clinical_followups;
  ASSERT r.rule_key='core.reschedule_pending' AND r.source='system' AND r.status='pendiente'
     AND r.source_type='appointment' AND r.source_id=a1 AND r.doctor_id=d AND r.priority='yellow'
     AND r.target_category_canonical IS NULL, '2: campos';
  ASSERT r.reason='Cita del 12/10 (Ecografía) cancelada — pendiente de reprogramar', '2: motivo '||r.reason;
  ASSERT r.expected_by > now() + interval '6 days', '2: vence en 7 días';

  -- 3. Marcar después (flujo con devolución: RPC cancela, luego se marca) → no duplica por paciente.
  UPDATE appointments SET reschedule_pending=true WHERE id=a2;
  SELECT count(*) INTO n FROM clinical_followups; ASSERT n=1, '3: una paciente, un pendiente';

  -- 4. Otro UPDATE de la cita cancelada (notas, etc.) no re-dispara.
  UPDATE appointments SET appointment_date='2026-10-13' WHERE id=a1;
  SELECT count(*) INTO n FROM clinical_followups; ASSERT n=1, '4: sin re-disparo';

  -- 5. Cita cancelada de OTRA paciente no se cierra al agendar a la primera.
  INSERT INTO appointments(organization_id,patient_id,appointment_date,status,reschedule_pending)
    VALUES (o,p2,'2026-10-14','scheduled',false) RETURNING id INTO a3;
  UPDATE appointments SET status='cancelled', reschedule_pending=true WHERE id=a3;
  SELECT count(*) INTO n FROM clinical_followups WHERE status='pendiente'; ASSERT n=2, '5: dos pacientes';

  -- 6. Cita nueva CANCELADA/no_show de p no cierra nada.
  INSERT INTO appointments(organization_id,patient_id,appointment_date,status)
    VALUES (o,p,'2026-10-30','cancelled');
  SELECT count(*) INTO n FROM clinical_followups WHERE patient_id=p AND status='pendiente'; ASSERT n=1, '6';

  -- 7. Cita viva nueva de p en OTRA org no cierra.
  INSERT INTO appointments(organization_id,patient_id,appointment_date) VALUES (o2,p,'2026-10-30');
  SELECT count(*) INTO n FROM clinical_followups WHERE patient_id=p AND status='pendiente'; ASSERT n=1, '7: aislamiento org';

  -- 8. Cita viva nueva de p en su org → se cierra solo (solo el de p).
  INSERT INTO appointments(organization_id,patient_id,appointment_date) VALUES (o,p,'2026-10-31') RETURNING id INTO a4;
  SELECT * INTO r FROM clinical_followups WHERE patient_id=p;
  ASSERT r.status='cerrado_manual' AND r.closure_reason='reprogramada' AND r.is_resolved AND r.closed_at IS NOT NULL, '8: cierre';
  SELECT count(*) INTO n FROM clinical_followups WHERE patient_id=p2 AND status='pendiente'; ASSERT n=1, '8: p2 sigue';

  -- 9. Se puede volver a quedar pendiente tras cerrarse (nueva cancelación marcada).
  UPDATE appointments SET status='cancelled', reschedule_pending=true WHERE id=a4;
  SELECT count(*) INTO n FROM clinical_followups WHERE patient_id=p AND status='pendiente'; ASSERT n=1, '9: nuevo ciclo';

  -- 10. Reactivar la misma cita cancelada → se cierra.
  UPDATE appointments SET status='scheduled' WHERE id=a3;
  SELECT count(*) INTO n FROM clinical_followups WHERE patient_id=p2 AND status='pendiente'; ASSERT n=0, '10: reactivada';

  -- 11. Seguimiento de otra regla del mismo paciente no se toca.
  INSERT INTO clinical_followups(organization_id,patient_id,reason,rule_key,status)
    VALUES (o,p2,'otro','core.service_followup','pendiente');
  INSERT INTO appointments(organization_id,patient_id,appointment_date) VALUES (o,p2,'2026-11-02');
  SELECT count(*) INTO n FROM clinical_followups WHERE rule_key='core.service_followup' AND status='pendiente'; ASSERT n=1, '11';

  -- 12. Sin paciente → nada, y la cita se cancela igual.
  INSERT INTO appointments(organization_id,appointment_date) VALUES (o,'2026-11-03') RETURNING id INTO a1;
  UPDATE appointments SET status='cancelled', reschedule_pending=true WHERE id=a1;
  SELECT status INTO r FROM appointments WHERE id=a1; ASSERT r.status='cancelled', '12';

  -- 13. Si el INSERT del seguimiento falla, la cancelación NO se bloquea.
  ALTER TABLE clinical_followups ADD CONSTRAINT boom CHECK (rule_key IS DISTINCT FROM 'core.reschedule_pending') NOT VALID;
  INSERT INTO patients(organization_id) VALUES (o) RETURNING id INTO p;
  INSERT INTO appointments(organization_id,patient_id,appointment_date) VALUES (o,p,'2026-11-04') RETURNING id INTO a1;
  UPDATE appointments SET status='cancelled', reschedule_pending=true WHERE id=a1;
  SELECT status INTO r FROM appointments WHERE id=a1; ASSERT r.status='cancelled', '13: nunca bloquea';
  ALTER TABLE clinical_followups DROP CONSTRAINT boom;

  RAISE NOTICE 'OK 273: 13 casos';
END $$;
