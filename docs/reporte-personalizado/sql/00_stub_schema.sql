-- Stub mínimo del esquema de producción: SOLO las columnas que tocan
-- get_reports_overview (mig 251) y get_custom_report (borrador).
-- Tipos y CHECKs copiados de las migraciones reales (008, 007, 004, 011,
-- 100, 099, 213, 216, 242, 214, 235, 240, 091). No pretende ser prod.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);

-- auth.uid() de prueba: SET test.uid = '<uuid>' (mismo truco que
-- supabase/tests/pharmacy/00_prelude_stub.sql).
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;

DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Lima'          -- mig 240
);

CREATE TABLE organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  role text NOT NULL DEFAULT 'member',
  is_active boolean NOT NULL DEFAULT true,
  is_fertility_advisor boolean NOT NULL DEFAULT false
);

-- mig 235 (verbatim)
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
  SELECT organization_id FROM organization_members
  WHERE user_id = auth.uid() AND is_active = true
$$;
CREATE OR REPLACE FUNCTION is_org_admin(org_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND organization_id = org_id
      AND role IN ('owner','admin') AND is_active = true)
$$;
CREATE OR REPLACE FUNCTION get_user_org_role(org_id UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
  SELECT role FROM organization_members
  WHERE user_id = auth.uid() AND organization_id = org_id AND is_active = true
  LIMIT 1
$$;

CREATE TABLE addons (key text PRIMARY KEY, name text);
CREATE TABLE organization_addons (                        -- mig 091
  organization_id uuid NOT NULL REFERENCES organizations(id),
  addon_key text NOT NULL REFERENCES addons(key),
  enabled boolean DEFAULT true,
  PRIMARY KEY (organization_id, addon_key)
);

CREATE TABLE doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  full_name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  user_id uuid REFERENCES auth.users(id),
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE offices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, name text);
CREATE TABLE patients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, first_name text, last_name text);

CREATE TABLE services (                                   -- mig 004 + 108 + 239
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  base_price numeric(10,2) NOT NULL DEFAULT 0,
  igv_affectation smallint DEFAULT 1,
  is_bookable boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE appointments (                               -- mig 007 + 011 + 019 + 100
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  patient_id uuid REFERENCES patients(id),
  doctor_id uuid REFERENCES doctors(id),
  office_id uuid REFERENCES offices(id),
  service_id uuid REFERENCES services(id),
  appointment_date date NOT NULL,
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '09:30',
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  price_snapshot numeric(10,2),
  discount_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  notes text
);
CREATE INDEX idx_appointments_org_date ON appointments (organization_id, appointment_date);

CREATE TABLE treatment_plans (                            -- mig 053
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL, patient_id uuid, title text NOT NULL
);

CREATE TABLE treatments (                                 -- mig 242 (recorte)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  patient_id uuid NOT NULL,
  doctor_id uuid,
  treatment_type text NOT NULL,
  title text NOT NULL,
  expected_total numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress'
);
CREATE TABLE treatment_payment_concepts (                 -- mig 242
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  key text NOT NULL, label text NOT NULL,
  revenue_bucket text NOT NULL CHECK (revenue_bucket IN ('honorarium','general','third_party')),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, key)
);

CREATE TABLE cash_shifts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, status text NOT NULL DEFAULT 'open');

CREATE TABLE patient_payments (                           -- mig 008 + 013 + 099 + 213 + 242
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  patient_id uuid REFERENCES patients(id),
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  treatment_plan_id uuid REFERENCES treatment_plans(id) ON DELETE SET NULL,
  treatment_id uuid REFERENCES treatments(id) ON DELETE RESTRICT,
  treatment_concept_id uuid REFERENCES treatment_payment_concepts(id) ON DELETE RESTRICT,
  revenue_bucket text CHECK (revenue_bucket IS NULL OR revenue_bucket IN ('honorarium','general','third_party')),
  amount numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text,
  notes text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'clinical' CHECK (source IN ('clinical','pos')),
  cash_shift_id uuid REFERENCES cash_shifts(id),
  sale_id uuid,
  tender_kind text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_payments_single_container_chk
    CHECK (treatment_id IS NULL OR (appointment_id IS NULL AND treatment_plan_id IS NULL)),
  CONSTRAINT patient_payments_treatment_concept_chk
    CHECK (treatment_id IS NULL OR treatment_concept_id IS NOT NULL)
);
CREATE INDEX idx_patient_payments_org_date ON patient_payments (organization_id, payment_date);   -- mig 057
CREATE INDEX idx_patient_payments_appt_amt ON patient_payments (appointment_id) INCLUDE (amount); -- mig 103

CREATE TABLE cash_movements (                             -- mig 214 (recorte)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  shift_id uuid NOT NULL REFERENCES cash_shifts(id),
  movement_type text NOT NULL CHECK (movement_type IN ('ingreso','reposicion','egreso','sangria','devolucion')),
  amount numeric(12,2) NOT NULL CHECK (amount <> 0),
  tender_kind text NOT NULL DEFAULT 'efectivo',
  reason_code text,
  notes text,
  patient_id uuid,
  payment_id uuid REFERENCES patient_payments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL, name text NOT NULL, sale_price numeric(10,2) NOT NULL DEFAULT 0,
  igv_affectation smallint NOT NULL DEFAULT 1
);

CREATE TABLE pharmacy_sales (                             -- mig 216 + 232 (recorte)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  sale_number bigint,
  status text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','confirmada','anulada')),
  patient_id uuid, appointment_id uuid,
  total numeric(12,2) NOT NULL DEFAULT 0,
  payment_id uuid REFERENCES patient_payments(id) ON DELETE SET NULL,
  sale_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Lima')::date),
  void_reason text,
  CONSTRAINT pharmacy_sales_id_org_uniq UNIQUE (id, organization_id)
);

-- Líneas: aritmética GENERATED copiada VERBATIM de la mig 216.
CREATE TABLE pharmacy_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  position int NOT NULL DEFAULT 1,
  product_id uuid REFERENCES inventory_products(id),
  service_id uuid REFERENCES services(id),
  description text NOT NULL CHECK (btrim(description) <> ''),
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  line_discount numeric(12,2) NOT NULL DEFAULT 0 CHECK (line_discount >= 0),
  igv_affectation smallint NOT NULL DEFAULT 1,
  line_gross    numeric(12,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
  line_total    numeric(12,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2) - line_discount) STORED,
  line_subtotal numeric(12,2) GENERATED ALWAYS AS (
                  CASE WHEN igv_affectation = 1
                    THEN round((round(quantity * unit_price, 2) - line_discount) / 1.18, 2)
                    ELSE round(quantity * unit_price, 2) - line_discount END) STORED,
  line_igv      numeric(12,2) GENERATED ALWAYS AS (
                  CASE WHEN igv_affectation = 1
                    THEN (round(quantity * unit_price, 2) - line_discount)
                         - round((round(quantity * unit_price, 2) - line_discount) / 1.18, 2)
                    ELSE 0 END) STORED,
  CONSTRAINT ph_item_kind_chk CHECK (num_nonnulls(product_id, service_id) = 1),
  CONSTRAINT pharmacy_sale_items_sale_fk FOREIGN KEY (sale_id, organization_id)
    REFERENCES pharmacy_sales (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX idx_pharmacy_sale_items_sale ON pharmacy_sale_items (sale_id, position);
