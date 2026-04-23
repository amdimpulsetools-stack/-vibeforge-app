-- =============================================
-- MIGRATION 099: Treatment plan items + links
-- =============================================
-- Turns treatment_plans into multi-service budgets:
--
--   1. treatment_plan_items (new table): líneas del plan, cada una
--      con servicio + cantidad + precio unitario. El total_budget
--      se computa como SUM(quantity * unit_price).
--
--   2. treatment_sessions gana service_id + session_price + item FK,
--      así cada sesión conoce su servicio y precio snapshot. Si el
--      doctor edita el precio del item después, las sesiones ya
--      completadas mantienen su snapshot histórico.
--
--   3. appointments.treatment_session_id (nullable) permite vincular
--      una cita a una sesión específica del plan desde el scheduler.
--
--   4. patient_payments.treatment_plan_id (nullable) permite
--      anticipos al plan (sin cita asociada). Modelo contable:
--        saldo_plan = SUM(payments del plan)
--                   - SUM(session_price de sesiones completadas)
--
-- TODO LO AÑADIDO ES NULLABLE O CON DEFAULT. El flujo normal de
-- citas sueltas y pagos por cita sigue funcionando idéntico.

-- ── 1. treatment_plan_items ─────────────────────────────────
CREATE TABLE IF NOT EXISTS treatment_plan_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_plan_id uuid NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_id        uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  quantity          integer NOT NULL CHECK (quantity > 0),
  unit_price        numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  display_order     integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE treatment_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "treatment_plan_items_select" ON treatment_plan_items
  FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "treatment_plan_items_insert" ON treatment_plan_items
  FOR INSERT WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "treatment_plan_items_update" ON treatment_plan_items
  FOR UPDATE USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "treatment_plan_items_delete" ON treatment_plan_items
  FOR DELETE USING (organization_id IN (SELECT get_user_org_ids()));

CREATE INDEX IF NOT EXISTS idx_tpi_plan    ON treatment_plan_items(treatment_plan_id);
CREATE INDEX IF NOT EXISTS idx_tpi_service ON treatment_plan_items(service_id);
CREATE INDEX IF NOT EXISTS idx_tpi_org     ON treatment_plan_items(organization_id);

-- ── 2. treatment_sessions: qué servicio y a qué precio ────────
ALTER TABLE treatment_sessions
  ADD COLUMN IF NOT EXISTS service_id             uuid REFERENCES services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_price          numeric(10,2),
  ADD COLUMN IF NOT EXISTS treatment_plan_item_id uuid REFERENCES treatment_plan_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ts_service ON treatment_sessions(service_id);
CREATE INDEX IF NOT EXISTS idx_ts_item    ON treatment_sessions(treatment_plan_item_id);

-- ── 3. appointments ← treatment_sessions ─────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS treatment_session_id uuid REFERENCES treatment_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appt_session
  ON appointments(treatment_session_id)
  WHERE treatment_session_id IS NOT NULL;

-- ── 4. patient_payments → treatment_plans (anticipos) ────────
ALTER TABLE patient_payments
  ADD COLUMN IF NOT EXISTS treatment_plan_id uuid REFERENCES treatment_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_plan
  ON patient_payments(treatment_plan_id)
  WHERE treatment_plan_id IS NOT NULL;
