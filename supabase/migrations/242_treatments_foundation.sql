-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- ═══════════════════════════════════════════════════════════════════
-- 242: Módulo TRATAMIENTOS (addon fertilidad) — cimientos
--
-- Origen: feedback de la Dra. Patricia (2026-09-02). Una FIV se cobra por
-- fases, puede abandonarse y parte de lo cobrado va a terceros. Agendarla
-- como cita de S/ 20 000 inflaba la deuda pendiente. Evaluación previa por
-- 4 agentes (COMING-UPDATES.md → "Módulo Tratamientos").
--
-- Decisiones de diseño (todas con precedente en el repo):
--   · Tabla NUEVA `treatments`, no `treatment_plans`: el plan es el modelo
--     acoplado a citas/sesiones (099) y su saldo es "pagado − consumido";
--     un FIV sin sesiones mostraría todo lo pagado como crédito.
--   · Los pagos van en `patient_payments` — JAMÁS una tabla aparte: Caja
--     (trigger 213/226), ingresos del dashboard (233), devoluciones (230) y
--     facturación (108) cuelgan de esa tabla. Solo se añade `treatment_id`
--     + concepto. Un cobro vive en UN solo contenedor (cita XOR plan XOR
--     tratamiento) — CHECK abajo.
--   · `source` sigue siendo 'clinical': es plata clínica; cuenta en
--     "Ingresos", en "Mis cobros" de recepción y en el arqueo. La deuda de
--     CITAS lo excluye por `treatment_id` (mig 243), no por source.
--   · Concepto por pago desde un catálogo por org con `revenue_bucket`
--     (honorario / general / tercero). La clasificación la fija la dueña
--     una vez; recepción solo elige el concepto. Snapshot en el pago
--     (patrón session_price 099 / unit_cost 216): reclasificar el catálogo
--     no reescribe la historia.
--   · Pagos DIRECTOS a terceros (la paciente le paga al laboratorio): tabla
--     informativa `treatment_external_payments`, sin dinero para la
--     clínica — no toca patient_payments, Caja ni comprobantes.
--   · Puente 1:1 con el presupuesto: `budget_records.acceptance_status =
--     'in_progress'` ⇔ existe tratamiento (RPC en mig 245).
--   · Sin policy de DELETE para miembros (append-only como budget_records);
--     admin puede borrar un tratamiento vacío.
--
-- Aditiva e idempotente. Rollback: rollbacks/242_treatments_foundation_rollback.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. treatments ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS treatments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  -- Puente con el presupuesto. Nullable: un tratamiento puede nacer sin
  -- presupuesto (org con pricing 'single' o sin embudo) — decisión de
  -- producto, no técnica.
  budget_record_id    UUID REFERENCES budget_records(id) ON DELETE SET NULL,
  doctor_id           UUID REFERENCES doctors(id) ON DELETE SET NULL,
  assistant_member_id UUID REFERENCES organization_members(id) ON DELETE SET NULL,
  service_id          UUID REFERENCES services(id) ON DELETE SET NULL,
  -- Mismo vocabulario que budget_records.treatment_type (mig 180).
  treatment_type      TEXT NOT NULL,
  title               TEXT NOT NULL,
  -- Monto ACORDADO (bruto, como se cobra). Snapshot de budget.amount.
  expected_total      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (expected_total >= 0),
  status              TEXT NOT NULL DEFAULT 'in_progress'
                      CHECK (status IN ('in_progress','completed','abandoned','cancelled')),
  outcome             TEXT CHECK (outcome IS NULL OR outcome IN
                      ('pregnancy','no_pregnancy','abandoned','transferred','other')),
  outcome_reason      TEXT,
  external_receipt_ref TEXT,
  started_at          DATE NOT NULL DEFAULT CURRENT_DATE,
  started_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at           DATE,
  closed_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT treatments_treatment_type_chk CHECK (treatment_type IN
    ('FIV','IIU','INDUCCION','CRIO','OVODONACION','ROPA','TED','DUOSTIM','OTRO')),
  -- Abierto ⇒ sin cierre ni desenlace; cerrado ⇒ con fecha de cierre.
  CONSTRAINT treatments_closed_consistency_chk CHECK (
    (status = 'in_progress' AND closed_at IS NULL AND outcome IS NULL)
    OR (status <> 'in_progress' AND closed_at IS NOT NULL)
  )
);

-- Un presupuesto inicia como máximo UN tratamiento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_treatments_budget
  ON treatments(budget_record_id) WHERE budget_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_treatments_org_status
  ON treatments(organization_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_treatments_patient ON treatments(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatments_doctor
  ON treatments(doctor_id) WHERE doctor_id IS NOT NULL;

ALTER TABLE treatments ENABLE ROW LEVEL SECURITY;

-- Miembros ACTIVOS de la org (get_user_org_ids exige is_active desde la
-- 235). Las transiciones con impacto financiero (iniciar/cerrar) van por
-- RPC con gating de rol (mig 245); aquí solo lectura + notas.
DROP POLICY IF EXISTS treatments_select ON treatments;
CREATE POLICY treatments_select ON treatments FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids()));
DROP POLICY IF EXISTS treatments_insert ON treatments;
CREATE POLICY treatments_insert ON treatments FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
DROP POLICY IF EXISTS treatments_update ON treatments;
CREATE POLICY treatments_update ON treatments FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids()))
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
DROP POLICY IF EXISTS treatments_delete ON treatments;
CREATE POLICY treatments_delete ON treatments FOR DELETE TO authenticated
  USING (is_org_admin(organization_id));

DROP TRIGGER IF EXISTS set_updated_at_treatments ON treatments;
CREATE TRIGGER set_updated_at_treatments
  BEFORE UPDATE ON treatments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE treatments IS
  'Mig 242: tratamiento en ejecución (addon fertilidad). expected_total = monto acordado bruto. Dinero cobrado = patient_payments.treatment_id (clínica); pagos directos a terceros = treatment_external_payments.';

-- ── 2. Catálogo de conceptos de pago por org ─────────────────────────
CREATE TABLE IF NOT EXISTS treatment_payment_concepts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  label           TEXT NOT NULL,
  -- honorarium = honorarios del médico; general = clínica; third_party =
  -- corresponde a terceros (laboratorio, anestesia, medicación externa).
  -- NO decide IGV: la afectación viene del servicio del tratamiento
  -- (services.igv_affectation) salvo override explícito aquí.
  revenue_bucket  TEXT NOT NULL CHECK (revenue_bucket IN ('honorarium','general','third_party')),
  igv_affectation SMALLINT CHECK (igv_affectation IS NULL OR igv_affectation IN (1,8,9,12,16,17,20)),
  display_order   INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

ALTER TABLE treatment_payment_concepts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tpc_select ON treatment_payment_concepts;
CREATE POLICY tpc_select ON treatment_payment_concepts FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids()));
DROP POLICY IF EXISTS tpc_insert ON treatment_payment_concepts;
CREATE POLICY tpc_insert ON treatment_payment_concepts FOR INSERT TO authenticated
  WITH CHECK (is_org_admin(organization_id));
DROP POLICY IF EXISTS tpc_update ON treatment_payment_concepts;
CREATE POLICY tpc_update ON treatment_payment_concepts FOR UPDATE TO authenticated
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));
DROP POLICY IF EXISTS tpc_delete ON treatment_payment_concepts;
CREATE POLICY tpc_delete ON treatment_payment_concepts FOR DELETE TO authenticated
  USING (is_org_admin(organization_id));

COMMENT ON TABLE treatment_payment_concepts IS
  'Mig 242: conceptos de pago de tratamiento por org. revenue_bucket clasifica el cobro (honorario/general/tercero); la afectación IGV se hereda del servicio salvo override.';

-- Seed idempotente. Derivado de las líneas que ya itemizan las plantillas
-- de presupuesto (lib/budget-pdf/patricia/data/fiv.ts): honorarios vs el
-- resto. Editable después desde Admin.
-- SECURITY DEFINER con GRANT a authenticated: sin este guard cualquier
-- usuario logueado podía sembrar el catálogo de OTRA org conociendo su id.
-- auth.uid() NULL = migración / service_role (el backfill de abajo).
CREATE OR REPLACE FUNCTION seed_treatment_payment_concepts(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO treatment_payment_concepts (organization_id, key, label, revenue_bucket, display_order)
  VALUES
    (p_org_id, 'consulta_estimulacion',    'Consulta / estimulación',       'general',     10),
    (p_org_id, 'medicacion',               'Medicación',                    'third_party', 20),
    (p_org_id, 'honorarios_aspiracion',    'Honorarios — aspiración',       'honorarium',  30),
    (p_org_id, 'laboratorio',              'Laboratorio / embriología',     'third_party', 40),
    (p_org_id, 'vitrificacion',            'Vitrificación',                 'third_party', 50),
    (p_org_id, 'honorarios_transferencia', 'Honorarios — transferencia',    'honorarium',  60),
    (p_org_id, 'control_endometrial',      'Control endometrial',           'general',     70),
    (p_org_id, 'anestesia',                'Anestesia',                     'third_party', 80),
    (p_org_id, 'a_cuenta',                 'A cuenta (sin detalle)',        'general',     90),
    (p_org_id, 'otro',                     'Otro',                          'general',     100)
  ON CONFLICT (organization_id, key) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION seed_treatment_payment_concepts(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seed_treatment_payment_concepts(UUID) TO authenticated, service_role;

-- Backfill: toda org con el addon de fertilidad habilitado.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT organization_id FROM organization_addons
    WHERE addon_key IN ('fertility_basic','fertility_premium') AND enabled = true
  LOOP
    PERFORM seed_treatment_payment_concepts(r.organization_id);
  END LOOP;
END $$;

-- ── 3. patient_payments → tratamiento + concepto ─────────────────────
-- ON DELETE RESTRICT (no SET NULL): un pago que perdiera su treatment_id
-- pasaría a contar como cobro de CITAS (mig 243 filtra por treatment_id
-- IS NULL) — S/ 8 000 de un FIV borrado "pagarían" ecografías. Un
-- tratamiento con cobros no se borra; uno vacío sí (policy admin arriba).
-- El concepto tampoco: patient_payments_treatment_concept_chk exige
-- concepto en todo pago de tratamiento (desactivar con is_active=false).
ALTER TABLE patient_payments
  ADD COLUMN IF NOT EXISTS treatment_id UUID REFERENCES treatments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS treatment_concept_id UUID REFERENCES treatment_payment_concepts(id) ON DELETE RESTRICT,
  -- Snapshot del bucket al momento del cobro (no cambia si se reclasifica).
  ADD COLUMN IF NOT EXISTS revenue_bucket TEXT
    CHECK (revenue_bucket IS NULL OR revenue_bucket IN ('honorarium','general','third_party')),
  -- Comprobante emitido FUERA de Yenda (org que factura con otro sistema).
  ADD COLUMN IF NOT EXISTS external_receipt_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_treatment
  ON patient_payments(treatment_id) WHERE treatment_id IS NOT NULL;

-- Un cobro vive en UN solo contenedor: cita XOR plan XOR tratamiento.
DO $$ BEGIN
  ALTER TABLE patient_payments ADD CONSTRAINT patient_payments_single_container_chk
    CHECK (treatment_id IS NULL OR (appointment_id IS NULL AND treatment_plan_id IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un pago de tratamiento siempre lleva concepto (fuera de tratamientos la
-- regla es inerte: concepto NULL).
DO $$ BEGIN
  ALTER TABLE patient_payments ADD CONSTRAINT patient_payments_treatment_concept_chk
    CHECK (treatment_id IS NULL OR treatment_concept_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN patient_payments.treatment_id IS
  'Mig 242: cobro de un tratamiento (addon fertilidad). source sigue ''clinical'' (cuenta en Ingresos, Caja y Mis cobros); la deuda de CITAS lo excluye (mig 243).';
COMMENT ON COLUMN patient_payments.revenue_bucket IS
  'Mig 242: snapshot del revenue_bucket del concepto al cobrar (honorarium/general/third_party). Solo informativo para el módulo Tratamientos; nunca altera amount.';

-- Estampa el snapshot y valida que el concepto sea de la misma org. BEFORE
-- INSERT, independiente de caja_stamp_payment (213) que también es BEFORE.
CREATE OR REPLACE FUNCTION treatments_stamp_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bucket TEXT;
  v_org    UUID;
BEGIN
  IF NEW.treatment_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- La org del pago debe ser la del tratamiento.
  SELECT organization_id INTO v_org FROM treatments WHERE id = NEW.treatment_id;
  IF v_org IS NULL OR v_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'El tratamiento no pertenece a la organización del pago.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.treatment_concept_id IS NOT NULL THEN
    SELECT revenue_bucket INTO v_bucket
      FROM treatment_payment_concepts
     WHERE id = NEW.treatment_concept_id AND organization_id = NEW.organization_id;
    IF v_bucket IS NULL THEN
      RAISE EXCEPTION 'Concepto de pago inválido para esta organización.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.revenue_bucket IS NULL THEN
      NEW.revenue_bucket := v_bucket;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_patient_payments_treatment_stamp ON patient_payments;
CREATE TRIGGER trg_patient_payments_treatment_stamp
  BEFORE INSERT ON patient_payments
  FOR EACH ROW EXECUTE FUNCTION treatments_stamp_payment();

-- ── 4. Pagos directos a terceros (informativos, sin dinero) ──────────
CREATE TABLE IF NOT EXISTS treatment_external_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  treatment_id    UUID NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
  concept_id      UUID REFERENCES treatment_payment_concepts(id) ON DELETE SET NULL,
  -- Monto que la paciente pagó DIRECTO al tercero. Cubre parte del
  -- acordado, pero NO es cobro de la clínica.
  amount          NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payee_name      TEXT,
  paid_on         DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tep_treatment ON treatment_external_payments(treatment_id);

ALTER TABLE treatment_external_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tep_select ON treatment_external_payments;
CREATE POLICY tep_select ON treatment_external_payments FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids()));
DROP POLICY IF EXISTS tep_insert ON treatment_external_payments;
CREATE POLICY tep_insert ON treatment_external_payments FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
DROP POLICY IF EXISTS tep_update ON treatment_external_payments;
CREATE POLICY tep_update ON treatment_external_payments FOR UPDATE TO authenticated
  USING (is_org_admin(organization_id));
DROP POLICY IF EXISTS tep_delete ON treatment_external_payments;
CREATE POLICY tep_delete ON treatment_external_payments FOR DELETE TO authenticated
  USING (is_org_admin(organization_id));

COMMENT ON TABLE treatment_external_payments IS
  'Mig 242: pagos que la paciente hizo DIRECTAMENTE a un tercero (laboratorio, anestesiólogo). Informativos: no son cobro de la clínica, no tocan Ingresos, Caja ni comprobantes; solo cubren parte del acordado del tratamiento.';

-- ── 5. Seguimientos: origen polimórfico + 'treatment' (mig 184) ──────
ALTER TABLE clinical_followups DROP CONSTRAINT IF EXISTS clinical_followups_source_type_check;
ALTER TABLE clinical_followups ADD CONSTRAINT clinical_followups_source_type_check
  CHECK (
    source_type IS NULL
    OR source_type IN (
      'appointment','clinical_note','treatment_plan','treatment_session',
      'budget_record','manual','treatment'
    )
  );

-- Cierre automático de seguimientos al cerrar el tratamiento (patrón 188).
CREATE OR REPLACE FUNCTION close_followups_on_treatment_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE clinical_followups cf
  SET status         = 'cerrado_manual',
      closure_reason = 'treatment_' || NEW.status,
      closed_at      = now(),
      is_resolved    = true,
      resolved_at    = now()
  WHERE cf.organization_id = NEW.organization_id
    AND cf.status IN ('pendiente', 'contactado', 'pospuesto')
    AND cf.source_type = 'treatment'
    AND cf.source_id = NEW.id;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'close_followups_on_treatment_close failed for treatment=% org=% status=%: % / %',
      NEW.id, NEW.organization_id, NEW.status, SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_treatments_close_followups ON treatments;
CREATE TRIGGER trg_treatments_close_followups
  AFTER UPDATE ON treatments
  FOR EACH ROW
  WHEN (NEW.status <> 'in_progress' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION close_followups_on_treatment_close();

-- ── Verificación sugerida ────────────────────────────────────────────
-- SELECT count(*) FROM pg_policies WHERE tablename IN ('treatments','treatment_payment_concepts','treatment_external_payments');  → 12
-- SELECT conname FROM pg_constraint WHERE conname IN ('patient_payments_single_container_chk','patient_payments_treatment_concept_chk');  → 2 filas
-- SELECT organization_id, count(*) FROM treatment_payment_concepts GROUP BY 1;  → 10 por org con addon fertilidad
