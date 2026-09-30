-- ═══════════════════════════════════════════════════════════════════
-- Mig 274 — blindaje tras la revisión:
--   H1. Una cita NORMAL no puede volverse pre-reserva por UPDATE (si no,
--       cualquier miembro podría "liberar" = borrar citas normales).
--   H2. Extender y confirmar siguen funcionando.
--   H3. Atendida / no asistió / cancelada deja de ser pre-reserva.
--   H4. No se libera si la paciente ya llegó o está en consulta.
--   H5. "Por reprogramar" (273): una pre-reserva NO cierra la tarjeta;
--       liberarla la deja abierta; confirmarla la cierra.
-- Corre después de 30_ (reusa t_id, t_hold, t_err, t_is_hold).
-- ═══════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS consultation_started_at timestamptz;
INSERT INTO t_ids(k) VALUES ('hp4') ON CONFLICT DO NOTHING;
INSERT INTO patients(id, organization_id) VALUES (t_id('hp4'), t_id('h_org'));

SET ROLE authenticated;
SELECT set_config('test.uid', t_id('h_recep')::text, false);

DO $$
DECLARE a uuid; h uuid; e text;
BEGIN
  -- H1
  a := t_hold(NULL);
  e := t_err(format('UPDATE appointments SET hold_expires_at = now() + interval ''1 year'' WHERE id = %L', a));
  ASSERT e LIKE '%no puede volverse pre-reserva%', 'H1: UPDATE a pre-reserva → ' || coalesce(e, 'NO FALLÓ');
  ASSERT NOT t_is_hold(a), 'H1: sigue normal';
  e := t_err(format('SELECT appointment_release_hold(%L)', a));
  ASSERT e LIKE '%ya no es una pre-reserva%', 'H1: la RPC no borra una cita normal → ' || coalesce(e, 'NO FALLÓ');
  ASSERT EXISTS (SELECT 1 FROM appointments WHERE id = a), 'H1: la cita sigue';
  RAISE NOTICE 'PASS  H1 una cita normal no puede volverse pre-reserva por UPDATE ni ser liberada (borrada)';

  -- H2
  h := t_hold(60);
  UPDATE appointments SET hold_expires_at = now() + interval '3 hours' WHERE id = h;
  ASSERT (SELECT hold_expires_at > now() + interval '2 hours' FROM appointments WHERE id = h), 'H2: extender';
  UPDATE appointments SET hold_expires_at = NULL WHERE id = h;
  ASSERT NOT t_is_hold(h), 'H2: confirmar';
  e := t_err(format('UPDATE appointments SET hold_expires_at = now() + interval ''1 hour'' WHERE id = %L', h));
  ASSERT e LIKE '%no puede volverse pre-reserva%', 'H2: confirmada no vuelve a pre-reserva';
  RAISE NOTICE 'PASS  H2 extender y confirmar funcionan; una confirmada no vuelve a ser pre-reserva';

  -- H3
  h := t_hold();
  UPDATE appointments SET status = 'completed' WHERE id = h;
  ASSERT NOT t_is_hold(h), 'H3: atendida';
  h := t_hold();
  UPDATE appointments SET status = 'no_show' WHERE id = h;
  ASSERT NOT t_is_hold(h), 'H3: no asistió';
  h := t_hold();
  UPDATE appointments SET status = 'cancelled' WHERE id = h;
  ASSERT NOT t_is_hold(h), 'H3: cancelada';
  h := t_hold();
  UPDATE appointments SET status = 'confirmed' WHERE id = h;
  ASSERT t_is_hold(h), 'H3: scheduled → confirmed conserva la marca (la UI la confirma)';
  RAISE NOTICE 'PASS  H3 atendida / no asistió / cancelada deja de ser pre-reserva';

  -- H4
  h := t_hold();
  UPDATE appointments SET arrived_at = now() WHERE id = h;
  e := t_err(format('SELECT appointment_release_hold(%L)', h));
  ASSERT e LIKE '%ya llegó o está en consulta%', 'H4: llegó → ' || coalesce(e, 'NO FALLÓ');
  h := t_hold();
  UPDATE appointments SET consultation_started_at = now() WHERE id = h;
  e := t_err(format('SELECT appointment_release_hold(%L)', h));
  ASSERT e LIKE '%ya llegó o está en consulta%', 'H4: en consulta';
  ASSERT EXISTS (SELECT 1 FROM appointments WHERE id = h), 'H4: la cita sigue';
  RAISE NOTICE 'PASS  H4 no se libera si la paciente ya llegó o está en consulta';
END $$;

-- H5: tarjeta "Por reprogramar" frente a pre-reservas.
DO $$
DECLARE c uuid; h uuid; st text; why text;
BEGIN
  c := t_hold(NULL, 'scheduled', 'hp4');
  UPDATE appointments SET status = 'cancelled', cancel_outcome = 'reprogramar' WHERE id = c;
  SELECT status INTO st FROM clinical_followups
   WHERE rule_key = 'core.reschedule_pending' AND source_id = c;
  ASSERT st = 'pendiente', 'H5: tarjeta creada (' || coalesce(st, '∅') || ')';

  h := t_hold(120, 'scheduled', 'hp4');
  SELECT status INTO st FROM clinical_followups WHERE rule_key = 'core.reschedule_pending' AND source_id = c;
  ASSERT st = 'pendiente', 'H5: la pre-reserva NO cierra la tarjeta (' || st || ')';

  PERFORM appointment_release_hold(h);
  SELECT status INTO st FROM clinical_followups WHERE rule_key = 'core.reschedule_pending' AND source_id = c;
  ASSERT st = 'pendiente', 'H5: liberada, la tarjeta sigue abierta';

  h := t_hold(120, 'scheduled', 'hp4');
  INSERT INTO patient_payments(organization_id, patient_id, appointment_id, amount)
    VALUES (t_id('h_org'), t_id('hp4'), h, 40);
  ASSERT NOT t_is_hold(h), 'H5: el pago confirma';
  SELECT status, closure_reason INTO st, why FROM clinical_followups
   WHERE rule_key = 'core.reschedule_pending' AND source_id = c;
  ASSERT st = 'cerrado_manual' AND why = 'reprogramada',
         'H5: confirmada, la tarjeta se cierra (' || st || ' / ' || coalesce(why, '∅') || ')';
  RAISE NOTICE 'PASS  H5 una pre-reserva no cierra "Por reprogramar"; liberarla la deja abierta; confirmarla la cierra';
END $$;
RESET ROLE;
