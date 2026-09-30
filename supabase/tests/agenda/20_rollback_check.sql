-- Rollback 273: las tarjetas abiertas se cierran (rollback_273) y no
-- queda ningún trigger/función/índice de la 273. Las columnas se conservan.
\set ON_ERROR_STOP on
DO $$
DECLARE n int; a uuid;
BEGIN
  SELECT count(*) INTO n FROM clinical_followups
   WHERE rule_key = 'core.reschedule_pending' AND status IN ('pendiente','contactado','pospuesto');
  ASSERT n = 0, 'R1: quedan ' || n || ' tarjetas abiertas';
  SELECT count(*) INTO n FROM clinical_followups
   WHERE rule_key = 'core.reschedule_pending' AND closure_reason = 'rollback_273'
     AND status = 'cerrado_manual' AND is_resolved AND closed_at IS NOT NULL;
  ASSERT n > 0, 'R1: ninguna cerrada como rollback_273';
  SELECT count(*) INTO n FROM clinical_followups
   WHERE rule_key = 'core.reschedule_pending' AND closure_reason IN ('reprogramada','reactivada','reprogramada_tarde');
  ASSERT n > 0, 'R1: las ya cerradas conservan su motivo';

  SELECT count(*) INTO n FROM pg_trigger WHERE tgrelid = 'appointments'::regclass
     AND tgname LIKE 'trg_appointments_%' AND tgname <> 'trg_appointments_attribution';
  ASSERT n = 0, 'R2: quedan triggers';
  SELECT count(*) INTO n FROM pg_proc WHERE proname IN ('appointment_transfer_payments','appointment_has_cash_refund',
     'appointments_cancel_stamp','create_reschedule_pending_followup','close_reschedule_pending_followups','reschedule_org_today');
  ASSERT n = 0, 'R2: quedan funciones';
  SELECT count(*) INTO n FROM pg_class WHERE relname IN ('uq_clinical_followups_reschedule_open_source','idx_clinical_followups_reschedule_open');
  ASSERT n = 0, 'R2: quedan índices';

  -- La agenda sigue funcionando: cancelar y agendar sin la 273.
  INSERT INTO appointments(organization_id, patient_id, appointment_date)
    VALUES ((SELECT id FROM organizations LIMIT 1), (SELECT id FROM patients LIMIT 1), current_date + 3) RETURNING id INTO a;
  UPDATE appointments SET status = 'cancelled', cancel_outcome = 'reprogramar' WHERE id = a;
  UPDATE appointments SET status = 'scheduled' WHERE id = a;
  RAISE NOTICE 'PASS  R1/R2 rollback cierra las abiertas (rollback_273), quita triggers/funciones/índices y la agenda sigue funcionando';
END $$;
