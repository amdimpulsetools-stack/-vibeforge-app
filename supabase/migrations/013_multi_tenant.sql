-- =============================================
-- MIGRATION 013: Multi-Tenant Architecture
-- Adds organizations, organization_members, and
-- organization_id to ALL business tables.
-- Rewrites ALL RLS policies for tenant isolation.
-- =============================================

-- =============================================
-- SECTION 1: Create new tables
-- =============================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_org ON organization_members(organization_id);

CREATE TRIGGER set_updated_at_organization_members
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- SECTION 2: Helper functions (SECURITY DEFINER = bypass RLS)
-- =============================================

-- Returns all org IDs the current user belongs to
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Checks if current user is admin/owner in a specific org
CREATE OR REPLACE FUNCTION is_org_admin(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
    AND organization_id = org_id
    AND role IN ('owner', 'admin')
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================
-- SECTION 3: RLS on new tables
-- =============================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select_organizations"
  ON organizations FOR SELECT
  USING (id IN (SELECT get_user_org_ids()));

CREATE POLICY "org_insert_organizations"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "org_update_organizations"
  ON organizations FOR UPDATE
  USING (is_org_admin(id));

CREATE POLICY "org_delete_organizations"
  ON organizations FOR DELETE
  USING (is_org_admin(id));

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select_members"
  ON organization_members FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "org_insert_members"
  ON organization_members FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "org_update_members"
  ON organization_members FOR UPDATE
  USING (is_org_admin(organization_id));

CREATE POLICY "org_delete_members"
  ON organization_members FOR DELETE
  USING (is_org_admin(organization_id));

-- =============================================
-- SECTION 4: Seed default org + migrate existing users
-- =============================================

INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Clínica Default', 'default')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO organization_members (user_id, organization_id, role)
SELECT id, '00000000-0000-0000-0000-000000000001', 'owner'
FROM auth.users
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- =============================================
-- SECTION 5: Add organization_id to ALL business tables
-- Pattern: add column → backfill → set NOT NULL → index
-- =============================================

-- offices
ALTER TABLE offices ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE offices SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE offices ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_offices_org ON offices(organization_id);

-- doctors
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE doctors SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE doctors ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_doctors_org ON doctors(organization_id);

-- doctor_services
ALTER TABLE doctor_services ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE doctor_services SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE doctor_services ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_doctor_services_org ON doctor_services(organization_id);

-- doctor_schedules
ALTER TABLE doctor_schedules ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE doctor_schedules SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE doctor_schedules ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_doctor_schedules_org ON doctor_schedules(organization_id);

-- service_categories
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE service_categories SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE service_categories ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_service_categories_org ON service_categories(organization_id);

-- services
ALTER TABLE services ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE services SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE services ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_services_org ON services(organization_id);

-- appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE appointments SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE appointments ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_appointments_org ON appointments(organization_id);

-- patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE patients SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE patients ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_patients_org ON patients(organization_id);

-- patient_tags
ALTER TABLE patient_tags ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE patient_tags SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE patient_tags ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_patient_tags_org ON patient_tags(organization_id);

-- patient_payments
ALTER TABLE patient_payments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE patient_payments SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE patient_payments ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_patient_payments_org ON patient_payments(organization_id);

-- schedule_blocks
ALTER TABLE schedule_blocks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE schedule_blocks SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE schedule_blocks ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_schedule_blocks_org ON schedule_blocks(organization_id);

-- lookup_categories
ALTER TABLE lookup_categories ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE lookup_categories SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE lookup_categories ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_lookup_categories_org ON lookup_categories(organization_id);

-- lookup_values
ALTER TABLE lookup_values ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE lookup_values SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE lookup_values ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_lookup_values_org ON lookup_values(organization_id);

-- global_variables
ALTER TABLE global_variables ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE global_variables SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
ALTER TABLE global_variables ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_global_variables_org ON global_variables(organization_id);

-- =============================================
-- SECTION 6: Update UNIQUE constraints to be per-org
-- =============================================

-- doctors.cmp: unique per org
ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_cmp_key;
ALTER TABLE doctors ADD CONSTRAINT doctors_org_cmp_unique UNIQUE(organization_id, cmp);

-- service_categories.name: unique per org
ALTER TABLE service_categories DROP CONSTRAINT IF EXISTS service_categories_name_key;
ALTER TABLE service_categories ADD CONSTRAINT service_categories_org_name_unique UNIQUE(organization_id, name);

-- patients.dni: unique per org
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_dni_key;
ALTER TABLE patients ADD CONSTRAINT patients_org_dni_unique UNIQUE(organization_id, dni);

-- lookup_categories.slug: unique per org
ALTER TABLE lookup_categories DROP CONSTRAINT IF EXISTS lookup_categories_slug_key;
ALTER TABLE lookup_categories ADD CONSTRAINT lookup_categories_org_slug_unique UNIQUE(organization_id, slug);

-- lookup_values(category_id, value): unique per org
ALTER TABLE lookup_values DROP CONSTRAINT IF EXISTS lookup_values_category_id_value_key;
ALTER TABLE lookup_values ADD CONSTRAINT lookup_values_org_cat_value_unique UNIQUE(organization_id, category_id, value);

-- global_variables.key: unique per org
ALTER TABLE global_variables DROP CONSTRAINT IF EXISTS global_variables_key_key;
ALTER TABLE global_variables ADD CONSTRAINT global_variables_org_key_unique UNIQUE(organization_id, key);

-- =============================================
-- SECTION 7: Drop ALL old RLS policies
-- =============================================

-- user_profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;

-- offices
DROP POLICY IF EXISTS "Authenticated users can view offices" ON offices;
DROP POLICY IF EXISTS "Admins can insert offices" ON offices;
DROP POLICY IF EXISTS "Admins can update offices" ON offices;
DROP POLICY IF EXISTS "Admins can delete offices" ON offices;

-- doctors
DROP POLICY IF EXISTS "Authenticated users can view doctors" ON doctors;
DROP POLICY IF EXISTS "Admins can insert doctors" ON doctors;
DROP POLICY IF EXISTS "Admins can update doctors" ON doctors;
DROP POLICY IF EXISTS "Admins can delete doctors" ON doctors;

-- doctor_services
DROP POLICY IF EXISTS "Authenticated users can view doctor_services" ON doctor_services;
DROP POLICY IF EXISTS "Admins can insert doctor_services" ON doctor_services;
DROP POLICY IF EXISTS "Admins can delete doctor_services" ON doctor_services;

-- doctor_schedules
DROP POLICY IF EXISTS "Authenticated users can view doctor_schedules" ON doctor_schedules;
DROP POLICY IF EXISTS "Admins can insert doctor_schedules" ON doctor_schedules;
DROP POLICY IF EXISTS "Admins can update doctor_schedules" ON doctor_schedules;
DROP POLICY IF EXISTS "Admins can delete doctor_schedules" ON doctor_schedules;

-- service_categories
DROP POLICY IF EXISTS "Authenticated users can view service_categories" ON service_categories;
DROP POLICY IF EXISTS "Admins can insert service_categories" ON service_categories;
DROP POLICY IF EXISTS "Admins can update service_categories" ON service_categories;
DROP POLICY IF EXISTS "Admins can delete service_categories" ON service_categories;

-- services
DROP POLICY IF EXISTS "Authenticated users can view services" ON services;
DROP POLICY IF EXISTS "Admins can insert services" ON services;
DROP POLICY IF EXISTS "Admins can update services" ON services;
DROP POLICY IF EXISTS "Admins can delete services" ON services;

-- appointments
DROP POLICY IF EXISTS "Authenticated users can view appointments" ON appointments;
DROP POLICY IF EXISTS "Authenticated users can insert appointments" ON appointments;
DROP POLICY IF EXISTS "Authenticated users can update appointments" ON appointments;
DROP POLICY IF EXISTS "Admins can delete appointments" ON appointments;

-- patients
DROP POLICY IF EXISTS "Authenticated users can view patients" ON patients;
DROP POLICY IF EXISTS "Authenticated users can insert patients" ON patients;
DROP POLICY IF EXISTS "Authenticated users can update patients" ON patients;
DROP POLICY IF EXISTS "Admins can delete patients" ON patients;

-- patient_tags
DROP POLICY IF EXISTS "Authenticated users can view patient_tags" ON patient_tags;
DROP POLICY IF EXISTS "Authenticated users can insert patient_tags" ON patient_tags;
DROP POLICY IF EXISTS "Authenticated users can delete patient_tags" ON patient_tags;

-- patient_payments
DROP POLICY IF EXISTS "Authenticated users can view patient_payments" ON patient_payments;
DROP POLICY IF EXISTS "Authenticated users can insert patient_payments" ON patient_payments;
DROP POLICY IF EXISTS "Authenticated users can update patient_payments" ON patient_payments;
DROP POLICY IF EXISTS "Admins can delete patient_payments" ON patient_payments;

-- schedule_blocks
DROP POLICY IF EXISTS "Authenticated users can manage schedule blocks" ON schedule_blocks;

-- global_variables
DROP POLICY IF EXISTS "Authenticated users can manage global variables" ON global_variables;

-- lookup_categories
DROP POLICY IF EXISTS "Authenticated users can view lookup_categories" ON lookup_categories;
DROP POLICY IF EXISTS "Admins can insert lookup_categories" ON lookup_categories;
DROP POLICY IF EXISTS "Admins can update lookup_categories" ON lookup_categories;
DROP POLICY IF EXISTS "Admins can delete lookup_categories" ON lookup_categories;

-- lookup_values
DROP POLICY IF EXISTS "Authenticated users can view lookup_values" ON lookup_values;
DROP POLICY IF EXISTS "Admins can insert lookup_values" ON lookup_values;
DROP POLICY IF EXISTS "Admins can update lookup_values" ON lookup_values;
DROP POLICY IF EXISTS "Admins can delete lookup_values" ON lookup_values;

-- =============================================
-- SECTION 8: Create NEW org-based RLS policies
-- =============================================

-- ---- user_profiles: members can view profiles in same org ----
CREATE POLICY "Members can view profiles in same org"
  ON user_profiles FOR SELECT
  USING (
    id IN (
      SELECT om2.user_id FROM organization_members om1
      JOIN organization_members om2 ON om1.organization_id = om2.organization_id
      WHERE om1.user_id = auth.uid()
    )
  );

-- ---- ADMIN-ONLY tables ----
-- offices
CREATE POLICY "org_select_offices" ON offices FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_insert_offices" ON offices FOR INSERT
  WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "org_update_offices" ON offices FOR UPDATE
  USING (is_org_admin(organization_id));
CREATE POLICY "org_delete_offices" ON offices FOR DELETE
  USING (is_org_admin(organization_id));

-- doctors
CREATE POLICY "org_select_doctors" ON doctors FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_insert_doctors" ON doctors FOR INSERT
  WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "org_update_doctors" ON doctors FOR UPDATE
  USING (is_org_admin(organization_id));
CREATE POLICY "org_delete_doctors" ON doctors FOR DELETE
  USING (is_org_admin(organization_id));

-- doctor_services
CREATE POLICY "org_select_doctor_services" ON doctor_services FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_insert_doctor_services" ON doctor_services FOR INSERT
  WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "org_delete_doctor_services" ON doctor_services FOR DELETE
  USING (is_org_admin(organization_id));

-- doctor_schedules
CREATE POLICY "org_select_doctor_schedules" ON doctor_schedules FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_insert_doctor_schedules" ON doctor_schedules FOR INSERT
  WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "org_update_doctor_schedules" ON doctor_schedules FOR UPDATE
  USING (is_org_admin(organization_id));
CREATE POLICY "org_delete_doctor_schedules" ON doctor_schedules FOR DELETE
  USING (is_org_admin(organization_id));

-- service_categories
CREATE POLICY "org_select_service_categories" ON service_categories FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_insert_service_categories" ON service_categories FOR INSERT
  WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "org_update_service_categories" ON service_categories FOR UPDATE
  USING (is_org_admin(organization_id));
CREATE POLICY "org_delete_service_categories" ON service_categories FOR DELETE
  USING (is_org_admin(organization_id));

-- services
CREATE POLICY "org_select_services" ON services FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_insert_services" ON services FOR INSERT
  WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "org_update_services" ON services FOR UPDATE
  USING (is_org_admin(organization_id));
CREATE POLICY "org_delete_services" ON services FOR DELETE
  USING (is_org_admin(organization_id));

-- lookup_categories
CREATE POLICY "org_select_lookup_categories" ON lookup_categories FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_insert_lookup_categories" ON lookup_categories FOR INSERT
  WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "org_update_lookup_categories" ON lookup_categories FOR UPDATE
  USING (is_org_admin(organization_id));
CREATE POLICY "org_delete_lookup_categories" ON lookup_categories FOR DELETE
  USING (is_org_admin(organization_id));

-- lookup_values
CREATE POLICY "org_select_lookup_values" ON lookup_values FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_insert_lookup_values" ON lookup_values FOR INSERT
  WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "org_update_lookup_values" ON lookup_values FOR UPDATE
  USING (is_org_admin(organization_id));
CREATE POLICY "org_delete_lookup_values" ON lookup_values FOR DELETE
  USING (is_org_admin(organization_id));

-- ---- GENERAL tables (all members can CRUD, admin deletes) ----
-- appointments
CREATE POLICY "org_select_appointments" ON appointments FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_insert_appointments" ON appointments FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_update_appointments" ON appointments FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_delete_appointments" ON appointments FOR DELETE
  USING (is_org_admin(organization_id));

-- patients
CREATE POLICY "org_select_patients" ON patients FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_insert_patients" ON patients FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_update_patients" ON patients FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_delete_patients" ON patients FOR DELETE
  USING (is_org_admin(organization_id));

-- patient_tags
CREATE POLICY "org_select_patient_tags" ON patient_tags FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_insert_patient_tags" ON patient_tags FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_delete_patient_tags" ON patient_tags FOR DELETE
  USING (organization_id IN (SELECT get_user_org_ids()));

-- patient_payments
CREATE POLICY "org_select_patient_payments" ON patient_payments FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_insert_patient_payments" ON patient_payments FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_update_patient_payments" ON patient_payments FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_delete_patient_payments" ON patient_payments FOR DELETE
  USING (is_org_admin(organization_id));

-- ---- OPEN tables (all members full access) ----
-- schedule_blocks
CREATE POLICY "org_select_schedule_blocks" ON schedule_blocks FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_insert_schedule_blocks" ON schedule_blocks FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_update_schedule_blocks" ON schedule_blocks FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_delete_schedule_blocks" ON schedule_blocks FOR DELETE
  USING (organization_id IN (SELECT get_user_org_ids()));

-- global_variables (admin-managed per org)
CREATE POLICY "org_select_global_variables" ON global_variables FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "org_insert_global_variables" ON global_variables FOR INSERT
  WITH CHECK (is_org_admin(organization_id));
CREATE POLICY "org_update_global_variables" ON global_variables FOR UPDATE
  USING (is_org_admin(organization_id));
CREATE POLICY "org_delete_global_variables" ON global_variables FOR DELETE
  USING (is_org_admin(organization_id));

-- =============================================
-- SECTION 9: Update auth trigger for multi-tenant
-- Auto-creates org + seeds default data on signup
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

  -- 2. Create organization
  org_name := COALESCE(NEW.raw_user_meta_data->>'org_name', 'Mi Clínica');
  new_org_id := gen_random_uuid();

  INSERT INTO public.organizations (id, name, slug)
  VALUES (new_org_id, org_name, new_org_id::text);

  -- 3. Make user the owner
  INSERT INTO public.organization_members (user_id, organization_id, role)
  VALUES (NEW.id, new_org_id, 'owner');

  -- 4. Seed global variables
  INSERT INTO public.global_variables (name, key, value, description, sort_order, organization_id) VALUES
    ('Nombre de la Clínica',    'clinic_name',         org_name,           'Nombre visible en reportes y documentos',   1, new_org_id),
    ('Teléfono de contacto',    'clinic_phone',        '+51 999 000 000',  'Teléfono principal de la clínica',          2, new_org_id),
    ('Correo de contacto',      'clinic_email',        'info@clinica.com', 'Email para notificaciones',                 3, new_org_id),
    ('Máx. citas por slot',     'max_appts_per_slot',  '1',                'Cantidad máxima de citas en el mismo slot', 4, new_org_id),
    ('Moneda',                  'currency_symbol',     'S/.',              'Símbolo monetario usado en reportes',       5, new_org_id);

  -- 5. Seed lookup categories
  INSERT INTO public.lookup_categories (id, slug, name, description, is_system, organization_id) VALUES
    (gen_random_uuid(), 'origin',             'Origen del Paciente', 'De dónde conoció al consultorio', true, new_org_id),
    (gen_random_uuid(), 'payment_method',     'Método de Pago',     'Formas de pago aceptadas',        true, new_org_id),
    (gen_random_uuid(), 'appointment_status', 'Estado de Cita',     'Estados posibles de una cita',    true, new_org_id),
    (gen_random_uuid(), 'responsible',        'Responsable',        'Personas responsables',           true, new_org_id);

  -- Get the IDs of the just-created categories
  SELECT id INTO cat_origin_id FROM public.lookup_categories
    WHERE slug = 'origin' AND organization_id = new_org_id;
  SELECT id INTO cat_payment_id FROM public.lookup_categories
    WHERE slug = 'payment_method' AND organization_id = new_org_id;
  SELECT id INTO cat_status_id FROM public.lookup_categories
    WHERE slug = 'appointment_status' AND organization_id = new_org_id;
  SELECT id INTO cat_responsible_id FROM public.lookup_categories
    WHERE slug = 'responsible' AND organization_id = new_org_id;

  -- 6. Seed lookup values
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

  -- 7. Seed default offices
  INSERT INTO public.offices (name, description, display_order, organization_id) VALUES
    ('Consultorio 1', 'Consultorio principal',  1, new_org_id),
    ('Consultorio 2', 'Consultorio secundario', 2, new_org_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- SECTION 10: Make AI function respect RLS
-- Change from SECURITY DEFINER to INVOKER so
-- queries are filtered by the caller's org
-- =============================================

CREATE OR REPLACE FUNCTION ai_readonly_query(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result json;
  normalized text;
BEGIN
  normalized := lower(trim(query));

  IF NOT (normalized LIKE 'select%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  IF normalized ~* '(insert|update|delete|drop|truncate|alter|create|replace|grant|revoke|execute|do\s+\$|pg_read_file|pg_ls_dir|copy\s)' THEN
    RAISE EXCEPTION 'Query contains forbidden operations';
  END IF;

  EXECUTE format('SELECT json_agg(row_to_json(t)) FROM (%s) t', query) INTO result;
  RETURN coalesce(result, '[]'::json);
END;
$$;
