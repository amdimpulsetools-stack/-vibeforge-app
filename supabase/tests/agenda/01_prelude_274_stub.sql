-- Stub adicional para la mig 274 (pre-reserva). Se aplica después de
-- 00_prelude_stub.sql. Solo las columnas que la 274 usa; FKs a
-- appointments con el MISMO ON DELETE que las migraciones del repo
-- (043, 048, 050, 053, 078, 229) y el CHECK inline de la mig 139.

-- appointments.treatment_session_id (mig 099) y la política de DELETE
-- real (mig 013: solo owner/admin).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS treatment_session_id uuid;
CREATE POLICY org_delete_appointments ON appointments FOR DELETE
  USING (is_org_admin(organization_id));

-- ── Tablas con FK a appointments ───────────────────────────────────
CREATE TABLE clinical_notes (              -- mig 050: CASCADE
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  body text
);
CREATE TABLE reminder_logs (               -- mig 043: CASCADE (log técnico)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  template_slug text NOT NULL
);
CREATE TABLE exam_orders (                 -- mig 078: NO ACTION
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id)
);
CREATE TABLE prescriptions (               -- mig 053: SET NULL
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL
);
CREATE TABLE whatsapp_message_logs (       -- mig 048: SET NULL (se permite)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL
);
CREATE TABLE payment_links (               -- mig 229: SET NULL
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','paid','cancelled','expired')),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 day'
);
CREATE TABLE treatment_sessions (          -- mig 053: SET NULL
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_plan_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  session_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','missed','cancelled'))
);

-- ── Ajustes de agenda (mig 068) ────────────────────────────────────
CREATE TABLE scheduler_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  start_hour integer NOT NULL DEFAULT 8,
  end_hour integer NOT NULL DEFAULT 20,
  UNIQUE (organization_id)
);

-- ── Plantillas WhatsApp (mig 139, CHECK inline con nombre automático) ─
CREATE TABLE org_whatsapp_clipboard_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'post_appointment',
    'second_consultation_followup',
    'budget_followup'
  )),
  template text NOT NULL,
  UNIQUE (organization_id, kind)
);

-- ── RLS ────────────────────────────────────────────────────────────
ALTER TABLE clinical_notes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_links         ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduler_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_whatsapp_clipboard_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY clinical_notes_select ON clinical_notes FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY exam_orders_select ON exam_orders FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
-- A propósito: recepción NO ve recetas (prueba que el helper DEFINER
-- ve lo que la RLS oculta).
CREATE POLICY prescriptions_select ON prescriptions FOR SELECT
  USING (is_org_admin(organization_id));
CREATE POLICY payment_links_select ON payment_links FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY treatment_sessions_select ON treatment_sessions FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY treatment_sessions_update ON treatment_sessions FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY scheduler_settings_select ON scheduler_settings FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY owct_select ON org_whatsapp_clipboard_templates FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY owct_insert ON org_whatsapp_clipboard_templates FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
