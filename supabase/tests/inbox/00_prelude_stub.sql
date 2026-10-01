-- Stub mínimo para la 275 (solo lo que toca). La 206 se aplica real.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, organization_id uuid NOT NULL REFERENCES organizations(id),
  role text NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE patients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid);
-- Lo que mira el trigger de la 278 (la tabla real tiene muchas más columnas).
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL, patient_id uuid,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  appointment_date date NOT NULL DEFAULT current_date, arrived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION get_user_org_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid() $$;
CREATE OR REPLACE FUNCTION is_org_admin(org_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM organization_members WHERE user_id = auth.uid()
                  AND organization_id = org_id AND role IN ('owner','admin')) $$;
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT SELECT ON organizations, organization_members, patients TO authenticated;
GRANT ALL ON appointments TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
