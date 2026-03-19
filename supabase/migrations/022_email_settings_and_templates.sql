-- =============================================
-- Migration 022: Email Settings & Templates
-- Creates tables for email configuration and
-- customizable notification templates per org.
-- =============================================

-- 1. Email settings per organization
CREATE TABLE IF NOT EXISTS email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sender_name TEXT,                          -- "Clínica San Marcos"
  sender_email TEXT,                         -- Connected to Resend
  reply_to_email TEXT,                       -- Reply-to address
  brand_color TEXT DEFAULT '#10b981',        -- Emerald green default
  email_logo_url TEXT,                       -- Logo for email headers
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

CREATE TRIGGER set_updated_at_email_settings
  BEFORE UPDATE ON email_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_settings_select" ON email_settings FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "email_settings_insert" ON email_settings FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "email_settings_update" ON email_settings FOR UPDATE
  USING (is_org_admin(organization_id));

-- 2. Email templates per organization
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,                        -- e.g. 'appointment_confirmation'
  category TEXT NOT NULL CHECK (category IN (
    'appointments', 'patients', 'payments', 'team', 'marketing'
  )),
  name TEXT NOT NULL,                        -- Display name
  description TEXT,                          -- Short description of what this template does
  subject TEXT NOT NULL DEFAULT '',           -- Email subject line
  body TEXT NOT NULL DEFAULT '',              -- Email body with {{variables}}
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp', 'both')),
  timing_value INT,                          -- e.g. 24
  timing_unit TEXT CHECK (timing_unit IN ('minutes', 'hours', 'days')),
  min_plan_slug TEXT DEFAULT 'starter',      -- Minimum plan required
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, slug)
);

CREATE INDEX idx_email_templates_org ON email_templates(organization_id);
CREATE INDEX idx_email_templates_category ON email_templates(category);

CREATE TRIGGER set_updated_at_email_templates
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_templates_select" ON email_templates FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "email_templates_insert" ON email_templates FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "email_templates_update" ON email_templates FOR UPDATE
  USING (is_org_admin(organization_id));

CREATE POLICY "email_templates_delete" ON email_templates FOR DELETE
  USING (is_org_admin(organization_id));

-- 3. Seed default templates for existing organizations
-- This function creates templates for an org (used in signup trigger too)
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

    -- Marketing (solo Clínica)
    (org_id, 'marketing_followup', 'marketing', 'Seguimiento', 'Se envía a pacientes que no han vuelto', 'Te extrañamos en {{clinica_nombre}}', 'Hola {{paciente_nombre}}, ha pasado un tiempo desde tu última visita. En {{clinica_nombre}} te esperamos. Agenda tu próxima cita.', false, 'email', NULL, NULL, 'enterprise', 1),
    (org_id, 'marketing_birthday', 'marketing', 'Cumpleaños', 'Se envía en el cumpleaños del paciente', '¡Feliz cumpleaños, {{paciente_nombre}}!', 'Hola {{paciente_nombre}}, {{clinica_nombre}} te desea un muy feliz cumpleaños. Como regalo especial, te ofrecemos un descuento en tu próxima consulta.', false, 'email', NULL, NULL, 'enterprise', 2),
    (org_id, 'marketing_campaign', 'marketing', 'Campaña', 'Plantilla base para campañas de marketing', 'Novedades de {{clinica_nombre}}', 'Hola {{paciente_nombre}}, en {{clinica_nombre}} tenemos novedades para ti. ¡Conócelas!', false, 'email', NULL, NULL, 'enterprise', 3)

  ON CONFLICT (organization_id, slug) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Seed templates for all existing organizations
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    PERFORM seed_email_templates(org.id);
  END LOOP;
END $$;

-- 5. Create default email_settings for existing organizations
INSERT INTO email_settings (organization_id, sender_name, brand_color)
SELECT id, name, '#10b981'
FROM organizations
ON CONFLICT (organization_id) DO NOTHING;
