-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 138: Plantillas de email del addon fertility migran de
-- `message_templates` (no editable) a `email_templates` (UI editable
-- en Settings → Correos).
--
-- Cambios:
--   1. Extiende el CHECK de email_templates.category para incluir
--      'fertility' (categoría nueva).
--   2. Re-define seed_email_templates(org_id) con las 3 plantillas
--      de fertility (deshabilitadas por default — se prenden al
--      activar el addon fertility_basic / fertility_premium).
--   3. Inserta las 3 plantillas en TODAS las organizaciones
--      existentes (idempotente vía ON CONFLICT). Las orgs que ya
--      tenían el addon activo antes de mig 138 (ej. Vitra) reciben
--      las plantillas retroactivamente con is_enabled=true; las
--      demás las reciben con is_enabled=false (las prende la
--      activación del addon en el endpoint).
--   4. Actualiza followup_rules.email_template_key (global y per-org)
--      para que apunte a los nuevos slugs.
--   5. Marca message_templates como DEPRECATED via COMMENT.
--
-- Idempotente: cada paso es seguro de re-ejecutar.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Extender CHECK de category ─────────────────────────────────
DO $$
BEGIN
  ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_category_check;
  ALTER TABLE email_templates
    ADD CONSTRAINT email_templates_category_check
    CHECK (category IN (
      'appointments', 'patients', 'payments', 'team', 'marketing', 'fertility'
    ));
END $$;

-- ── 2. Redefinir seed_email_templates con plantillas de fertility ─
CREATE OR REPLACE FUNCTION seed_email_templates(org_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO email_templates (organization_id, slug, category, name, description, subject, body, is_enabled, channel, timing_value, timing_unit, min_plan_slug, sort_order)
  VALUES
    -- Citas
    (org_id, 'appointment_confirmation', 'appointments', 'Confirmación de cita', 'Se envía al crear una nueva cita', 'Tu cita ha sido confirmada', 'Hola {{paciente_nombre}}, tu cita con {{doctor_nombre}} ha sido confirmada para el {{fecha_cita}} a las {{hora_cita}} en {{consultorio}}. Servicio: {{servicio}}.', true, 'email', NULL, NULL, 'starter', 1),
    (org_id, 'appointment_confirmation_virtual', 'appointments', 'Confirmación de teleconsulta', 'Se envía al crear una cita virtual', 'Tu teleconsulta ha sido confirmada', 'Hola {{paciente_nombre}}, tu teleconsulta con {{doctor_nombre}} ha sido confirmada para el {{fecha_cita}} a las {{hora_cita}}. Servicio: {{servicio}}. Ingresa a tu reunión aquí: {{link_reunion}}', true, 'email', NULL, NULL, 'starter', 2),
    (org_id, 'appointment_meeting_link_changed', 'appointments', 'Link de reunión actualizado', 'Se envía cuando se cambia el link de reunión de una cita virtual', 'Tu link de reunión ha cambiado', 'Hola {{paciente_nombre}}, el link de acceso a tu teleconsulta del {{fecha_cita}} a las {{hora_cita}} con {{doctor_nombre}} ha sido actualizado. Nuevo link: {{link_reunion}}', true, 'email', NULL, NULL, 'starter', 3),
    (org_id, 'appointment_reminder_24h', 'appointments', 'Recordatorio 24h', 'Se envía 24 horas antes de la cita', 'Recordatorio: tu cita es mañana', 'Hola {{paciente_nombre}}, te recordamos que tienes una cita con {{doctor_nombre}} el {{fecha_cita}} a las {{hora_cita}}. Si necesitas cancelar haz clic aquí: {{link_cancelar}}', true, 'email', 24, 'hours', 'starter', 4),
    (org_id, 'appointment_reminder_2h', 'appointments', 'Recordatorio 2h', 'Se envía 2 horas antes de la cita', 'Tu cita es en 2 horas', 'Hola {{paciente_nombre}}, tu cita con {{doctor_nombre}} es hoy a las {{hora_cita}} en {{consultorio}}. ¡Te esperamos!', false, 'email', 2, 'hours', 'professional', 5),
    (org_id, 'appointment_rescheduled', 'appointments', 'Reprogramación', 'Se envía cuando se reprograma una cita', 'Tu cita ha sido reprogramada', 'Hola {{paciente_nombre}}, tu cita ha sido reprogramada para el {{fecha_cita}} a las {{hora_cita}} con {{doctor_nombre}} en {{consultorio}}.', true, 'email', NULL, NULL, 'starter', 6),
    (org_id, 'appointment_cancelled', 'appointments', 'Cancelación', 'Se envía cuando se cancela una cita', 'Tu cita ha sido cancelada', 'Hola {{paciente_nombre}}, tu cita del {{fecha_cita}} a las {{hora_cita}} con {{doctor_nombre}} ha sido cancelada. Para reagendar: {{link_reagendar}}', true, 'email', NULL, NULL, 'starter', 7),

    -- Pacientes
    (org_id, 'patient_welcome', 'patients', 'Bienvenida', 'Se envía al registrar un nuevo paciente', 'Bienvenido/a a {{clinica_nombre}}', 'Hola {{paciente_nombre}}, bienvenido/a a {{clinica_nombre}}. Estamos encantados de atenderte. Para cualquier consulta puedes contactarnos al {{clinica_telefono}}.', false, 'email', NULL, NULL, 'starter', 1),
    (org_id, 'patient_post_consultation', 'patients', 'Resumen post-consulta', 'Se envía después de completar una cita', 'Resumen de tu consulta', 'Hola {{paciente_nombre}}, gracias por tu visita del {{fecha_cita}}. Tu consulta con {{doctor_nombre}} ha sido completada. Servicio: {{servicio}}.', false, 'email', NULL, NULL, 'professional', 2),
    (org_id, 'patient_review_request', 'patients', 'Solicitud de reseña', 'Se envía para pedir una reseña al paciente', '¿Cómo fue tu experiencia?', 'Hola {{paciente_nombre}}, nos encantaría conocer tu opinión sobre tu última visita a {{clinica_nombre}}. Tu feedback nos ayuda a mejorar.', false, 'email', NULL, NULL, 'professional', 3),

    -- Pagos
    (org_id, 'payment_receipt', 'payments', 'Recibo de pago', 'Se envía al registrar un pago', 'Recibo de pago - {{clinica_nombre}}', 'Hola {{paciente_nombre}}, hemos registrado tu pago de {{monto_pagado}} por el servicio de {{servicio}} el {{fecha_cita}}. ¡Gracias!', false, 'email', NULL, NULL, 'starter', 1),
    (org_id, 'payment_pending', 'payments', 'Pago pendiente', 'Se envía cuando hay un saldo pendiente', 'Tienes un pago pendiente', 'Hola {{paciente_nombre}}, te informamos que tienes un saldo pendiente en {{clinica_nombre}}. Por favor comunícate al {{clinica_telefono}} para más detalles.', false, 'email', NULL, NULL, 'professional', 2),
    (org_id, 'payment_invoice', 'payments', 'Factura', 'Se envía con la factura del servicio', 'Factura - {{clinica_nombre}}', 'Hola {{paciente_nombre}}, adjuntamos la factura correspondiente a tu servicio de {{servicio}} del {{fecha_cita}}. Monto: {{monto_pagado}}.', false, 'email', NULL, NULL, 'professional', 3),

    -- Equipo interno
    (org_id, 'team_new_appointment', 'team', 'Nueva cita (equipo)', 'Notifica al equipo sobre una nueva cita', 'Nueva cita registrada', 'Se ha registrado una nueva cita para {{paciente_nombre}} con {{doctor_nombre}} el {{fecha_cita}} a las {{hora_cita}} en {{consultorio}}.', false, 'email', NULL, NULL, 'professional', 1),
    (org_id, 'team_cancellation', 'team', 'Cancelación (equipo)', 'Notifica al equipo sobre una cancelación', 'Cita cancelada', 'La cita de {{paciente_nombre}} con {{doctor_nombre}} del {{fecha_cita}} a las {{hora_cita}} ha sido cancelada.', false, 'email', NULL, NULL, 'professional', 2),
    (org_id, 'team_daily_summary', 'team', 'Resumen diario', 'Se envía cada mañana con el resumen del día', 'Resumen de citas para hoy', 'Buenos días. Hoy {{fecha_cita}} hay citas programadas en {{clinica_nombre}}. Revisa la agenda para los detalles.', false, 'email', NULL, NULL, 'professional', 3),
    (org_id, 'trial_welcome', 'team', 'Bienvenida al trial', 'Se envía al iniciar el periodo de prueba de 14 días', '¡Bienvenido/a a {{clinica_nombre}}! Tu trial de 14 días está activo', E'Hola {{owner_nombre}},\n\n¡Gracias por probar {{clinica_nombre}}! Tu periodo de prueba gratuita de 14 días ya está activo.\n\nPlan en prueba: {{plan_nombre}}\nTu trial vence el: {{trial_ends_at}}\n\nPrimeros pasos recomendados:\n1. Configura tu consultorio y horarios de atención.\n2. Agrega a tu equipo (doctores, recepcionistas).\n3. Crea tu primer paciente y agenda una cita de prueba.\n4. Personaliza tus plantillas de email y WhatsApp.\n\nAccede a tu dashboard: {{dashboard_url}}\nGuía rápida de inicio: {{guia_url}}\n\nSi tienes alguna pregunta, responde este correo y te ayudamos.\n\nUn saludo,\nEl equipo de {{clinica_nombre}}', true, 'email', NULL, NULL, 'starter', 4),

    -- Marketing (solo Clínica)
    (org_id, 'marketing_followup', 'marketing', 'Seguimiento', 'Se envía a pacientes que no han vuelto', 'Te extrañamos en {{clinica_nombre}}', 'Hola {{paciente_nombre}}, ha pasado un tiempo desde tu última visita. En {{clinica_nombre}} te esperamos. Agenda tu próxima cita.', false, 'email', NULL, NULL, 'enterprise', 1),
    (org_id, 'marketing_birthday', 'marketing', 'Cumpleaños', 'Se envía en el cumpleaños del paciente', '¡Feliz cumpleaños, {{paciente_nombre}}!', 'Hola {{paciente_nombre}}, {{clinica_nombre}} te desea un muy feliz cumpleaños. Como regalo especial, te ofrecemos un descuento en tu próxima consulta.', false, 'email', NULL, NULL, 'enterprise', 2),
    (org_id, 'marketing_campaign', 'marketing', 'Campaña', 'Plantilla base para campañas de marketing', 'Novedades de {{clinica_nombre}}', 'Hola {{paciente_nombre}}, en {{clinica_nombre}} tenemos novedades para ti. ¡Conócelas!', false, 'email', NULL, NULL, 'enterprise', 3),

    -- Fertilidad (addon fertility_basic / fertility_premium)
    -- Quedan deshabilitadas por default — el endpoint de activación
    -- /api/addons/[key]/activate las prende cuando el admin activa
    -- el addon. Per-org editables igual que el resto de plantillas.
    (org_id, 'fertility_first_consultation_lapse', 'fertility', 'Recordatorio de segunda consulta de fertilidad', 'Se envía 21 días después de la primera consulta si la paciente no agendó la segunda', '¿Continuamos con tu evaluación, {{paciente_nombre}}?', E'Hola {{paciente_nombre}},\n\nHace algunos días tuviste tu primera consulta con {{doctor_nombre}}, y queríamos saber cómo te has sentido y si tienes alguna duda sobre los siguientes pasos.\n\n¿Te gustaría agendar tu segunda consulta para revisar resultados y conversar sobre opciones de tratamiento? Estamos para acompañarte en este proceso.\n\nPuedes responder a este correo o llamarnos al {{clinica_telefono}}.\n\nQuedamos atentos,\nEquipo de {{clinica_nombre}}', false, 'email', 21, 'days', 'professional', 1),
    (org_id, 'fertility_second_consultation_lapse', 'fertility', 'Recordatorio de decisión de tratamiento', 'Se envía 14 días después de la segunda consulta si la paciente no decidió tratamiento', 'Sigamos avanzando con tu plan, {{paciente_nombre}}', E'Hola {{paciente_nombre}},\n\nTe escribimos para retomar contacto sobre tu evaluación de fertilidad. Queremos asegurarnos de no perder el avance que ya tienes con {{doctor_nombre}}.\n\nSi tienes preguntas sobre los próximos pasos o necesitas coordinar tu siguiente cita, escríbenos respondiendo este correo o llámanos al {{clinica_telefono}}.\n\nEstamos para ayudarte a continuar tu camino.\n\nEquipo de {{clinica_nombre}}', false, 'email', 14, 'days', 'professional', 2),
    (org_id, 'fertility_budget_pending_acceptance', 'fertility', 'Recordatorio de aceptación de presupuesto', 'Se envía 7 días después de enviar el presupuesto si la paciente no lo aceptó', 'Tu plan de tratamiento personalizado, {{paciente_nombre}}', E'Hola {{paciente_nombre}},\n\nHace unos días te enviamos el presupuesto de tu plan de tratamiento. ¿Has tenido oportunidad de revisarlo? Si tienes preguntas sobre alguna parte, con gusto las conversamos contigo.\n\nSabemos que es una decisión importante y estamos para resolver cualquier duda que tengas. Puedes contactarnos respondiendo este correo o al {{clinica_telefono}}.\n\nQuedamos atentos,\nEquipo de {{clinica_nombre}}', false, 'email', 7, 'days', 'professional', 3)

  ON CONFLICT (organization_id, slug) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. Sembrar las 3 plantillas de fertility en orgs existentes ───
-- Insertamos en TODAS las orgs (deshabilitadas) para que la UI las
-- muestre solo si la org las tiene. La activación del addon las
-- prenderá. Las orgs sin addon las verán como deshabilitadas pero
-- no se enviarán (el cron filtra por addon activo).
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    INSERT INTO email_templates (
      organization_id, slug, category, name, description,
      subject, body, is_enabled, channel, timing_value, timing_unit,
      min_plan_slug, sort_order
    ) VALUES
      (
        org.id, 'fertility_first_consultation_lapse', 'fertility',
        'Recordatorio de segunda consulta de fertilidad',
        'Se envía 21 días después de la primera consulta si la paciente no agendó la segunda',
        '¿Continuamos con tu evaluación, {{paciente_nombre}}?',
        E'Hola {{paciente_nombre}},\n\nHace algunos días tuviste tu primera consulta con {{doctor_nombre}}, y queríamos saber cómo te has sentido y si tienes alguna duda sobre los siguientes pasos.\n\n¿Te gustaría agendar tu segunda consulta para revisar resultados y conversar sobre opciones de tratamiento? Estamos para acompañarte en este proceso.\n\nPuedes responder a este correo o llamarnos al {{clinica_telefono}}.\n\nQuedamos atentos,\nEquipo de {{clinica_nombre}}',
        false, 'email', 21, 'days', 'professional', 1
      ),
      (
        org.id, 'fertility_second_consultation_lapse', 'fertility',
        'Recordatorio de decisión de tratamiento',
        'Se envía 14 días después de la segunda consulta si la paciente no decidió tratamiento',
        'Sigamos avanzando con tu plan, {{paciente_nombre}}',
        E'Hola {{paciente_nombre}},\n\nTe escribimos para retomar contacto sobre tu evaluación de fertilidad. Queremos asegurarnos de no perder el avance que ya tienes con {{doctor_nombre}}.\n\nSi tienes preguntas sobre los próximos pasos o necesitas coordinar tu siguiente cita, escríbenos respondiendo este correo o llámanos al {{clinica_telefono}}.\n\nEstamos para ayudarte a continuar tu camino.\n\nEquipo de {{clinica_nombre}}',
        false, 'email', 14, 'days', 'professional', 2
      ),
      (
        org.id, 'fertility_budget_pending_acceptance', 'fertility',
        'Recordatorio de aceptación de presupuesto',
        'Se envía 7 días después de enviar el presupuesto si la paciente no lo aceptó',
        'Tu plan de tratamiento personalizado, {{paciente_nombre}}',
        E'Hola {{paciente_nombre}},\n\nHace unos días te enviamos el presupuesto de tu plan de tratamiento. ¿Has tenido oportunidad de revisarlo? Si tienes preguntas sobre alguna parte, con gusto las conversamos contigo.\n\nSabemos que es una decisión importante y estamos para resolver cualquier duda que tengas. Puedes contactarnos respondiendo este correo o al {{clinica_telefono}}.\n\nQuedamos atentos,\nEquipo de {{clinica_nombre}}',
        false, 'email', 7, 'days', 'professional', 3
      )
    ON CONFLICT (organization_id, slug) DO NOTHING;
  END LOOP;
END $$;

-- ── 4. Habilitar plantillas en orgs que ya tenían el addon activo ─
-- Para orgs como Vitra que ya activaron fertility antes de mig 138,
-- las plantillas se prenden automáticamente para que el cron las
-- pueda usar de inmediato sin requerir re-activación manual.
UPDATE email_templates et
SET is_enabled = true
WHERE et.slug IN (
        'fertility_first_consultation_lapse',
        'fertility_second_consultation_lapse',
        'fertility_budget_pending_acceptance'
      )
  AND EXISTS (
        SELECT 1 FROM organization_addons oa
         WHERE oa.organization_id = et.organization_id
           AND oa.addon_key IN ('fertility_basic', 'fertility_premium')
           AND oa.enabled = true
      );

-- ── 5. Re-vincular email_template_key en followup_rules ───────────
-- Reglas globales (organization_id IS NULL) y per-org clonadas.
-- Los slugs viejos eran 'fertility.first_consultation_lapse' (con
-- punto) y apuntaban a message_templates.template_key. Ahora
-- apuntan a email_templates.slug (con underscore: 'fertility_…').
UPDATE followup_rules
   SET email_template_key = 'fertility_first_consultation_lapse'
 WHERE rule_key = 'fertility.first_consultation_lapse'
   AND email_template_key IS DISTINCT FROM 'fertility_first_consultation_lapse';

UPDATE followup_rules
   SET email_template_key = 'fertility_second_consultation_lapse'
 WHERE rule_key = 'fertility.second_consultation_lapse'
   AND email_template_key IS DISTINCT FROM 'fertility_second_consultation_lapse';

UPDATE followup_rules
   SET email_template_key = 'fertility_budget_pending_acceptance'
 WHERE rule_key = 'fertility.budget_pending_acceptance'
   AND email_template_key IS DISTINCT FROM 'fertility_budget_pending_acceptance';

-- ── 6. Marcar message_templates como deprecated ───────────────────
COMMENT ON TABLE message_templates IS
  'DEPRECATED: las plantillas de email del addon fertility ahora viven en
  email_templates con UI editable en Settings → Correos. Esta tabla se
  mantiene por compatibilidad con el seed inicial pero no se usa en el cron
  desde mig 138. Eliminar en v0.16+.';
