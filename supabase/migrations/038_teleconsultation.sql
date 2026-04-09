-- =============================================
-- Migration 038: Teleconsulta / Virtual Appointments
-- Adds modality to services, meeting URL to doctors
-- and appointments for virtual consultations.
-- =============================================

-- 1. Add modality enum to services
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_modality') THEN
    CREATE TYPE service_modality AS ENUM ('in_person', 'virtual', 'both');
  END IF;
END $$;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS modality service_modality NOT NULL DEFAULT 'in_person';

-- 2. Add default meeting URL to doctors (their fixed Zoom/Meet link)
ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS default_meeting_url TEXT;

-- 3. Add meeting URL to appointments (per-appointment, editable)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS meeting_url TEXT;

-- 4. Add new email templates for virtual appointments to the seed function
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

    -- Marketing (solo Clínica)
    (org_id, 'marketing_followup', 'marketing', 'Seguimiento', 'Se envía a pacientes que no han vuelto', 'Te extrañamos en {{clinica_nombre}}', 'Hola {{paciente_nombre}}, ha pasado un tiempo desde tu última visita. En {{clinica_nombre}} te esperamos. Agenda tu próxima cita.', false, 'email', NULL, NULL, 'enterprise', 1),
    (org_id, 'marketing_birthday', 'marketing', 'Cumpleaños', 'Se envía en el cumpleaños del paciente', '¡Feliz cumpleaños, {{paciente_nombre}}!', 'Hola {{paciente_nombre}}, {{clinica_nombre}} te desea un muy feliz cumpleaños. Como regalo especial, te ofrecemos un descuento en tu próxima consulta.', false, 'email', NULL, NULL, 'enterprise', 2),
    (org_id, 'marketing_campaign', 'marketing', 'Campaña', 'Plantilla base para campañas de marketing', 'Novedades de {{clinica_nombre}}', 'Hola {{paciente_nombre}}, en {{clinica_nombre}} tenemos novedades para ti. ¡Conócelas!', false, 'email', NULL, NULL, 'enterprise', 3)

  ON CONFLICT (organization_id, slug) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Seed new templates for existing organizations that don't have them
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    -- Insert only the new virtual appointment templates (won't touch existing ones due to ON CONFLICT)
    INSERT INTO email_templates (organization_id, slug, category, name, description, subject, body, is_enabled, channel, timing_value, timing_unit, min_plan_slug, sort_order)
    VALUES
      (org.id, 'appointment_confirmation_virtual', 'appointments', 'Confirmación de teleconsulta', 'Se envía al crear una cita virtual', 'Tu teleconsulta ha sido confirmada', 'Hola {{paciente_nombre}}, tu teleconsulta con {{doctor_nombre}} ha sido confirmada para el {{fecha_cita}} a las {{hora_cita}}. Servicio: {{servicio}}. Ingresa a tu reunión aquí: {{link_reunion}}', true, 'email', NULL, NULL, 'starter', 2),
      (org.id, 'appointment_meeting_link_changed', 'appointments', 'Link de reunión actualizado', 'Se envía cuando se cambia el link de reunión de una cita virtual', 'Tu link de reunión ha cambiado', 'Hola {{paciente_nombre}}, el link de acceso a tu teleconsulta del {{fecha_cita}} a las {{hora_cita}} con {{doctor_nombre}} ha sido actualizado. Nuevo link: {{link_reunion}}', true, 'email', NULL, NULL, 'starter', 3)
    ON CONFLICT (organization_id, slug) DO NOTHING;
  END LOOP;
END $$;
