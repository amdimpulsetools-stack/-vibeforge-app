-- ============================================================================
-- Migration 083: Trial Welcome Email Template
-- ============================================================================
-- Seeds a new 'trial_welcome' email template for every organization.
-- This template is sent automatically when a user starts their 14-day trial.
--
-- Variables supported:
--   {{owner_nombre}}    — Full name of the owner/admin receiving the email
--   {{clinica_nombre}}  — Name of the clinic/organization
--   {{trial_ends_at}}   — Date when the trial expires (dd/mm/yyyy)
--   {{dashboard_url}}   — Link to the dashboard
--   {{guia_url}}        — Link to the getting started guide
--   {{plan_nombre}}     — Name of the plan being trialed
-- ============================================================================

-- 1. Insert the trial_welcome template for every existing organization
INSERT INTO email_templates (
  organization_id, slug, category, name, description,
  subject, body, is_enabled, channel, timing_value, timing_unit, min_plan_slug, sort_order
)
SELECT
  id AS organization_id,
  'trial_welcome' AS slug,
  'team' AS category,
  'Bienvenida al trial' AS name,
  'Se envía al iniciar el periodo de prueba de 14 días' AS description,
  '¡Bienvenido/a a {{clinica_nombre}}! Tu trial de 14 días está activo' AS subject,
  $body$Hola {{owner_nombre}},

¡Gracias por probar {{clinica_nombre}}! Tu periodo de prueba gratuita de 14 días ya está activo.

Plan en prueba: {{plan_nombre}}
Tu trial vence el: {{trial_ends_at}}

Primeros pasos recomendados:
1. Configura tu consultorio y horarios de atención.
2. Agrega a tu equipo (doctores, recepcionistas).
3. Crea tu primer paciente y agenda una cita de prueba.
4. Personaliza tus plantillas de email y WhatsApp.

Accede a tu dashboard: {{dashboard_url}}
Guía rápida de inicio: {{guia_url}}

Si tienes alguna pregunta, responde este correo y te ayudamos.

Un saludo,
El equipo de {{clinica_nombre}}$body$ AS body,
  true AS is_enabled,
  'email' AS channel,
  NULL::int AS timing_value,
  NULL AS timing_unit,
  'starter' AS min_plan_slug,
  4 AS sort_order
FROM organizations
ON CONFLICT (organization_id, slug) DO NOTHING;

-- 2. Update seed_email_templates() so new organizations also get this template
CREATE OR REPLACE FUNCTION seed_email_templates(org_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO email_templates (organization_id, slug, category, name, description, subject, body, is_enabled, channel, timing_value, timing_unit, min_plan_slug, sort_order)
  VALUES
    -- Citas
    (org_id, 'appointment_confirmation', 'appointments', 'Confirmación de cita', 'Se envía al crear una nueva cita', 'Tu cita ha sido confirmada', 'Hola {{paciente_nombre}}, tu cita con {{doctor_nombre}} ha sido confirmada para el {{fecha_cita}} a las {{hora_cita}} en {{consultorio}}. Servicio: {{servicio}}.', true, 'email', NULL, NULL, 'starter', 1),
    (org_id, 'appointment_reminder_24h', 'appointments', 'Recordatorio 24h', 'Se envía 24 horas antes de la cita', 'Recordatorio: tu cita es mañana', 'Hola {{paciente_nombre}}, te recordamos que tienes una cita con {{doctor_nombre}} el {{fecha_cita}} a las {{hora_cita}}. Si necesitas cancelar haz clic aquí: {{link_cancelar}}', true, 'email', 24, 'hours', 'starter', 2),
    (org_id, 'appointment_reminder_2h', 'appointments', 'Recordatorio 2h', 'Se envía 2 horas antes de la cita', 'Tu cita es en 2 horas', 'Hola {{paciente_nombre}}, tu cita con {{doctor_nombre}} es hoy a las {{hora_cita}} en {{consultorio}}. ¡Te esperamos!', false, 'email', 2, 'hours', 'professional', 3),
    (org_id, 'appointment_rescheduled', 'appointments', 'Reprogramación', 'Se envía cuando se reprograma una cita', 'Tu cita ha sido reprogramada', 'Hola {{paciente_nombre}}, tu cita ha sido reprogramada para el {{fecha_cita}} a las {{hora_cita}} con {{doctor_nombre}} en {{consultorio}}.', true, 'email', NULL, NULL, 'starter', 4),
    (org_id, 'appointment_cancelled', 'appointments', 'Cancelación', 'Se envía cuando se cancela una cita', 'Tu cita ha sido cancelada', 'Hola {{paciente_nombre}}, tu cita del {{fecha_cita}} a las {{hora_cita}} con {{doctor_nombre}} ha sido cancelada. Para reagendar: {{link_reagendar}}', true, 'email', NULL, NULL, 'starter', 5),

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
    (org_id, 'marketing_campaign', 'marketing', 'Campaña', 'Plantilla base para campañas de marketing', 'Novedades de {{clinica_nombre}}', 'Hola {{paciente_nombre}}, en {{clinica_nombre}} tenemos novedades para ti. ¡Conócelas!', false, 'email', NULL, NULL, 'enterprise', 3)

  ON CONFLICT (organization_id, slug) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
