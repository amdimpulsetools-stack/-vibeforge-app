-- Stub del esquema previo: solo lo que las migraciones 209..217 tocan.
-- No pretende ser producción; pretende que los invariantes se puedan probar.

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);

-- auth.uid() de prueba: se fija con SET test.uid = '<uuid>'.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid REFERENCES auth.users(id)
);

CREATE TABLE user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text
);

CREATE TABLE organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text
);

CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name text,
  last_name text
);

CREATE TABLE service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text,
  base_price numeric(10,2) DEFAULT 0
);

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  appointment_date date,
  status text DEFAULT 'scheduled'
);

CREATE TABLE patient_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text,
  notes text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE einvoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE einvoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  einvoice_id uuid REFERENCES einvoices(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL
);

CREATE TABLE addons (
  key text PRIMARY KEY,
  name text,
  description text,
  category text,
  icon text,
  is_premium boolean DEFAULT false,
  min_plan text,
  sort_order int,
  is_active boolean DEFAULT true,
  monthly_price numeric(10,2),
  included_from_plan text
);

CREATE TABLE organization_addons (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  addon_key text NOT NULL REFERENCES addons(key) ON DELETE CASCADE,
  enabled boolean DEFAULT true,
  settings jsonb DEFAULT '{}',
  activated_at timestamptz DEFAULT now(),
  activated_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (organization_id, addon_key)
);

CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF uuid AS $$
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_org_admin(org_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
     WHERE user_id = auth.uid() AND organization_id = org_id
       AND role IN ('owner','admin')
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Roles que las migraciones mencionan en GRANT/REVOKE.
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
