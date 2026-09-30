-- Rollback 274: no queda trigger/función/política de la 274, el CHECK de
-- kinds vuelve a los 3 de la mig 139 (filas de kinds nuevos borradas) y
-- las columnas se conservan. La agenda y los cobros siguen funcionando.
\set ON_ERROR_STOP on
DO $$
DECLARE n int; h uuid; e text;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger WHERE tgrelid = 'patient_payments'::regclass
     AND tgname LIKE 'trg_patient_payments_confirm_prereserva%';
  ASSERT n = 0, 'R1: quedan triggers';
  SELECT count(*) INTO n FROM pg_proc WHERE proname IN ('appointment_release_hold',
     'appointment_hold_release_blocker', 'patient_payments_confirm_prereserva');
  ASSERT n = 0, 'R1: quedan funciones';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN ('trg_appointments_hold_guard',
     'trg_appointments_hold_confirmed_close')), 'R1: quedan triggers de appointments';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'appointments_hold_guard'), 'R1: queda la guardia';
  ASSERT pg_get_triggerdef((SELECT oid FROM pg_trigger WHERE tgname = 'trg_appointments_reschedule_close_insert'))
         NOT LIKE '%hold_expires_at%', 'R1: el trigger de la 273 vuelve a su forma original';
  SELECT count(*) INTO n FROM pg_policies WHERE policyname = 'org_delete_appointments_prereserva_release';
  ASSERT n = 0, 'R1: queda la política';
  ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_delete_appointments'), 'R1: la política de siempre sigue';

  SELECT count(*) INTO n FROM org_whatsapp_clipboard_templates
   WHERE kind IN ('reschedule_notice', 'reschedule_coordinate', 'prereserva');
  ASSERT n = 0, 'R2: quedan filas de kinds nuevos';
  SELECT count(*) INTO n FROM org_whatsapp_clipboard_templates
   WHERE kind IN ('post_appointment', 'second_consultation_followup', 'budget_followup');
  ASSERT n = 3, 'R2: las plantillas viejas se conservan';
  BEGIN
    INSERT INTO org_whatsapp_clipboard_templates(organization_id, kind, template)
      VALUES ((SELECT id FROM organizations WHERE name = 'Otra'), 'prereserva', 'x');
    RAISE EXCEPTION 'R2: el CHECK original no volvió';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Columnas conservadas; un pago ya no confirma (sin trigger); la agenda funciona.
  SELECT count(*) INTO n FROM appointments WHERE hold_expires_at IS NOT NULL;
  ASSERT n > 0, 'R3: hold_expires_at conservada';
  ASSERT EXISTS (SELECT 1 FROM scheduler_settings WHERE prereserva_color = '#AbCdEf'), 'R3: ajustes conservados';
  INSERT INTO appointments(organization_id, appointment_date, hold_expires_at)
    VALUES ((SELECT id FROM organizations WHERE name = 'Clínica Hold'), current_date + 1, now() + interval '1 hour')
    RETURNING id INTO h;
  INSERT INTO patient_payments(organization_id, appointment_id, amount)
    VALUES ((SELECT id FROM organizations WHERE name = 'Clínica Hold'), h, 10);
  ASSERT (SELECT hold_expires_at IS NOT NULL FROM appointments WHERE id = h), 'R3: sin trigger no confirma';
  UPDATE appointments SET status = 'cancelled' WHERE id = h;
  RAISE NOTICE 'PASS  R1-R3 rollback 274 quita trigger/funciones/política, restaura el CHECK de kinds y conserva columnas; cobrar y cancelar siguen funcionando';
END $$;
