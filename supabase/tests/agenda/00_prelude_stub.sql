-- Stub mínimo del esquema que toca la mig 273 (solo columnas usadas).
-- No pretende ser producción: pretende que los invariantes se puedan
-- probar. Tipos, CHECKs, políticas RLS y los triggers ajenos que
-- interactúan con la 273 están copiados de producción (pg_get_*def,
-- pg_policies, 29-sep-2026).

-- ── auth ────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);

-- auth.uid() de prueba: se fija con SET test.uid = '<uuid>'.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;

DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ── Organización y membresía ───────────────────────────────────────
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  owner_id uuid REFERENCES auth.users(id),
  timezone text NOT NULL DEFAULT 'America/Lima'
);
CREATE TABLE organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  is_active boolean NOT NULL DEFAULT true
);

CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT organization_id FROM organization_members
   WHERE user_id = auth.uid() AND is_active = true
$$;
CREATE OR REPLACE FUNCTION is_org_admin(org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM organization_members
                  WHERE user_id = auth.uid() AND organization_id = org_id
                    AND role IN ('owner','admin') AND is_active)
$$;

-- ── Catálogos ──────────────────────────────────────────────────────
CREATE TABLE patients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid);
CREATE TABLE doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  full_name text NOT NULL DEFAULT 'Doctor'
);
CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  name text NOT NULL
);

-- ── Citas ──────────────────────────────────────────────────────────
CREATE TABLE einvoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_id uuid,
  doc_type smallint NOT NULL DEFAULT 2,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN
    ('draft','sending','accepted','rejected','cancelling','cancelled','error')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER set_updated_at_einvoices BEFORE UPDATE ON einvoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  doctor_id uuid REFERENCES doctors(id),
  service_id uuid REFERENCES services(id),
  appointment_date date NOT NULL,
  start_time time NOT NULL DEFAULT '10:30',
  end_time time NOT NULL DEFAULT '11:00',
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  notes text,
  einvoice_id uuid REFERENCES einvoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE einvoices ADD CONSTRAINT einvoices_appointment_id_fkey
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;
-- Mismo nombre que producción: la 273 debe ordenar bien a su lado.
CREATE TRIGGER set_updated_at_appointments BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Seguimientos (columnas de producción que la 273 usa) ───────────
CREATE TABLE clinical_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES doctors(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'green' CHECK (priority IN ('red','yellow','green')),
  reason text NOT NULL,
  follow_up_date date,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','rule','system')),
  rule_key text,
  target_category_canonical text,
  expected_by timestamptz,
  contact_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  closure_reason text,
  closed_at timestamptz,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','contactado',
    'agendado_via_contacto','agendado_organico_dentro_ventana','pospuesto',
    'desistido_silencioso','vencido','cerrado_manual')),
  source_type text CHECK (source_type IS NULL OR source_type IN ('appointment','clinical_note',
    'treatment_plan','treatment_session','budget_record','manual','treatment')),
  source_id uuid
);

-- Copia literal de producción (sync_followup_state_generations).
CREATE OR REPLACE FUNCTION sync_followup_state_generations()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_status_changed   BOOLEAN := NEW.status IS DISTINCT FROM OLD.status;
  v_resolved_changed BOOLEAN := NEW.is_resolved IS DISTINCT FROM OLD.is_resolved;
BEGIN
  IF v_status_changed AND NOT v_resolved_changed THEN
    IF NEW.status IN ('agendado_via_contacto','agendado_organico_dentro_ventana',
                      'desistido_silencioso','vencido','cerrado_manual') THEN
      NEW.is_resolved := true;
      NEW.resolved_at := COALESCE(NEW.closed_at, now());
    ELSIF NEW.status IN ('pendiente', 'contactado', 'pospuesto') THEN
      NEW.is_resolved := false;
      NEW.resolved_at := NULL;
    END IF;
  ELSIF v_resolved_changed AND NOT v_status_changed THEN
    IF NEW.is_resolved IS TRUE THEN
      NEW.status := 'cerrado_manual';
      NEW.closed_at := COALESCE(NEW.closed_at, NEW.resolved_at, now());
    ELSE
      NEW.status := 'pendiente';
      NEW.closed_at := NULL;
      NEW.closure_reason := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_clinical_followups_state_sync BEFORE UPDATE ON clinical_followups
  FOR EACH ROW EXECUTE FUNCTION sync_followup_state_generations();

-- ── Caja y pagos ───────────────────────────────────────────────────
CREATE TABLE cash_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  opened_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))
);

CREATE TABLE patient_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  payment_method text,
  tender_kind text,
  notes text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'clinical' CHECK (source IN ('clinical','pos')),
  cash_shift_id uuid REFERENCES cash_shifts(id) ON DELETE RESTRICT,
  treatment_id uuid,
  treatment_plan_id uuid,
  einvoice_id uuid REFERENCES einvoices(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- mig 242: un cobro vive en UN solo contenedor.
  CONSTRAINT patient_payments_single_container_chk
    CHECK (treatment_id IS NULL OR (appointment_id IS NULL AND treatment_plan_id IS NULL))
);

-- Copia literal de producción (caja_protect_closed_shift, mig 213).
CREATE OR REPLACE FUNCTION caja_protect_closed_shift()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_status text;
BEGIN
  IF OLD.cash_shift_id IS NOT NULL THEN
    SELECT status INTO v_status FROM cash_shifts WHERE id = OLD.cash_shift_id;
  END IF;
  IF v_status IS DISTINCT FROM 'closed' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Este pago pertenece a una caja ya cerrada y no se puede eliminar.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.amount         IS DISTINCT FROM OLD.amount
  OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
  OR NEW.tender_kind    IS DISTINCT FROM OLD.tender_kind
  OR NEW.payment_date   IS DISTINCT FROM OLD.payment_date
  OR NEW.cash_shift_id  IS DISTINCT FROM OLD.cash_shift_id THEN
    RAISE EXCEPTION 'Este pago pertenece a una caja ya cerrada: no se puede cambiar el monto, el método, la fecha ni el turno.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER trg_patient_payments_protect_shift
  BEFORE UPDATE OR DELETE ON patient_payments
  FOR EACH ROW EXECUTE FUNCTION caja_protect_closed_shift();

CREATE TABLE cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES cash_shifts(id),
  movement_type text NOT NULL CHECK (movement_type IN ('ingreso','reposicion','egreso','sangria','devolucion')),
  amount numeric NOT NULL,
  patient_id uuid,
  payment_id uuid REFERENCES patient_payments(id) ON DELETE SET NULL,
  created_by uuid
);

-- ── RLS (predicados de producción) ─────────────────────────────────
ALTER TABLE organizations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE services           ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE einvoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements     ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_select_organizations ON organizations FOR SELECT
  USING (owner_id = auth.uid() OR id IN (SELECT get_user_org_ids()));
CREATE POLICY org_select_doctors ON doctors FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY org_select_services ON services FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY org_select_appointments ON appointments FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY org_insert_appointments ON appointments FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY org_update_appointments ON appointments FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY clinical_followups_select ON clinical_followups FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY clinical_followups_insert ON clinical_followups FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY clinical_followups_update ON clinical_followups FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY org_select_patient_payments ON patient_payments FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY org_insert_patient_payments ON patient_payments FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY org_update_patient_payments ON patient_payments FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY einvoices_select ON einvoices FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY einvoices_update ON einvoices FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()));

-- Recepción solo ve los movimientos de SU turno (o todo si es admin).
CREATE POLICY cash_movements_select ON cash_movements FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids())
         AND (is_org_admin(organization_id)
              OR EXISTS (SELECT 1 FROM cash_shifts s
                          WHERE s.id = cash_movements.shift_id AND s.opened_by = auth.uid())));

-- Privilegios de tabla que en Supabase trae `authenticated`.
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
