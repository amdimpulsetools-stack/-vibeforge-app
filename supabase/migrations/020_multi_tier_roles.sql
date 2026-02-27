-- =============================================
-- MIGRATION 020: Multi-Tier Plans & Role System
--
-- 1. Expands org roles: owner, admin, receptionist, doctor
-- 2. Restructures plans for 3 realities:
--    - Independiente (solo doctor)
--    - Centro Médico (small team)
--    - Clínica (large team)
-- 3. Adds doctor<->user link for personal dashboards
-- 4. Adds organization_type for tenant classification
-- 5. Adds is_founder flag for platform superuser
-- 6. Adds plan addons for expandable limits
-- 7. Updates RPCs for new structure
-- =============================================

-- =============================================
-- SECTION 1: Expand organization member roles
-- =============================================

-- Drop the old CHECK constraint and add new one with receptionist & doctor
ALTER TABLE organization_members
  DROP CONSTRAINT IF EXISTS organization_members_role_check;

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner', 'admin', 'receptionist', 'doctor', 'member'));

-- Migrate existing 'member' records to 'doctor' (clinical staff default)
UPDATE organization_members SET role = 'doctor' WHERE role = 'member';

-- =============================================
-- SECTION 2: Link doctors table to user accounts
-- =============================================

ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_doctors_user_id ON doctors(user_id);

COMMENT ON COLUMN doctors.user_id IS
  'Links doctor record to user account for personal dashboard data';

-- =============================================
-- SECTION 3: Organization type classification
-- =============================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS organization_type TEXT
  DEFAULT 'independiente'
  CHECK (organization_type IN ('independiente', 'centro_medico', 'clinica'));

COMMENT ON COLUMN organizations.organization_type IS
  'Type of organization: independiente (solo), centro_medico (mid), clinica (large)';

-- =============================================
-- SECTION 4: Founder superuser flag
-- =============================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_founder BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN user_profiles.is_founder IS
  'Platform superuser with access to cross-org analytics and billing';

-- =============================================
-- SECTION 5: Expand plans table with new fields
-- =============================================

-- Per-role limits
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_admins INT;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_receptionists INT;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_doctor_members INT;

-- Addon pricing (for expandable limits)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS addon_price_per_office NUMERIC(10,2);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS addon_price_per_member NUMERIC(10,2);

-- Target audience
ALTER TABLE plans ADD COLUMN IF NOT EXISTS target_audience TEXT
  CHECK (target_audience IN ('independiente', 'centro_medico', 'clinica'));

-- AI assistant feature flag
ALTER TABLE plans ADD COLUMN IF NOT EXISTS feature_ai_assistant BOOLEAN NOT NULL DEFAULT false;

-- =============================================
-- SECTION 6: Plan addons table (purchased extras)
-- =============================================

CREATE TABLE IF NOT EXISTS plan_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  addon_type TEXT NOT NULL CHECK (addon_type IN ('extra_office', 'extra_member')),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_addons_org ON plan_addons(organization_id);

CREATE TRIGGER set_updated_at_plan_addons
  BEFORE UPDATE ON plan_addons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE plan_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_addons_select" ON plan_addons FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "plan_addons_insert" ON plan_addons FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "plan_addons_update" ON plan_addons FOR UPDATE
  USING (is_org_admin(organization_id));

-- =============================================
-- SECTION 7: Update the 3 plan tiers
-- =============================================

-- Plan 1: Independiente (ex starter)
UPDATE plans SET
  name = 'Independiente',
  description = 'Para doctores independientes o consultorios únicos',
  price_monthly = 0,
  price_yearly = NULL,
  max_members = 1,
  max_doctors = 1,
  max_offices = 1,
  max_patients = 150,
  max_appointments_per_month = 100,
  max_storage_mb = 100,
  max_admins = 0,
  max_receptionists = 0,
  max_doctor_members = 1,
  addon_price_per_office = NULL,
  addon_price_per_member = NULL,
  target_audience = 'independiente',
  feature_reports = true,
  feature_export = false,
  feature_custom_roles = false,
  feature_api_access = false,
  feature_priority_support = false,
  feature_ai_assistant = false
WHERE slug = 'starter';

-- Plan 2: Centro Médico (ex professional)
UPDATE plans SET
  name = 'Centro Médico',
  description = 'Para centros médicos con múltiples consultorios y equipo',
  price_monthly = 49,
  price_yearly = 490,
  max_members = 4,
  max_doctors = 2,
  max_offices = 2,
  max_patients = 1000,
  max_appointments_per_month = 500,
  max_storage_mb = 2048,
  max_admins = 1,
  max_receptionists = 1,
  max_doctor_members = 2,
  addon_price_per_office = 15,
  addon_price_per_member = 10,
  target_audience = 'centro_medico',
  feature_reports = true,
  feature_export = true,
  feature_custom_roles = false,
  feature_api_access = false,
  feature_priority_support = false,
  feature_ai_assistant = true
WHERE slug = 'professional';

-- Plan 3: Clínica (ex enterprise)
UPDATE plans SET
  name = 'Clínica',
  description = 'Solución completa para clínicas con alto volumen',
  price_monthly = 149,
  price_yearly = 1490,
  max_members = 14,
  max_doctors = 10,
  max_offices = 10,
  max_patients = NULL,
  max_appointments_per_month = NULL,
  max_storage_mb = 10240,
  max_admins = 1,
  max_receptionists = 3,
  max_doctor_members = 3,
  addon_price_per_office = 12,
  addon_price_per_member = 8,
  target_audience = 'clinica',
  feature_reports = true,
  feature_export = true,
  feature_custom_roles = true,
  feature_api_access = true,
  feature_priority_support = true,
  feature_ai_assistant = true
WHERE slug = 'enterprise';

-- =============================================
-- SECTION 8: Update RPCs
-- =============================================

-- Updated get_org_plan with new fields
CREATE OR REPLACE FUNCTION get_org_plan(org_id UUID)
RETURNS JSON AS $$
  SELECT json_build_object(
    'plan', json_build_object(
      'id', p.id,
      'slug', p.slug,
      'name', p.name,
      'description', p.description,
      'price_monthly', p.price_monthly,
      'max_members', p.max_members,
      'max_doctors', p.max_doctors,
      'max_offices', p.max_offices,
      'max_patients', p.max_patients,
      'max_appointments_per_month', p.max_appointments_per_month,
      'max_storage_mb', p.max_storage_mb,
      'max_admins', p.max_admins,
      'max_receptionists', p.max_receptionists,
      'max_doctor_members', p.max_doctor_members,
      'addon_price_per_office', p.addon_price_per_office,
      'addon_price_per_member', p.addon_price_per_member,
      'target_audience', p.target_audience,
      'feature_reports', p.feature_reports,
      'feature_export', p.feature_export,
      'feature_custom_roles', p.feature_custom_roles,
      'feature_api_access', p.feature_api_access,
      'feature_priority_support', p.feature_priority_support,
      'feature_ai_assistant', p.feature_ai_assistant
    ),
    'subscription', json_build_object(
      'id', os.id,
      'status', os.status,
      'started_at', os.started_at,
      'expires_at', os.expires_at,
      'trial_ends_at', os.trial_ends_at
    )
  )
  FROM organization_subscriptions os
  JOIN plans p ON p.id = os.plan_id
  WHERE os.organization_id = org_id
    AND os.status IN ('active', 'trialing')
  ORDER BY os.created_at DESC
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Updated get_org_usage to include role-specific counts and addons
CREATE OR REPLACE FUNCTION get_org_usage(org_id UUID)
RETURNS JSON AS $$
  SELECT json_build_object(
    'members', (SELECT count(*) FROM organization_members WHERE organization_id = org_id),
    'doctors', (SELECT count(*) FROM doctors WHERE organization_id = org_id),
    'offices', (SELECT count(*) FROM offices WHERE organization_id = org_id),
    'patients', (SELECT count(*) FROM patients WHERE organization_id = org_id),
    'appointments_this_month', (
      SELECT count(*) FROM appointments
      WHERE organization_id = org_id
        AND appointment_date >= date_trunc('month', now())
        AND appointment_date < date_trunc('month', now()) + interval '1 month'
    ),
    'admins', (SELECT count(*) FROM organization_members WHERE organization_id = org_id AND role = 'admin'),
    'receptionists', (SELECT count(*) FROM organization_members WHERE organization_id = org_id AND role = 'receptionist'),
    'doctor_members', (SELECT count(*) FROM organization_members WHERE organization_id = org_id AND role = 'doctor'),
    'extra_offices', (
      SELECT COALESCE(SUM(quantity), 0) FROM plan_addons
      WHERE organization_id = org_id AND addon_type = 'extra_office' AND is_active = true
    ),
    'extra_members', (
      SELECT COALESCE(SUM(quantity), 0) FROM plan_addons
      WHERE organization_id = org_id AND addon_type = 'extra_member' AND is_active = true
    )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Founder platform stats (only callable by founders via service role or direct)
CREATE OR REPLACE FUNCTION get_founder_stats()
RETURNS JSON AS $$
  SELECT json_build_object(
    'total_organizations', (SELECT count(*) FROM organizations WHERE is_active = true),
    'total_users', (SELECT count(*) FROM user_profiles),
    'total_patients', (SELECT count(*) FROM patients),
    'total_appointments_this_month', (
      SELECT count(*) FROM appointments
      WHERE appointment_date >= date_trunc('month', now())
        AND appointment_date < date_trunc('month', now()) + interval '1 month'
    ),
    'orgs_by_plan', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
        SELECT p.slug, p.name, count(os.id) as org_count
        FROM plans p
        LEFT JOIN organization_subscriptions os
          ON os.plan_id = p.id AND os.status IN ('active', 'trialing')
        WHERE p.is_active = true
        GROUP BY p.slug, p.name, p.display_order
        ORDER BY p.display_order
      ) t
    ),
    'revenue_this_month', (
      SELECT COALESCE(SUM(a.price_snapshot), 0)
      FROM appointments a
      WHERE a.status = 'completed'
        AND a.appointment_date >= date_trunc('month', now())
    ),
    'recent_orgs', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
        SELECT o.id, o.name, o.slug, o.organization_type, o.created_at,
               p.name as plan_name, p.slug as plan_slug, os.status as sub_status
        FROM organizations o
        LEFT JOIN organization_subscriptions os
          ON os.organization_id = o.id AND os.status IN ('active', 'trialing')
        LEFT JOIN plans p ON p.id = os.plan_id
        WHERE o.is_active = true
        ORDER BY o.created_at DESC
        LIMIT 10
      ) t
    ),
    'orgs_by_type', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
        SELECT organization_type, count(*) as org_count
        FROM organizations
        WHERE is_active = true
        GROUP BY organization_type
      ) t
    )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Get doctor's personal stats (for doctor dashboard)
CREATE OR REPLACE FUNCTION get_doctor_personal_stats(p_user_id UUID, org_id UUID)
RETURNS JSON AS $$
DECLARE
  doctor_record_id UUID;
  result JSON;
BEGIN
  -- Find the doctor record linked to this user
  SELECT id INTO doctor_record_id
  FROM doctors
  WHERE user_id = p_user_id AND organization_id = org_id
  LIMIT 1;

  IF doctor_record_id IS NULL THEN
    RETURN json_build_object('linked', false);
  END IF;

  SELECT json_build_object(
    'linked', true,
    'doctor_id', doctor_record_id,
    'today_appointments', (
      SELECT count(*) FROM appointments
      WHERE doctor_id = doctor_record_id
        AND appointment_date = CURRENT_DATE
        AND organization_id = org_id
    ),
    'month_appointments', (
      SELECT count(*) FROM appointments
      WHERE doctor_id = doctor_record_id
        AND appointment_date >= date_trunc('month', now())
        AND appointment_date < date_trunc('month', now()) + interval '1 month'
        AND organization_id = org_id
    ),
    'month_completed', (
      SELECT count(*) FROM appointments
      WHERE doctor_id = doctor_record_id
        AND status = 'completed'
        AND appointment_date >= date_trunc('month', now())
        AND organization_id = org_id
    ),
    'month_revenue', (
      SELECT COALESCE(SUM(COALESCE(a.price_snapshot, 0)), 0)
      FROM appointments a
      WHERE a.doctor_id = doctor_record_id
        AND a.status = 'completed'
        AND a.appointment_date >= date_trunc('month', now())
        AND a.organization_id = org_id
    ),
    'total_patients', (
      SELECT count(DISTINCT patient_id) FROM appointments
      WHERE doctor_id = doctor_record_id
        AND patient_id IS NOT NULL
        AND organization_id = org_id
    ),
    'upcoming_appointments', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
        SELECT a.id, a.patient_name, a.appointment_date, a.start_time,
               a.end_time, a.status, s.name as service_name, o.name as office_name
        FROM appointments a
        LEFT JOIN services s ON s.id = a.service_id
        LEFT JOIN offices o ON o.id = a.office_id
        WHERE a.doctor_id = doctor_record_id
          AND a.appointment_date >= CURRENT_DATE
          AND a.status IN ('scheduled', 'confirmed')
          AND a.organization_id = org_id
        ORDER BY a.appointment_date, a.start_time
        LIMIT 5
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================
-- SECTION 9: Update signup trigger for org type
-- =============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  cat_origin_id UUID;
  cat_payment_id UUID;
  cat_status_id UUID;
  cat_responsible_id UUID;
BEGIN
  -- 1. Create user profile
  INSERT INTO public.user_profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );

  -- 2. Create organization (default type: independiente)
  org_name := COALESCE(NEW.raw_user_meta_data->>'org_name', 'Mi Consultorio');
  new_org_id := gen_random_uuid();

  INSERT INTO public.organizations (id, name, slug, organization_type)
  VALUES (new_org_id, org_name, new_org_id::text, 'independiente');

  -- 3. Make user the owner
  INSERT INTO public.organization_members (user_id, organization_id, role)
  VALUES (NEW.id, new_org_id, 'owner');

  -- 4. Seed global variables
  INSERT INTO public.global_variables (name, key, value, description, sort_order, organization_id) VALUES
    ('Nombre del Consultorio', 'clinic_name',         org_name,           'Nombre visible en reportes y documentos',   1, new_org_id),
    ('Teléfono de contacto',   'clinic_phone',        '+51 999 000 000',  'Teléfono principal',                        2, new_org_id),
    ('Correo de contacto',     'clinic_email',        'info@clinica.com', 'Email para notificaciones',                 3, new_org_id),
    ('Máx. citas por slot',    'max_appts_per_slot',  '1',                'Cantidad máxima de citas en el mismo slot', 4, new_org_id),
    ('Moneda',                 'currency_symbol',     'S/.',              'Símbolo monetario usado en reportes',       5, new_org_id);

  -- 5. Seed lookup categories
  INSERT INTO public.lookup_categories (id, slug, name, description, is_system, organization_id) VALUES
    (gen_random_uuid(), 'origin',             'Origen del Paciente', 'De dónde conoció al consultorio', true, new_org_id),
    (gen_random_uuid(), 'payment_method',     'Método de Pago',     'Formas de pago aceptadas',        true, new_org_id),
    (gen_random_uuid(), 'appointment_status', 'Estado de Cita',     'Estados posibles de una cita',    true, new_org_id),
    (gen_random_uuid(), 'responsible',        'Responsable',        'Personas responsables',           true, new_org_id);

  SELECT id INTO cat_origin_id FROM public.lookup_categories
    WHERE slug = 'origin' AND organization_id = new_org_id;
  SELECT id INTO cat_payment_id FROM public.lookup_categories
    WHERE slug = 'payment_method' AND organization_id = new_org_id;
  SELECT id INTO cat_status_id FROM public.lookup_categories
    WHERE slug = 'appointment_status' AND organization_id = new_org_id;
  SELECT id INTO cat_responsible_id FROM public.lookup_categories
    WHERE slug = 'responsible' AND organization_id = new_org_id;

  INSERT INTO public.lookup_values (category_id, label, value, display_order, organization_id) VALUES
    (cat_origin_id, 'TikTok',      'tiktok',      1, new_org_id),
    (cat_origin_id, 'Instagram',   'instagram',   2, new_org_id),
    (cat_origin_id, 'Google',      'google',      3, new_org_id),
    (cat_origin_id, 'Recomendado', 'recommended', 4, new_org_id);

  INSERT INTO public.lookup_values (category_id, label, value, display_order, organization_id) VALUES
    (cat_payment_id, 'Efectivo', 'cash', 1, new_org_id),
    (cat_payment_id, 'Yape',    'yape', 2, new_org_id),
    (cat_payment_id, 'Visa',    'visa', 3, new_org_id);

  INSERT INTO public.lookup_values (category_id, label, value, color, display_order, organization_id) VALUES
    (cat_status_id, 'Programada', 'scheduled', '#9ca3af', 1, new_org_id),
    (cat_status_id, 'Confirmada', 'confirmed', '#3b82f6', 2, new_org_id),
    (cat_status_id, 'Completada', 'completed', '#22c55e', 3, new_org_id),
    (cat_status_id, 'Cancelada',  'cancelled', '#ef4444', 4, new_org_id);

  INSERT INTO public.lookup_values (category_id, label, value, display_order, organization_id) VALUES
    (cat_responsible_id, 'Admin', 'admin', 1, new_org_id);

  -- 6. Seed 1 default office (independiente starts with 1)
  INSERT INTO public.offices (name, description, display_order, organization_id) VALUES
    ('Consultorio 1', 'Consultorio principal', 1, new_org_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
